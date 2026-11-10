---
tags: [http, client, fetch]
modules: [src/http/]
applies_to: [remote calls]
confidence: high
---
# Pattern: HTTP client

## What
Remote calls go through `createHttpClient({ baseUrl, fetch })`, a JSON client
over an injected `fetch`.

## Where
- `src/http/http-client.js` — `createHttpClient()`

## The Pattern
- The client exposes `get`, `post` and `put` with a path relative to
  `baseUrl`.
- A response that is not ok rejects with `AppError` code `http-error`.
- Tests pass a fake `fetch`; nothing reaches the network.

## Example
```js
const client = createHttpClient({ baseUrl: config.apiBaseUrl, fetch });
const items = await client.get('/items');
```
