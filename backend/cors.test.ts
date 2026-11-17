import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfiguredOrigins, resolveAllowedCorsOrigin } from './cors';

test('allows any browser origin when CORS_ORIGIN is unset or wildcard', () => {
  assert.equal(
    resolveAllowedCorsOrigin('https://avado-grocery.pages.dev', ''),
    'https://avado-grocery.pages.dev'
  );
  assert.equal(
    resolveAllowedCorsOrigin('https://avado-grocery.pages.dev/', '*'),
    'https://avado-grocery.pages.dev'
  );
  assert.equal(resolveAllowedCorsOrigin(undefined, '*'), null);
});

test('enforces configured exact and wildcard subdomain origins', () => {
  const configured = 'https://avado-grocery.pages.dev, https://*.avado-grocery.pages.dev, https://avadogrocery.com';
  assert.deepEqual(parseConfiguredOrigins(configured), [
    'https://avado-grocery.pages.dev',
    'https://*.avado-grocery.pages.dev',
    'https://avadogrocery.com',
  ]);

  assert.equal(
    resolveAllowedCorsOrigin('https://avado-grocery.pages.dev', configured),
    'https://avado-grocery.pages.dev'
  );
  assert.equal(
    resolveAllowedCorsOrigin('https://preview-123.avado-grocery.pages.dev', configured),
    'https://preview-123.avado-grocery.pages.dev'
  );
  assert.equal(
    resolveAllowedCorsOrigin('https://avadogrocery.com', configured),
    'https://avadogrocery.com'
  );
  assert.equal(resolveAllowedCorsOrigin('https://evil-site.com', configured), null);
});
