import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl } from './api';

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
