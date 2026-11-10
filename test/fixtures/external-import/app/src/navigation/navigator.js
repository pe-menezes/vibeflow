// A minimal in-memory navigator: screens are registered by route name and
// navigate() renders the screen for a name, keeping the visited names.
export function createNavigator() {
  const screens = new Map();
  const history = [];

  return {
    register(name, screen) {
      if (screens.has(name)) throw new Error(`route already registered: ${name}`);
      screens.set(name, screen);
    },
    navigate(name, params = {}) {
      const screen = screens.get(name);
      if (!screen) throw new Error(`unknown route: ${name}`);
      history.push(name);
      return screen.render(params);
    },
    back() {
      if (history.length < 2) return null;
      history.pop();
      const name = history[history.length - 1];
      return screens.get(name).render({});
    },
    current() {
      return history[history.length - 1] ?? null;
    },
    routes() {
      return [...screens.keys()];
    },
  };
}
