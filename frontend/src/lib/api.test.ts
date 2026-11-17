import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl, resolveRuntimeApiBase } from './api';

test('returns relative path when base URL is empty', () => {
  assert.equal(buildApiUrl('/api/bootstrap', ''), '/api/bootstrap');
  assert.equal(buildApiUrl('api/orders', undefined), '/api/orders');
});

test('joins configured Render backend base URL without duplicate slashes', () => {
  assert.equal(
    buildApiUrl('/api/bootstrap', 'https://avado-api.onrender.com/'),
    'https://avado-api.onrender.com/api/bootstrap'
  );
  assert.equal(
    buildApiUrl('api/admin/upload?target=product', 'https://avado-api.onrender.com'),
    'https://avado-api.onrender.com/api/admin/upload?target=product'
  );
});

test('uses Render fallback on Cloudflare Pages when VITE_API_URL is unset and stays relative elsewhere', () => {
  assert.equal(
    resolveRuntimeApiBase('', 'avadogrocery.pages.dev'),
    'https://avadogrocery1.onrender.com'
  );
  assert.equal(
    resolveRuntimeApiBase('https://custom-api.example.com', 'avadogrocery.pages.dev'),
    'https://custom-api.example.com'
  );
  assert.equal(resolveRuntimeApiBase('', 'localhost'), '');
  assert.equal(
    resolveRuntimeApiBase('', 'ais-dev-example.asia-southeast1.run.app'),
    ''
  );
});
