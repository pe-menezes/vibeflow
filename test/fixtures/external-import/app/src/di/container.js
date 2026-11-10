// A small service container: values are registered by name and resolved
// lazily the first time someone asks for them.
export function createContainer() {
  const factories = new Map();
  const cache = new Map();

  return {
    provide(name, factory) {
      factories.set(name, factory);
      cache.delete(name);
    },
    get(name) {
      if (cache.has(name)) return cache.get(name);
      const factory = factories.get(name);
      if (!factory) throw new Error(`nothing provided for ${name}`);
      const value = factory(this);
      cache.set(name, value);
      return value;
    },
  };
}
