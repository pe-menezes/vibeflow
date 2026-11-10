// Form values for a screen: the current values, the values the form started
// from, and whether anything changed since then.
export function createForm(initial = {}) {
  let start = { ...initial };
  let values = { ...initial };

  return {
    values() {
      return { ...values };
    },
    set(name, value) {
      values = { ...values, [name]: value };
    },
    reset(next = start) {
      start = { ...next };
      values = { ...next };
    },
    isDirty() {
      return Object.keys({ ...start, ...values }).some((key) => start[key] !== values[key]);
    },
  };
}
