---
kind: pattern
tags: [screens, edit-screen, list-screen, drafts, navigation, copy]
description: "Screens handbook: anatomy of a screen, list, detail and edit screens, the edit flow from load to back, error and empty states, copy, and how screens are tested and reviewed."
modules: []
applies_to: []
confidence: imported
source: team-conventions
source_file: docs/screens.md
source_ref: /work/team-conventions
source_commit: 3f6a9c2e81d47b05c9e2a6f13d8b7e4a05c19f2d
imported: 2026-01-20
---
# Pattern: Screens handbook

> Imported from team-conventions (docs/screens.md @ 3f6a9c2) on 2026-01-20.

# Screens handbook

This handbook is how the team builds screens. It grew out of review comments:
each section exists because the same question came up in more than one pull
request. Read it once end to end before your first screen, and come back to
the section you need afterwards.

The handbook does not replace the navigation rules or the code style rule;
it builds on them. Where a section repeats one of those rules, the rule is
the reference and this text is the explanation.

## Contents

1. Anatomy of a screen
2. Kinds of screen
3. Params and loading
4. List screens
5. Detail screens
6. Edit screens
7. Leaving a screen
8. Error states
9. Empty and loading states
10. Copy
11. Titles and headers
12. Rendered text that everyone can read
13. Performance
14. Testing screens
15. Review checklist
16. Questions that keep coming back
17. Glossary

## 1. Anatomy of a screen

A screen is a plain object built by a factory. The factory receives one
options object and returns the screen; it does no work besides keeping the
options in its closure.

```js
export function createOrderDetailScreen({ navigator, orders, logger }) {
  let order = null;

  return {
    title: 'Order',
    render(params) {
      if (params.id) order = orders.read(params.id);
      return order ? `Order ${order.number}` : 'Order not found';
    },
  };
}
```

The parts every screen has:

* **`title`**: a non-empty string in sentence case. The shell shows it in
  the header and in the history menu.
* **`render(params)`**: returns what the screen shows for the given params.
  It may load data the first time it sees an id; it never writes data.
* **Actions**: methods named after what the user does (`save`, `remove`,
  `openItem`). An action returns a result object or the text of the next
  screen; it never returns `undefined` silently.

What a screen does not have:

* No access to the container. The register function resolves services and
  passes them as options.
* No module-level state. Two instances of the same screen never share a
  variable.
* No knowledge of other features. A screen that opens a screen of another
  feature imports that feature's `ROUTES` and nothing else.

## 2. Kinds of screen

Almost every screen is one of four kinds. Pick the kind first; the rest of
this handbook is organized by it.

| Kind | Shows | Typical actions |
|---|---|---|
| list | many records, one line each | open one, filter, sort |
| detail | one record, read only | edit, remove, go back |
| edit | one record as a draft | change a field, save, leave |
| confirmation | one question | confirm, cancel |

A screen that is two kinds at once (a list with an inline editor, a detail
with editable fields) is split into two screens. The split costs one route
and saves every test that would have had to set up both halves.

Settings screens are edit screens whose record is the user's preferences.
Wizards are a sequence of edit screens that share one draft passed through
params by id; the draft is stored under its own key until the last step.

## 3. Params and loading

* Params carry ids and small flags, never records. A screen that needs a
  record receives its id and loads it.
* A screen loads in `render` the first time it receives an id, or when it
  receives a different id than the one it holds. Rendering the same id again
  does not load again.
* Loading reads through the adapter the screen received. A screen never
  builds its own adapter.
* A missing record is not an error. The screen renders its not-found text
  and offers the way back.
* Params a screen does not know are ignored, not rejected. The navigator
  passes params through untouched; adding a flag for one screen must not
  break the others.

Loading is synchronous in the apps that use a memory adapter. When an
adapter is asynchronous, `render` returns the loading text first and the
screen renders again when the data arrives (see section 9).

## 4. List screens

* A list shows one line per record, built by one function that takes the
  record and returns the line. The same function is used by the tests.
* The order of a list is explicit: the screen sorts before rendering, with a
  comparator named after the order (`byNewestFirst`). Storage order is never
  assumed.
* A list longer than fifty lines is paged. The page size is a constant at the
  top of the module and the current page is a param.
* Filtering happens on the records, before the lines are built. A filter
  that matches nothing shows the empty state of the filter, which is not the
  same text as the empty state of the list.
* Opening a record navigates to the detail screen with the record's id.
* A list never edits in place. Even a single toggle opens the edit screen or
  calls a service and renders again.

