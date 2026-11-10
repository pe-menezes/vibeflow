import { createContainer } from './di/container.js';
import { createNavigator } from './navigation/navigator.js';
import { registerHomeRoutes } from './features/home/navigation/home-routes.js';

export function createApp({ greeting = 'hello' } = {}) {
  const container = createContainer();
  container.provide('greeting', () => greeting);

  const navigator = createNavigator();
  registerHomeRoutes(navigator, container);

  return { container, navigator };
}
