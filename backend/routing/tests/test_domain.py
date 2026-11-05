from copy import deepcopy
from datetime import datetime, timedelta, timezone
from django.test import SimpleTestCase
from routing.domain import (METERS_PER_MILE, ValidationError, classify_weather,
                            interpolate, recommend, sample_route, summarize_route, validate_plan)

NOW = datetime(2026, 11, 5, 12, tzinfo=timezone.utc)


def inputs():
    return {'origin': {'latitude': 40, 'longitude': -74},
            'destination': {'latitude': 41, 'longitude': -73},
            'load_lb': 30000, 'spacing_miles': 10, 'departure': NOW.isoformat()}


def road(distances=(10, 20), durations=(600, 2400)):
    return {'geometry': {'coordinates': [[-100+i, 40] for i in range(len(distances)+1)]},
            'legs': [{'annotation': {'distance': [d*METERS_PER_MILE for d in distances], 'duration': list(durations)}}]}


def risk(level):
    return None if level is None else {'level': level}


class RiskTests(SimpleTestCase):
    def classify(self, **changes):
        load = changes.pop('load', 0)
        return classify_weather({'wind_mph': 0, 'rain_in_hr': 0, 'snow_in_hr': 0, **changes}, load)

    def test_wind_boundaries_are_continuous(self):
        for wind, level in [(0, 0), (24.9999, 0), (25, 1), (34.9999, 1), (35, 2), (44.9999, 2), (45, 3), (54.9999, 3), (55, 4), (100, 4)]:
            with self.subTest(wind=wind):
                self.assertEqual(self.classify(wind_mph=wind)['level'], level)

    def test_rain_boundaries(self):
        for rain, level in [(0, 0), (.09999, 0), (.1, 1), (.24999, 1), (.25, 2), (.49999, 2), (.5, 3), (1, 3), (1.00001, 4)]:
            with self.subTest(rain=rain):
                self.assertEqual(self.classify(rain_in_hr=rain)['level'], level)

    def test_snow_boundaries(self):
        for snow, level in [(0, 0), (.49999, 0), (.5, 1), (.99999, 1), (1, 2), (1.99999, 2), (2, 3), (3, 3), (3.00001, 4)]:
            with self.subTest(snow=snow):
                self.assertEqual(self.classify(snow_in_hr=snow)['level'], level)

    def test_strict_load_thresholds_and_wind_windows(self):
        for wind, load, expected in [(45, 30000, 3), (45, 30000.01, 4), (54.99999, 30001, 4), (55, 0, 4), (35, 40000, 2), (35, 40000.01, 3), (44.9999, 40001, 3), (34.9999, 200000, 1), (44.9999, 30001, 2)]:
            with self.subTest(wind=wind, load=load):
                self.assertEqual(self.classify(wind_mph=wind, load=load)['level'], expected)

    def test_worst_condition_wins(self):
        self.assertEqual(self.classify(wind_mph=25, rain_in_hr=.3, snow_in_hr=2)['level'], 3)

    def test_invalid_or_missing_weather_is_unknown(self):
        self.assertIsNone(classify_weather(None, 0))
        self.assertIsNone(classify_weather({}, 0))
        for key in ('wind_mph', 'rain_in_hr', 'snow_in_hr'):
            for value in (None, True, -1, float('nan'), float('inf'), '3'):
                with self.subTest(key=key, value=value):
                    self.assertIsNone(self.classify(**{key: value}))


class ValidationTests(SimpleTestCase):
    def test_timezone_normalization(self):
        value = inputs()
        value['departure'] = '2026-11-05T07:00:00-05:00'
        self.assertEqual(validate_plan(value, NOW)['departure'], NOW)

    def test_departure_limits_inclusive(self):
        for delta in (timedelta(minutes=-5), timedelta(hours=48)):
            value = inputs(); value['departure'] = (NOW+delta).isoformat()
            validate_plan(value, NOW)
        for delta in (timedelta(minutes=-5, microseconds=-1), timedelta(hours=48, microseconds=1)):
            value = inputs(); value['departure'] = (NOW+delta).isoformat()
            with self.assertRaises(ValidationError): validate_plan(value, NOW)

    def test_invalid_departures(self):
        for departure in (None, 5, True, '', '2026-11-05T12:00', 'not-a-date'):
            value = inputs(); value['departure'] = departure
            with self.subTest(departure=departure), self.assertRaises(ValidationError): validate_plan(value, NOW)

    def test_invalid_input_shapes_and_values(self):
        bad = [None, [], 'x', {}, {**inputs(), 'origin': None}]
        for field, values in [('load_lb', [True, -1, 200001, float('nan'), float('inf'), '100']), ('spacing_miles', [True, 0, 11, '10', None])]:
            bad.extend({**inputs(), field: value} for value in values)
        for coordinate, values in [('latitude', [-86, 86, None, True, float('nan')]), ('longitude', [-181, 181, '1'])]:
            for value in values:
                item = inputs(); item['origin'][coordinate] = value; bad.append(item)
        same = inputs(); same['destination'] = same['origin']; bad.append(same)
        for value in bad:
            with self.subTest(value=value), self.assertRaises(ValidationError): validate_plan(value, NOW)

    def test_supported_spacings(self):
        for spacing in (10, 25, 50):
            value = inputs(); value['spacing_miles'] = spacing
            self.assertEqual(validate_plan(value, NOW)['spacing_miles'], spacing)