```js
function renderLine(order) {
  return `${order.number}  ${order.status}  ${formatDay(order.createdAt)}`;
}
```

## 5. Detail screens

* A detail screen shows the fields of one record in a fixed order, one per
  line, with the label first.
* Fields that are empty are shown with a dash, not left out, so the layout
  does not move between records.
* The detail screen offers edit and remove when the user may do them; it
  does not show actions that would be refused.
* Removing asks for confirmation through the confirmation screen, then goes
  back to the list. A removed record is not shown again, even for a moment.
* The detail screen reloads when it comes back from the edit screen, so it
  shows what was saved.

### 5.1 Confirmation screens

A confirmation screen asks one question and offers two answers. It is the
only kind of screen that exists to serve another screen, and it is kept
small on purpose.

* The question is one sentence that names the thing at stake: "Remove order
  1042?", not "Are you sure?".
* The two answers are verbs that say what happens: "Remove" and "Keep", never
  "Yes" and "No", and never "OK" and "Cancel".
* The destructive answer is never the default. A confirmation that receives
  no answer behaves like "Keep".
* The confirmation screen does not do the work. It returns the answer to the
  screen that asked, and that screen removes, discards or keeps.
* A confirmation is shown at most once per action. A screen that would need
  two confirmations in a row has a design problem, not a copy problem.

In apps without a dialog in the shell, the confirmation is a function passed
as an option (`confirmDiscard`, `confirmRemove`) that returns a boolean. The
rules above still apply to the text the shell shows for it.

### 5.2 Which screen owns a record

Each record kind has one detail screen and one edit screen, in the feature
that owns the record. Other features link to them through the owning
feature's `ROUTES`; they do not build their own copy "with fewer fields".

* A feature that needs a smaller view of a record shows it in its own list
  line, built from the fields it needs, and links to the owning detail screen
  for the rest.
* A feature that needs to change one field of another feature's record
  calls a service of the owning feature; it does not open the edit screen
  with a param that hides the other fields.
* When ownership is unclear, the record belongs to the feature whose storage
  keys hold it.

### 5.3 Ids

* Record ids are opaque strings. A screen never parses an id, sorts by it, or
  shows it to the user.
* A new record gets its id from the service that creates it, before the edit
  screen opens; the edit screen never invents one.
* Ids travel in params as `id`. A screen that needs two ids (a line of an
  order) names them after the record kind: `{ orderId, lineId }`.

## 6. Edit screens

An edit screen moves through four steps, always in this order: load,
validate, save, back. The screen object exposes them next to `render` and
`title`, and each step has one job.

### 6.1 Load

* The first `render` with an id reads the record and fills the draft with
  it. The draft is the form described by the forms pattern of the app.
* With no record stored for the id, the draft starts from the empty values of
  the fields and the screen is in "create" mode; the title does not change,
  the save writes a new record under that id.
* The values read are kept as the starting point of the form, so the screen
  knows later whether the draft changed.

### 6.2 Validate

* `validate()` runs the field rules on the current draft and returns the
  messages by field name, empty when the draft is valid.
* It also keeps the messages, so the next `render` shows them under their
  fields. It does not write anything.
* Values are trimmed before validation when spaces at the ends do not count.
  The trimmed value is what gets saved.

### 6.3 Save

* `save()` calls `validate()` first, every time.
* With any message, `save()` returns `{ ok: false, errors }`. It does not
  write, does not log at info level, does not navigate and does not throw.
* With no message, `save()` writes the record once through the adapter,
  merging the edited fields over the record that was loaded, and logs the
  save with the record's id.
* After writing, the screen resets its form to the saved values, so the draft
  is clean, and returns `{ ok: true }` together with what going back
  rendered.
