// Test doubles shared by the test files: a fixed clock and a fetch that
// answers from a table of canned responses and records every call.
export function createFixedClock(iso) {
  const time = new Date(iso).getTime();
  return { now: () => new Date(time) };
}

export function createFakeFetch(responses) {
  const calls = [];
  async function fetch(url, options = {}) {
    const method = options.method ?? 'GET';
    calls.push({ url, method, body: options.body });
    const answer = responses[`${method} ${url}`];
    if (!answer) return { ok: false, status: 404, json: async () => null };
    const status = answer.status ?? 200;
    return { ok: status < 400, status, json: async () => answer.body };
  }
  fetch.calls = calls;
  return fetch;
}
