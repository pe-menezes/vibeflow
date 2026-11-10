---
name: screen-flows
description: Use when building or changing an edit screen. Covers how the screen loads a record into a draft, validates it, saves it and goes back, in that order.
---

# Screen flows: edit screens

An edit screen moves through four steps, always in this order: load, validate,
save, back. The screen object exposes them as `load()`, `validate()`,
`save()` and `leave()`, next to `render`.

* **Load.** `load(id)` reads the record through the feature's storage adapter
  and fills the screen's draft with it. The factory never reads storage; it
  only receives what `load` will need.
* **Validate.** `validate()` runs the feature's field rules on the draft and
  returns an object of messages by field name, empty when the draft is valid.
* **Save.** `save()` calls `validate()` first.
* **Back.** After a successful save, the screen leaves.

## Rules

1. **`save()` never writes an invalid draft.** When `validate()` returns any
   message, `save()` returns `{ ok: false, errors }` without calling the
   storage adapter, and does not throw. On success it writes once and returns
   `{ ok: true }`.
2. **Leaving with unsaved changes asks first.** `leave()` checks the draft:
   when it differs from what `load()` read, it calls `confirmDiscard()` and
   stays on the screen if the answer is no. Only then does it go back.

## Example

```js
export function createProfileEditScreen({ navigator, storage, confirmDiscard }) {
  let loaded = null;
  let draft = null;

  return {
    title: 'Edit profile',
    load(id) {
      loaded = storage.read(id);
      draft = { ...loaded };
    },
    validate() {
      return draft.name ? {} : { name: 'Name is required' };
    },
    save() {
      const errors = this.validate();
      if (Object.keys(errors).length > 0) return { ok: false, errors };
      storage.write(draft.id, draft);
      loaded = { ...draft };
      return { ok: true };
    },
    leave() {
      const dirty = JSON.stringify(draft) !== JSON.stringify(loaded);
      if (dirty && !confirmDiscard()) return false;
      navigator.back();
      return true;
    },
    render() {
      return `Editing ${draft.name}`;
    },
  };
}
```
