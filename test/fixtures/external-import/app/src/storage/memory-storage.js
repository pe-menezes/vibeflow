// Key-value storage behind a small adapter. Values are kept as JSON text, so
// what is read back is a copy, never the object that was written.
export function createMemoryStorage() {
  const items = new Map();

  return {
    read(key, fallback = null) {
      return items.has(key) ? JSON.parse(items.get(key)) : fallback;
    },
    write(key, value) {
      items.set(key, JSON.stringify(value));
    },
    remove(key) {
      items.delete(key);
    },
    keys() {
      return [...items.keys()];
    },
  };
}
