import { loadConfig } from './config/config.js';
import { createContainer } from './di/container.js';
import { createLogger } from './logging/logger.js';
import { createNavigator } from './navigation/navigator.js';
import { createMemoryStorage } from './storage/memory-storage.js';
import { registerHomeRoutes } from './features/home/navigation/home-routes.js';

export function createApp({ greeting = 'hello', config = {} } = {}) {
  const container = createContainer();
  container.provide('greeting', () => greeting);
  container.provide('config', () => loadConfig(config));
  container.provide('logger', () => createLogger('app'));
  container.provide('storage', () => createMemoryStorage());

  const navigator = createNavigator();
  registerHomeRoutes(navigator, container);

  return { container, navigator };
}
