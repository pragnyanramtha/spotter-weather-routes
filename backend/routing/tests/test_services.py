from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import httpx
from django.core.cache import cache
from django.test import SimpleTestCase
from routing.providers import ProviderError, fetch_json, get_routes, get_weather, parse_weather, search_places, _weather_batch
from routing.planner import at_hour, make_plan
from routing.tests.test_domain import NOW, inputs, road


def forecast():
    return {'hourly_units': {'wind_speed_10m': 'mp/h', 'rain': 'inch', 'showers': 'inch', 'snowfall': 'cm'},
            'hourly': {'time': ['2026-11-05T12:00'], 'wind_speed_10m': [20], 'rain': [.1], 'showers': [.2], 'snowfall': [2.54]}}


class WeatherTests(SimpleTestCase):
    def setUp(self): cache.clear()

    def test_snow_cm_and_combined_rain_showers(self):
        value = parse_weather(forecast())[NOW]
        self.assertAlmostEqual(value['snow_in_hr'], 1)
        self.assertAlmostEqual(value['rain_in_hr'], .3)
        self.assertEqual(value['wind_mph'], 20)

    def test_mm_and_inch_units(self):
        data = forecast(); data['hourly_units'].update(rain='mm', showers='mm', snowfall='inch')
        data['hourly'].update(rain=[25.4], showers=[2.54], snowfall=[.5])
        value = parse_weather(data)[NOW]
        self.assertAlmostEqual(value['rain_in_hr'], 1.1)
        self.assertEqual(value['snow_in_hr'], .5)

    def test_missing_invalid_or_wrong_unit_weather_is_not_safe(self):
        for field in ('wind_speed_10m', 'rain', 'showers', 'snowfall'):
            for invalid in (None, -1, float('nan'), '2'):
                data = forecast(); data['hourly'][field] = [invalid]
                with self.subTest(field=field, invalid=invalid): self.assertIsNone(parse_weather(data).get(NOW))
            data = forecast(); data['hourly'][field] = []
            self.assertIsNone(parse_weather(data).get(NOW))
            data = forecast(); data['hourly_units'][field] = 'unsupported'
            self.assertIsNone(parse_weather(data).get(NOW))

    def test_at_hour_ceil_and_timezone(self):
        series = {NOW: 'current', NOW+timedelta(hours=1): 'next'}
        self.assertEqual(at_hour(series, NOW), 'current')
        self.assertEqual(at_hour(series, NOW+timedelta(microseconds=1)), 'next')
        self.assertEqual(at_hour(series, NOW.astimezone(timezone(timedelta(hours=-5)))), 'current')
        self.assertIsNone(at_hour(series, NOW+timedelta(hours=2)))

    @patch('routing.providers.fetch_json', return_value=[])
    def test_batch_mismatch_is_explicit(self, fetch):
        with self.assertRaises(ProviderError): _weather_batch([(40, -74)])

    @patch('routing.providers._weather_batch', side_effect=ProviderError('Service unavailable'))
    def test_weather_failure_returns_unknown_and_warning(self, fetch):
        result, warnings = get_weather([{'latitude': 40, 'longitude': -74}])
        self.assertEqual(result, {})
        self.assertTrue(any('unknown' in item for item in warnings))

    @patch('routing.providers.httpx.get', side_effect=httpx.ConnectError('Offline'))
    def test_http_error_is_provider_error(self, get):
        with self.assertRaises(ProviderError): fetch_json('https://example.test', {}, 'Weather')

    @patch('routing.providers.httpx.get')
    def test_json_error_is_provider_error(self, get):
        get.return_value.json.side_effect = ValueError('Not JSON')
        with self.assertRaises(ProviderError): fetch_json('https://example.test', {}, 'Weather')

    @patch('routing.providers.fetch_json')
    def test_route_deduplication_and_fewer_than_three_warning(self, fetch):
        fetch.return_value = {'code': 'Ok', 'routes': [road(), road()], 'waypoints': [{'distance': 6000}]}
        routes, warnings = get_routes(inputs()['origin'], inputs()['destination'])
        self.assertEqual(len(routes), 1)
        self.assertEqual(len(warnings), 2)

    @patch('routing.providers.fetch_json', return_value={'code': 'NoRoute'})
    def test_no_route_is_provider_error(self, fetch):
        with self.assertRaises(ProviderError): get_routes(inputs()['origin'], inputs()['destination'])


