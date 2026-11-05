"""Regression cases discovered during independent backend review."""
from datetime import datetime, timedelta
from django.test import SimpleTestCase
from routing.domain import sample_route
from routing.providers import parse_weather
from routing.tests.test_domain import NOW, road
from routing.tests.test_services import forecast


class DiscoveredRegressionTests(SimpleTestCase):
    def test_terminal_zero_length_edge_keeps_final_eta_and_endpoint(self):
        raw = road((10, 0), (600, 120))
        points, _, _, duration = sample_route(raw, 10, NOW)
        self.assertEqual(datetime.fromisoformat(points[-1]['eta']), NOW+timedelta(seconds=duration))
        self.assertEqual(points[-1]['longitude'], raw['geometry']['coordinates'][-1][0])

    def test_boolean_precipitation_is_unknown(self):
        data = forecast(); data['hourly']['rain'] = [True]
        self.assertIsNone(parse_weather(data).get(NOW))

    def test_malformed_weather_payload_is_unknown(self):
        for payload in (None, [], {'hourly': None}, {'hourly_units': None}):
            self.assertEqual(parse_weather(payload), {})

    def test_all_boolean_weather_fields_are_unknown(self):
        for field in ('wind_speed_10m', 'rain', 'showers', 'snowfall'):
            data = forecast(); data['hourly'][field] = [True]
            with self.subTest(field=field): self.assertIsNone(parse_weather(data).get(NOW))

    def test_invalid_edge_booleans_are_rejected(self):
        raw = road()
        raw['legs'][0]['annotation']['duration'][0] = True
        with self.assertRaises(ValueError): sample_route(raw, 10, NOW)

    def test_malformed_geocode_is_provider_error(self):
        from unittest.mock import patch
        from routing.providers import search_places, ProviderError
        for data in (None, [], {'results': None}, {'results': [None]}, {'results': [{'latitude': True, 'longitude': 10}]}, {'results': [{'latitude': 100, 'longitude': 10}]}):
            with self.subTest(data=data), patch('routing.providers.fetch_json', return_value=data), self.assertRaises(ProviderError):
                search_places('Boston')

    def test_malformed_routing_is_provider_error(self):
        from unittest.mock import patch
        from routing.providers import get_routes, ProviderError
        origin = {'latitude': 40, 'longitude': -74}; destination = {'latitude': 41, 'longitude': -73}
        for data in (None, [], {'code': 'Ok', 'routes': None}, {'code': 'Ok', 'routes': [None]}, {'code': 'Ok', 'routes': {}}):
            with self.subTest(data=data), patch('routing.providers.fetch_json', return_value=data), self.assertRaises(ProviderError):
                get_routes(origin, destination)

    def test_declared_provider_duration_scales_edge_timing(self):
        raw = road((10, 20), (600, 2400)); raw['duration'] = 3600
        points, _, _, duration = sample_route(raw, 10, NOW)
        self.assertEqual(duration, 3600)
        self.assertEqual([datetime.fromisoformat(p['eta']) for p in points], [NOW+timedelta(seconds=seconds) for seconds in (0, 720, 2160, 3600)])

    def test_absent_declared_duration_preserves_edge_total(self):
        points, _, _, duration = sample_route(road((10, 20), (600, 2400)), 10, NOW)
        self.assertEqual(duration, 3000)
        self.assertEqual(datetime.fromisoformat(points[-1]['eta']), NOW+timedelta(seconds=3000))

    def test_invalid_declared_duration_is_rejected(self):
        for invalid in (None, True, -1, float('nan'), float('inf'), '3000'):
            raw = road(); raw['duration'] = invalid
            with self.subTest(invalid=invalid), self.assertRaises(ValueError): sample_route(raw, 10, NOW)
        raw = road((10,), (0,)); raw['duration'] = 600
        with self.assertRaises(ValueError): sample_route(raw, 10, NOW)

    def test_malformed_coordinate_dimensions_rejected(self):
        for coords in ([[0], [1]], [None, None], [[True, 40], [10, 40]], [[0, float('nan')], [1, 40]]):
            raw = road((10,), (600,)); raw['geometry']['coordinates'] = coords
            with self.subTest(coords=coords), self.assertRaises(ValueError): sample_route(raw, 10, NOW)

    def test_malformed_waypoints_cannot_crash_routes(self):
        from unittest.mock import patch
        from routing.providers import get_routes, ProviderError
        origin = {'latitude': 40, 'longitude': -74}; destination = {'latitude': 41, 'longitude': -73}
        for waypoints in (1, True, 'not-waypoints', {'distance': 6000}):
            with self.subTest(waypoints=waypoints), patch('routing.providers.fetch_json', return_value={'code': 'Ok', 'routes': [road()], 'waypoints': waypoints}):
                # Either controlled rejection or discarding optional malformed snap
                # metadata is safe; arbitrary Python exceptions are not.
                try:
                    routes, _ = get_routes(origin, destination)
                    self.assertEqual(len(routes), 1)
                except ProviderError:
                    pass
