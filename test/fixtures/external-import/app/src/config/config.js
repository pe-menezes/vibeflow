import { AppError } from '../errors/app-error.js';

// App settings: defaults overridden by the values passed at startup, frozen so
// nothing changes them later.
const DEFAULTS = {
  apiBaseUrl: 'http://localhost:8080',
  locale: 'en',
  pageSize: 20,
};

export function loadConfig(overrides = {}) {
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULTS)) throw new AppError('unknown-config-key', `unknown config key: ${key}`);
  }
  return Object.freeze({ ...DEFAULTS, ...overrides });
}
