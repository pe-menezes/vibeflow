export function createSettingsScreen({ navigator }) {
  return {
    render() {
      return 'Settings';
    },
    close() {
      return navigator.navigate('home');
    },
  };
}