class GeometryTests(SimpleTestCase):
    def test_eta_uses_edge_durations_not_average_speed(self):
        points, segments, miles, duration = sample_route(road(), 10, NOW)
        self.assertEqual([p['distance_miles'] for p in points], [0, 10, 20, 30])
        self.assertEqual([datetime.fromisoformat(p['eta']) for p in points], [NOW+timedelta(seconds=s) for s in (0, 600, 1800, 3000)])
        self.assertAlmostEqual(miles, 30)
        self.assertEqual(duration, 3000)
        self.assertAlmostEqual(sum(s['distance_miles'] for s in segments), miles)
        self.assertAlmostEqual(sum(p['segment_miles'] for p in points), miles)

    def test_final_partial_segment_and_exact_endpoint(self):
        points, segments, miles, _ = sample_route(road((10, 17)), 25, NOW)
        self.assertEqual([p['distance_miles'] for p in points], [0, 25, 27])
        self.assertEqual(points[-1]['longitude'], -98)
        self.assertAlmostEqual(sum(s['distance_miles'] for s in segments), miles)

    def test_antimeridian_interpolation(self):
        self.assertEqual(interpolate([179, 0], [-179, 2], .5), [-180, 1])

    def test_bad_provider_geometry_or_measurements(self):
        cases = [road((0, 0)), road((-1, 5)), road((1, float('nan'))), road((1,), (1, 2)), road((1,), (-1,))]
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValueError): sample_route(value, 10, NOW)


class SummaryTests(SimpleTestCase):
    def test_endpoint_max_weighted_risk_and_total(self):
        points = [{'risk': risk(i)} for i in [0, 1, 3]]
        segments = [{'distance_miles': 10}, {'distance_miles': 20}]
        result = summarize_route(points, segments)
        self.assertEqual(result['risk_miles']['moderate'], 10)
        self.assertEqual(result['risk_miles']['severe'], 20)
        self.assertAlmostEqual(result['average_risk'], 70/30)
        self.assertEqual(sum(result['risk_miles'].values()), 30)
        self.assertTrue(result['eligible'])
        self.assertEqual([s['risk']['level'] for s in segments], [1, 3])

    def test_unknown_and_no_travel_excluded(self):
        for levels, category in [([0, None, 0], 'unknown'), ([0, 4, 0], 'no_travel')]:
            result = summarize_route([{'risk': risk(i)} for i in levels], [{'distance_miles': 10}, {'distance_miles': 20}])
            self.assertFalse(result['eligible']); self.assertEqual(result['risk_miles'][category], 30)
            if category == 'unknown': self.assertIsNone(result['average_risk'])

    def test_lexicographic_recommendation(self):
        def route(id, severe, high, average, duration, eligible=True):
            return {'id': id, 'duration_seconds': duration, 'summary': {'eligible': eligible, 'risk_miles': {'severe': severe, 'high': high}, 'average_risk': average}}
        comparisons = [
            (route('winner', 0, 100, 3, 9999), route('loser', 1, 0, 0, 1)),
            (route('winner', 0, 0, 2, 9999), route('loser', 0, 1, 0, 1)),
            (route('winner', 0, 0, .1, 9999), route('loser', 0, 0, .2, 1)),
            (route('winner', 0, 0, .1, 1), route('loser', 0, 0, .1, 2)),
            (route('winner', 10, 10, 3, 9999), route('loser', 0, 0, 0, 1, False)),
        ]
        for winner, loser in comparisons:
            with self.subTest(winner=winner, loser=loser): self.assertEqual(recommend([loser, winner])[0], 'winner')
        self.assertIsNone(recommend([])[0])
        self.assertIsNone(recommend([route('x', 0, 0, 0, 1, False)])[0])