class PlannerTests(SimpleTestCase):
    @patch('routing.planner.get_weather', return_value=({}, ['Weather unavailable']))
    @patch('routing.planner.get_routes', return_value=([road()], []))
    def test_missing_weather_no_recommendation_and_49_corridor_hours(self, routes, weather):
        value = inputs(); value['departure'] = NOW
        plan = make_plan(value)
        self.assertIsNone(plan['recommended_route_id'])
        self.assertEqual(plan['routes'][0]['summary']['risk_miles']['unknown'], 30)
        self.assertTrue(plan['corridor']['points'])
        self.assertTrue(all(len(p['hours']) == 49 and all(h is None for h in p['hours']) for p in plan['corridor']['points']))

    @patch('routing.planner.get_weather')
    @patch('routing.planner.get_routes', return_value=([road()], []))
    def test_checkpoint_weather_is_matched_to_each_eta(self, routes, weather):
        safe = {'wind_mph': 0, 'rain_in_hr': 0, 'snow_in_hr': 0, 'time': NOW.isoformat()}
        severe = {**safe, 'rain_in_hr': .8}
        weather.return_value = ({(40, -100): {NOW: safe}, (40, -99): {NOW+timedelta(hours=1): severe}, (40, -98.5): {NOW+timedelta(hours=1): safe}, (40, -98): {NOW+timedelta(hours=1): safe}}, [])
        value = inputs(); value['departure'] = NOW
        plan = make_plan(value)
        self.assertEqual([p['risk']['level'] for p in plan['routes'][0]['checkpoints']], [0, 3, 0, 0])
        self.assertEqual(plan['routes'][0]['summary']['risk_miles']['severe'], 20)
        self.assertEqual(plan['recommended_route_id'], 'route-1')

    @patch('routing.planner.get_routes', return_value=([{'geometry': {}}], []))
    def test_bad_geometry_is_provider_error(self, routes):
        value = inputs(); value['departure'] = NOW
        with self.assertRaises(ProviderError): make_plan(value)


