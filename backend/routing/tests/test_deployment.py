"""Deployment guardrails; isolated settings checks never emit secret values."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch
from django.core.cache import cache
from django.http import JsonResponse
from django.test import SimpleTestCase
from routing.tests.test_domain import inputs

BACKEND = Path(__file__).resolve().parents[2]


class ResponseLimitTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.payload = inputs()
        self.payload['departure'] = datetime.now(timezone.utc).isoformat()

    def post_sized_response(self, size):
        # Calculate JSON envelope overhead, so assertions test serialized bytes.
        overhead = len(JsonResponse({'padding': ''}).content)
        with patch('routing.views.make_plan', return_value={'padding': 'a'*(size-overhead)}):
            return self.client.post('/api/plan/', data=self.payload, content_type='application/json')

    def test_exactly_four_million_bytes_is_allowed(self):
        response = self.post_sized_response(4_000_000)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.content), 4_000_000)

    def test_one_byte_over_limit_returns_small_actionable_json_error(self):
        response = self.post_sized_response(4_000_001)
        self.assertEqual(response.status_code, 400)
        self.assertLess(len(response.content), 1000)
        self.assertIn('payload limit', response.json()['error'])
        self.assertIn('spacing', response.json()['error'])

    def test_limit_measures_encoded_json_not_python_character_count(self):
        with patch('routing.views.make_plan', return_value={'padding': '\u2603'*700_000}):
            response = self.client.post('/api/plan/', data=self.payload, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('payload limit', response.json()['error'])


class ProductionSettingsTests(SimpleTestCase):
    def settings_snapshot(self, overrides):
        env = os.environ.copy()
        for name in ('VERCEL', 'DEBUG', 'DJANGO_SECRET_KEY', 'ALLOWED_HOSTS', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_BRANCH_URL'):
            env.pop(name, None)
        env.update(overrides)
        # Only booleans, public hostnames, and status codes leave the subprocess.
        script = '''
import importlib, json, os
import config.settings as configured
initial_key = configured.SECRET_KEY
snapshot = {
    "debug": configured.DEBUG,
    "hosts": configured.ALLOWED_HOSTS,
    "key_is_nonempty": bool(initial_key),
    "generated_key_is_long": len(initial_key) >= 50,
    "provided_key_matches": initial_key == os.getenv("DJANGO_SECRET_KEY"),
}
importlib.reload(configured)
snapshot["fresh_import_changes_generated_key"] = initial_key != configured.SECRET_KEY
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
import django
django.setup()
from django.test import Client
client = Client()
snapshot["known_host_status"] = client.get("/api/health/", HTTP_HOST=os.getenv("VERCEL_URL", "localhost")).status_code
snapshot["unlisted_host_status"] = client.get("/api/health/", HTTP_HOST="attacker.invalid").status_code
print(json.dumps(snapshot))
'''
        process = subprocess.run([sys.executable, '-c', script], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(process.returncode, 0, 'Isolated settings process failed; output intentionally withheld.')
        return json.loads(process.stdout)

    def test_vercel_defaults_production_and_allows_only_exact_hosts(self):
        result = self.settings_snapshot({'VERCEL': '1', 'VERCEL_URL': 'preview.example.vercel.app', 'VERCEL_PROJECT_PRODUCTION_URL': 'production.example.vercel.app', 'VERCEL_BRANCH_URL': 'branch.example.vercel.app'})
        self.assertFalse(result['debug'])
        self.assertTrue(result['key_is_nonempty'])
        self.assertTrue(result['generated_key_is_long'])
        self.assertTrue(result['fresh_import_changes_generated_key'])
        self.assertFalse(result['provided_key_matches'])
        self.assertEqual(result['known_host_status'], 200)
        self.assertEqual(result['unlisted_host_status'], 400)
        for host in ('preview.example.vercel.app', 'production.example.vercel.app', 'branch.example.vercel.app'):
            self.assertIn(host, result['hosts'])
        self.assertNotIn('*', result['hosts'])
        self.assertNotIn('.vercel.app', result['hosts'])

    def test_explicit_settings_are_respected_and_hosts_deduplicated(self):
        result = self.settings_snapshot({'VERCEL': '1', 'DEBUG': 'true', 'ALLOWED_HOSTS': 'custom.example,preview.example', 'VERCEL_URL': 'preview.example', 'DJANGO_SECRET_KEY': 'test-only-noncredential-stable-key'})
        self.assertTrue(result['debug'])
        self.assertTrue(result['provided_key_matches'])
        self.assertFalse(result['fresh_import_changes_generated_key'])
        self.assertEqual(result['hosts'], ['custom.example', 'preview.example'])
        self.assertEqual(result['known_host_status'], 200)
        self.assertEqual(result['unlisted_host_status'], 400)

    def test_local_development_default_and_explicit_production(self):
        local = self.settings_snapshot({})
        self.assertTrue(local['debug'])
        production = self.settings_snapshot({'DEBUG': 'false'})
        self.assertFalse(production['debug'])
        self.assertTrue(production['key_is_nonempty'])
        self.assertEqual(production['known_host_status'], 200)
        self.assertEqual(production['unlisted_host_status'], 400)

    def test_root_and_backend_dependency_pins_are_identical(self):
        root_requirements = BACKEND.parent / 'requirements.txt'
        backend_requirements = BACKEND / 'requirements.txt'
        self.assertEqual(root_requirements.read_bytes(), backend_requirements.read_bytes())
        lines = root_requirements.read_text().splitlines()
        dependencies = [line for line in lines if line.strip() and not line.lstrip().startswith('#')]
        self.assertTrue(dependencies)
        self.assertTrue(all('==' in line for line in dependencies))
