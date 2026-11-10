import { createHomeScreen } from '../home-screen.js';
import { createSettingsScreen } from '../settings-screen.js';

export const ROUTES = {
  HOME: 'home',
  SETTINGS: 'settings',
};

export function registerHomeRoutes(navigator, container) {
  navigator.register(ROUTES.HOME, createHomeScreen({ navigator, greeting: container.get('greeting') }));
  navigator.register(ROUTES.SETTINGS, createSettingsScreen({ navigator }));
}
