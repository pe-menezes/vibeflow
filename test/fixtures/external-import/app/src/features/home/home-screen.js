import { capitalize } from '../../utils/strings.js';

export function createHomeScreen({ navigator, greeting }) {
  return {
    render({ name = 'guest' } = {}) {
      return `${capitalize(greeting)}, ${name}`;
    },
    openSettings() {
      return navigator.navigate('settings');
    },
  };
}