class APITests(SimpleTestCase):
    def setUp(self): cache.clear()

    def test_health_and_methods(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['external_services_checked'])
        self.assertEqual(self.client.post('/api/health/').status_code, 405)
        self.assertEqual(self.client.get('/api/plan/').status_code, 405)
        self.assertEqual(self.client.post('/api/geocode/').status_code, 405)

    def test_invalid_requests(self):
        self.assertEqual(self.client.post('/api/plan/', data='bad', content_type='text/plain').status_code, 415)
        for body in ('{', 'null', '[]', '{}', 'NaN'):
            self.assertEqual(self.client.post('/api/plan/', data=body, content_type='application/json').status_code, 400)
        self.assertEqual(self.client.get('/api/geocode/?q=a').status_code, 400)

    @patch('routing.views.search_places', side_effect=ProviderError('Unavailable'))
    def test_geocode_provider_failure(self, places):
        response = self.client.get('/api/geocode/?q=Boston')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['error'], 'Unavailable')
        self.assertNotIn('Cache-Control', response)

    @patch('routing.views.search_places', return_value=[{'name': 'Boston', 'latitude': 42.36, 'longitude': -71.06}])
    def test_geocode_success_is_publicly_cacheable(self, places):
        response = self.client.get('/api/geocode/?q=Boston')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['results'][0]['name'], 'Boston')
        self.assertIn('s-maxage=86400', response['Cache-Control'])
        self.assertIn('max-age=3600', response['Cache-Control'])

    @patch('routing.providers.fetch_json', return_value={})
    def test_geocode_normalizes_provider_cache_query(self, fetch):
        self.assertEqual(search_places('  New   YORK  '), [])
        self.assertEqual(fetch.call_args.args[1]['name'], 'new york')

    @patch('routing.views.make_plan', side_effect=ProviderError('Unavailable'))
    def test_plan_provider_failure(self, plan):
        value = inputs(); value['departure'] = datetime.now(timezone.utc).isoformat()
        response = self.client.post('/api/plan/', data=value, content_type='application/json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['error'], 'Unavailable')

    @patch('routing.views.make_plan', return_value={'routes': []})
    def test_valid_plan_and_rate_limit(self, plan):
        value = inputs(); value['departure'] = datetime.now(timezone.utc).isoformat()
        for _ in range(8):
            self.assertEqual(self.client.post('/api/plan/', data=value, content_type='application/json').status_code, 200)
        self.assertEqual(self.client.post('/api/plan/', data=value, content_type='application/json').status_code, 429)

class PlannerCornerTests(SimpleTestCase):
    @patch('routing.planner.get_weather')
    @patch('routing.planner.get_routes', return_value=([road((10,), (3600,))], []))
    def test_destination_only_no_travel_blocks_entire_last_segment(self, routes, weather):
        safe = {'wind_mph': 0, 'rain_in_hr': 0, 'snow_in_hr': 0, 'time': NOW.isoformat()}
        unsafe = {**safe, 'wind_mph': 55}
        weather.return_value = ({(40, -100): {NOW: safe}, (40, -99): {NOW+timedelta(hours=1): unsafe}}, [])
        value = inputs(); value['departure'] = NOW
        plan = make_plan(value)
        self.assertIsNone(plan['recommended_route_id'])
        route = plan['routes'][0]
        self.assertEqual(route['summary']['risk_miles']['no_travel'], 10)
        self.assertEqual(route['segments'][0]['risk']['level'], 4)

    @patch('routing.planner.get_weather')
    @patch('routing.planner.get_routes', return_value=([road((10,), (3600,))], []))
    def test_corridor_uses_departure_offset_not_checkpoint_eta(self, routes, weather):
        from routing.providers import location_key
        def fake_weather(points):
            return ({location_key(point): {NOW+timedelta(hours=h): {'wind_mph': h, 'rain_in_hr': 0, 'snow_in_hr': 0, 'time': (NOW+timedelta(hours=h)).isoformat()} for h in range(49)} for point in points}, [])
        weather.side_effect = fake_weather
        value = inputs(); value['departure'] = NOW
        plan = make_plan(value)
        for point in plan['corridor']['points']:
            self.assertEqual(len(point['hours']), 49)
            self.assertEqual(point['hours'][0]['wind_mph'], 0)
            self.assertEqual(point['hours'][48]['wind_mph'], 48)
        self.assertEqual(plan['routes'][0]['checkpoints'][-1]['weather']['wind_mph'], 1)

    @patch('routing.planner.get_weather')
    @patch('routing.planner.get_routes', return_value=([road((10,), (121*3600,))], []))
    def test_travel_duration_limit_precedes_weather_fetch(self, routes, weather):
        from routing.domain import ValidationError
        value = inputs(); value['departure'] = NOW
        with self.assertRaises(ValidationError): make_plan(value)
        weather.assert_not_called()

    @patch('routing.planner.get_weather')
    @patch('routing.planner.get_routes', return_value=([road((3000,), (3600,))], []))
    def test_checkpoint_limit_precedes_weather_fetch(self, routes, weather):
        from routing.domain import ValidationError
        value = inputs(); value['departure'] = NOW
        with self.assertRaises(ValidationError): make_plan(value)
        weather.assert_not_called()
