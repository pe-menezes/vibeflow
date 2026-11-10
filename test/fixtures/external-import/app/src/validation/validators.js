// Field validators return a message when the value is invalid and null when
// it is fine; validate() runs them over a values object, field by field.
export function required(label) {
  return (value) => (value === undefined || value === null || value === '' ? `${label} is required` : null);
}

export function maxLength(label, max) {
  return (value) => (typeof value === 'string' && value.length > max ? `${label} is too long` : null);
}

export function validate(values, rules) {
  const errors = {};
  for (const [field, checks] of Object.entries(rules)) {
    for (const check of checks) {
      const message = check(values[field]);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }
  return errors;
}
