import { loadConfig } from './config/config.js';
import { createContainer } from './di/container.js';
import { createLogger } from './logging/logger.js';
import { createNavigator } from './navigation/navigator.js';
import { createMemoryStorage } from './storage/memory-storage.js';
import { registerHomeRoutes } from './features/home/navigation/home-routes.js';
import { registerProfileRoutes } from './features/profile/navigation/profile-routes.js';

/** Returns the app's container, its navigator and the screens the features expose. */
export function createApp({ greeting = 'hello', config = {}, confirmDiscard = () => false } = {}) {
  const container = createContainer();
  container.provide('greeting', () => greeting);
  container.provide('config', () => loadConfig(config));
  container.provide('logger', () => createLogger('app'));
  container.provide('storage', () => createMemoryStorage());
  container.provide('confirmDiscard', () => confirmDiscard);

  const navigator = createNavigator();
  registerHomeRoutes(navigator, container);
  const profile = registerProfileRoutes(navigator, container);

  return { container, navigator, screens: { profile } };
}
