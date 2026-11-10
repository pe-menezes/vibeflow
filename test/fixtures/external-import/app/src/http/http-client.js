import { AppError } from '../errors/app-error.js';

// A thin JSON client over an injected fetch, so tests never touch the network.
export function createHttpClient({ baseUrl, fetch }) {
  async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new AppError('http-error', `${method} ${path} failed with ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
  };
}