* A save that the adapter refuses (an error thrown by the adapter) is logged
  at error level with the error's code and returned as `{ ok: false, errors:
  { form: <message> } }`; the draft stays as it was.

### 6.4 Back

* After a successful save the screen leaves on its own; the user does not
  press back.
* A screen that saves goes back with `navigator.back({ saved: true })` and never navigates forward to the screen it came from.
* Going back is the last thing `save()` does. Nothing after it may change the
  draft or write again.
* The screen does not decide where "back" is. Whoever opened the edit screen
  is where the user returns, whether that was a list, a detail or the home
  screen.

### 6.5 Putting it together

```js
export function createNoteEditScreen({ navigator, notes, logger, confirmDiscard }) {
  const form = createForm(EMPTY_NOTE);
  let loaded = null;
  let errors = {};

  return {
    title: 'Edit note',
    render(params) {
      if (params.id && params.id !== loaded?.id) {
        loaded = notes.read(params.id) ?? { ...EMPTY_NOTE, id: params.id };
        form.reset(loaded);
      }
      return [this.title, renderFields(form, errors)].join('\n');
    },
    set(name, value) {
      form.set(name, value);
    },
    validate() {
      errors = validate(form.values(), RULES);
      return errors;
    },
    save() {
      // validate, write once, log, reset, go back: see 6.3 and 6.4
    },
    leave() {
      // see section 7
    },
  };
}
```

The sketch leaves `save` and `leave` empty on purpose: write them from the
rules above, step by step, and the tests of section 14 will tell you when a
step is missing.

### 6.6 What an edit screen does not do

* It does not save on every change of a field. A draft is not saved until
  the user saves.
* It does not keep the draft anywhere but in its form. A second copy "for
  the save" drifts from the form and gets saved by mistake.
* It does not validate in `render`. Rendering shows the messages of the last
  `validate()`.
* It does not reach for the record again after saving to "refresh" it; the
  saved values are already in the form.

## 7. Leaving a screen

* A screen with a draft offers `leave()`. Any other screen relies on the
  navigator's back.
* `leave()` compares the draft with the values that were loaded. When they
  differ, it calls `confirmDiscard()`, which the screen received as an
  option, and stays on the screen when the answer is no.
* When the draft is clean, or the user agreed to discard it, `leave()` goes
  back with `navigator.back()` and returns what was rendered.
* `leave()` returns `false` when it stays, so the caller can tell the two
  cases apart without reading the route.
* The default of `confirmDiscard`, when the composition root has no dialog,
  answers no. Losing a draft silently is worse than staying.

```js
leave() {
  if (form.isDirty() && !confirmDiscard()) return false;
  return navigator.back();
},
```

## 8. Error states

* An error the user can act on is shown on the screen, next to what caused
  it, in the words of the message table. The screen stays.
* An error the user cannot act on (storage unavailable, a bug) is logged at
  error level and the screen shows one sentence that says what did not work
  and what the user can try.
* Error text never contains a stack, an error code alone, or the message of
  a lower layer.
* A screen never renders a blank string because something failed. Every
  path through `render` returns text a person can read.
* Errors are cleared when the user changes the field they belong to, not
  when the screen renders again.

## 9. Empty and loading states

* A list with no records shows one sentence that says why it is empty and,
  when there is one, the action that fills it: "No orders yet. New orders
  show up here."
* An empty filter result says that the filter matched nothing and offers to
  clear the filter.
* While data loads, the screen renders a loading text with the screen's
  title, so the header does not jump when the data arrives.
* Loading text is never shown for less than the time it takes to read it;
  with a synchronous adapter there is no loading state at all.

## 10. Copy

* Sentence case everywhere: titles, labels, buttons, messages.
* Labels are nouns ("Display name"); actions are verbs ("Save", "Discard").
* Messages say what happened and what to do, in that order, in at most two
  short sentences.
* No exclamation marks, no "please", no "oops". The tone is calm and plain.
* Numbers are written as digits; dates go through the date helpers of the
  app, never through `toString`.
* The same thing has the same name on every screen. If the list says
  "Orders", the detail does not say "Purchase".

## 11. Titles and headers

* The title names the record kind or the task: "Order", "Edit profile",
  "Settings". It does not include the record's own name; the body shows it.
* A screen in create mode keeps the title of the edit screen.
* Titles are short enough to fit the header of the narrowest layout: three
  words at most.
* The title is a constant property of the screen. A screen that wants a
  different title for a different state is two screens.

## 12. Rendered text that everyone can read

* Each line of rendered text stands on its own: a label and its value on the
  same line, never a value whose label is two lines above.
* Status is said in words, not only with a symbol: "Paid", not a check mark
  alone.
* Field messages repeat the field's label, so a screen reader that jumps to
  the message still knows which field it is about.
* Lines stay under eighty characters; longer values wrap at word boundaries
  through the string helpers.
* Order on screen follows the order of the tasks: what the user needs first
  comes first.

## 13. Performance

* `render` does no work proportional to the size of storage. It reads what it
  needs by key.
* Lists build their lines once per render and do not sort twice.
* Expensive formatting (dates, currencies) goes through the shared helpers,
  which cache what they can.
* A screen that is rendered again with the same params produces the same text
  without reading storage again.

## 14. Testing screens

Screens are tested through the app, with the navigator `createApp()` builds,
so that a missing registration fails the same test as a missing behavior.

### 14.1 What every edit screen test file covers

* Load: rendering with the id of a stored record shows its values.
* Create mode: rendering with an unknown id shows empty fields.
* Validate: an invalid draft returns messages for exactly the fields that are
  wrong.
* Save, invalid: nothing is stored, the route does not change and the result
  carries the errors.
* Save, valid: the record is stored once with the merged values, and the
  current route is the one the edit screen was opened from.
* Leave, clean: goes back without asking.
* Leave, dirty, refused: stays on the screen and returns `false`.
* Leave, dirty, accepted: goes back.

### 14.2 How to reach the screen object

* Build the app with `createApp(options)`, passing the doubles the test needs
  (a `confirmDiscard` that answers yes or no).
* Navigate to the screen through its `ROUTES` entry with the params a real
  user would produce.
* Get the screen object from the factory options or from an accessor the
  routes file already exports for the shell. Do not add exports only for
  tests.

### 14.3 What not to test

* Exact rendered text of a whole screen. Check the lines that carry the
  behavior: the field value, the message, the title.
* The order of calls inside the screen. Check the outcome: what is stored,
  where the navigator is.
* Logging, unless the log is the behavior under test.

### 14.4 Example

```js
test('saving a valid note stores it and returns to the list', () => {
  const { navigator, container } = createApp();
  navigator.navigate(NOTES_ROUTES.LIST);
  navigator.navigate(NOTES_ROUTES.EDIT, { id: 'n1' });
  const screen = notesScreens(container).edit;

  screen.set('text', 'Buy milk');
  const result = screen.save();

  assert.equal(result.ok, true);
  assert.equal(container.get('storage').read('notes.n1').text, 'Buy milk');
  assert.equal(navigator.current(), NOTES_ROUTES.LIST);
});
```

## 15. Review checklist

Reviewers go through this list for every pull request that adds or changes a
screen. The author goes through it first.

* The screen is one kind (section 2); a mixed screen was split.
* The factory takes one options object and keeps no module-level state.
* `title` is set, in sentence case, three words at most.
* `render` returns readable text on every path, including not-found and
  errors.
* Params carry ids, not records.
* Lists sort explicitly and have both empty states.
* Edit screens follow load, validate, save, back, in that order.
* `save()` validates first and never writes an invalid draft.
* A successful save writes once, resets the form and goes back on its own.
* `leave()` asks before discarding and answers no by default.
* Errors use the message table and never show a lower layer's message.
* Copy follows section 10: sentence case, no exclamation marks, same names.
* The test file covers every case of 14.1 that applies to the screen.
* No test-only export was added to the screen or its routes file.

## 16. Questions that keep coming back

**Can an edit screen open another edit screen?** Yes, through the navigator,
with the other screen's id. The first screen keeps its draft; when the second
one goes back, the first renders again with what it had.

**Where do field descriptors live?** In the screen file, at module level,
next to the rules. The forms pattern of the app describes their shape.

**Should save return the saved record?** No. It returns `{ ok }` and, on
failure, `errors`. A caller that needs the record reads it from storage.

**What if two fields depend on each other?** Write a cross-field check as a
separate function that adds its message under the field the user has to
change, and call it from `validate()` after the field rules.

**Can a screen show a toast after saving?** The shell shows it, not the
screen. The screen tells the shell through what it returns and through the
params of going back.

**Why not keep the draft in the store?** The store is shared state. A draft
belongs to one screen and dies with it; putting it in the store makes two
screens fight over it.

**What about autosave?** The team does not autosave drafts. A feature that
needs it writes a separate draft record under its own key, never the record
being edited.

**Can a confirmation screen be skipped in tests?** Yes: inject a
`confirmDiscard` or a confirm double that answers right away. The screen does
not know whether a person or a test answered.

## 17. Glossary

* **Draft**: the values an edit screen holds before saving, kept in a form.
* **Clean**: a draft equal to the values it started from.
* **Dirty**: a draft that differs from the values it started from.
* **Create mode**: an edit screen opened with an id that has no record yet.
* **Register function**: the function of a routes file that builds the
  feature's screens and registers them on the navigator.
* **Shell**: the part of the app around the screens: header, history menu,
  dialogs and toasts.
* **Message table**: the list of user-facing error messages by error code,
  kept with the error model.

## Changes to this handbook

* Section 6 was split into five steps after reviews kept finding saves that
  navigated before writing.
* Section 7 gained the default of `confirmDiscard` after a draft was lost in
  a demo.
* Section 14.1 replaced a looser list after a screen shipped without a test
  for the refused leave.
* Section 16 collects the questions of the first two quarters; new questions
  go at the end.
