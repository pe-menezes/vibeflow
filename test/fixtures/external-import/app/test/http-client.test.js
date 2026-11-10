import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHttpClient } from '../src/http/http-client.js';
import { createFakeFetch } from '../src/testing/fakes.js';

test('get returns the parsed body of a successful response', async () => {
  const fetch = createFakeFetch({ 'GET http://api/items': { body: [{ id: 1 }] } });
  const client = createHttpClient({ baseUrl: 'http://api', fetch });
  assert.deepEqual(await client.get('/items'), [{ id: 1 }]);
});

test('post sends a JSON body and a failed response becomes an app error', async () => {
  const fetch = createFakeFetch({});
  const client = createHttpClient({ baseUrl: 'http://api', fetch });
  await assert.rejects(client.post('/items', { name: 'x' }), { code: 'http-error' });
  assert.deepEqual(fetch.calls, [{ url: 'http://api/items', method: 'POST', body: '{"name":"x"}' }]);
});
