// Routes of the profile feature: the edit screen, built with the services it
// needs from the container.
import { createLogger } from '../../../logging/logger.js';
import { createProfileEditScreen } from '../profile-edit-screen.js';

export const ROUTES = Object.freeze({
  EDIT: 'profile/edit',
});

/** Returns the profile screens after registering each one on the navigator. */
export function registerProfileRoutes(navigator, container) {
  const edit = createProfileEditScreen({
    navigator,
    storage: container.get('storage'),
    logger: createLogger('profile'),
    confirmDiscard: container.get('confirmDiscard'),
  });
  navigator.register(ROUTES.EDIT, edit);
  return { edit };
}
