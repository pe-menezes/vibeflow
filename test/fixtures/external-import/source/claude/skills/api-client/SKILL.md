---
name: api-client
description: Use when writing or changing code that calls the backend HTTP API. Covers the shared client, request functions per resource, and response mapping.
---

# API client

* All HTTP calls go through the shared client created by
  `createApiClient({ baseUrl, fetch })`; no module calls `fetch` directly.
* Each resource has one file of request functions, `src/api/<resource>.js`,
  exporting verbs such as `getProfile(client, id)` and
  `updateProfile(client, id, body)`.
* Responses are mapped to plain domain objects inside the request function;
  screens never see raw response bodies.
* Non-2xx responses become an `AppError` with the code
  `API_<STATUS>` (`API_404`).
* Retries are allowed only for idempotent verbs and at most twice.
