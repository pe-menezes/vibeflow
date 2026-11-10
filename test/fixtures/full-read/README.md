# Full-read fixture

A synthetic app for measuring whether a workflow reads the pattern documents
it is told to read, end to end. It is the sample app of the
[external-import fixture](../external-import/README.md) in the state a 1.18.0
`teach --from` import leaves it, scaled up to the size of a real project, with
four canary rules placed where a partial read misses them. Everything here is
invented; no real team, product or app is described.

Nothing in this folder calls a model. `test/full-read-fixture.test.mjs` holds
this README's tables to the prepared app, and `test/full-read-measure.test.mjs`
holds the meter to synthetic transcripts. The runs below are done by hand, in
fresh sessions.

## Why it exists

In the external-import fixture the documents are small: `conventions.md` is
718 bytes and the local patterns 500 to 1,550 bytes, so one `cat` of all of
them fits in a tool result and a session sees everything by accident. In a
real project the same reads come back cut: a `cat` of `conventions.md` with
three patterns passes 40 KB and the session sees the 2 KB preview, a `Read`
with an offset skips the start, and a keyword search sees one line of a
519-line document. This fixture is large enough for those cuts to happen, and
each canary is a rule that only a full read of its document can carry into
the code.

## What it holds

* **`app/`** is laid over a copy of the external-import `app/`: the code and
  tests come from there unchanged, except `src/navigation/navigator.js`, whose
  `back(params)` passes its params to the screen it returns to.
* **`app/vibeflow/`** (renamed `.vibeflow/` in the copy, since this
  repository's `.gitignore` hides that name) replaces `conventions.md` and
  `index.md`, rewrites five of the 13 local patterns at real size, and adds
  `patterns/external-team-conventions/` with six imported documents and their
  `registry.md`. `index.md` carries the `## Imported Sources` block of 1.18.0
  right after the Pattern Registry. The import is written by hand, with an
  invented `source_ref` and `source_commit`; no `teach` run produced it.
* **`spec/profile-edit.md`** is the fixed spec, in the 1.18.0 format, of an
  edit-profile screen that touches all four canaries. It lists the documents
  that own them under Applicable Patterns but copies none of their text.
* **`feature/`** is that feature implemented, laid over the app in the audit
  stage: right in everything the spec and its documents ask, except the four
  canaries. Where an example of an imported document and a rule of another
  disagree, the feature follows the rule: the logging convention's example
  types event names in the call, and the code style rule says event names are
  declared once and imported, so the feature logs through a frozen `EVENTS`
  object. Two more points of the feature follow one document and can be read
  against another: when the storage adapter refuses a save, the screen shows
  a fixed sentence written in the screen itself, where the conventions say
  user messages come from the message table in `src/errors/` (the handbook's
  section 8 asks for a sentence that says what the user can try, and the
  table would give "Something went wrong"), and it logs that handled failure
  at `error`, as the handbook's section 6.3 asks, where the logging rule keeps
  `error` for what is not handled. Neither is a canary. An audit that names
  them is not wrong, and step 4 of the reproduction run counts only the
  violations of the four canaries.

## Prepare

```
node test/fixtures/full-read/prepare.mjs <empty or missing directory> --stage genspec|implement|audit
```

It builds `<dir>/app` as a git repository and prints one line of JSON:

```
{"stage":"<stage>","app":"<dir>/app","spec":"<dir>/app/.vibeflow/specs/profile-edit.md"}
```

| Stage | Commits | `.vibeflow/specs/` | Feature code |
|---|---|---|---|
| `genspec` | 1 | absent (`"spec": null`) | absent |
| `implement` | 1 | the fixed spec | absent |
| `audit` | 1 | the fixed spec | laid over the commit, uncommitted |

In the audit stage the feature is left the way an `implement` run leaves its
work: the changed files (`src/app.js`, `test/home.test.js`) are modified and
the new ones are untracked, nothing staged, so an audit finds the feature in
the diff against `HEAD` and the documents it must read unchanged.

Author, committer and date are fixed (`2026-01-20T12:00:00Z`). A directory
that is not empty is refused and left untouched; a missing or unknown stage is refused
before anything is created. Inherited `GIT_*` variables are dropped.

## Canaries

Each canary is one line, written as a rule a team would keep, that a model
does not follow unless it read that line. The marker is the part of the line
that the tests look for: it appears in the owner file and nowhere else in the
prepared app, at any stage, and the app's code does not follow the rule
before the feature is written.

| Id | File | Line | Marker | Text |
|---|---|---|---|---|
| C1 | `.vibeflow/conventions.md` | 138 | `// feature:` | - Every new file under `src/features/` opens with the line `// feature: <name>`, where `<name>` is the feature's folder. |
| C2 | `.vibeflow/patterns/forms.md` | 81 | `profile-edit--` | - A field id is `<screen-id>--<field>` in kebab-case, with the screen id first: `profile-edit--display-name`. |
| C3 | `.vibeflow/patterns/external-team-conventions/claude-rules-code-style.md` | 84 | `LIMITS` | * Numeric limits live in a frozen `LIMITS` object exported from the feature's `constants.js`, and a validation call reads them from it instead of taking a bare number. |
| C4 | `.vibeflow/patterns/external-team-conventions/docs-screens.md` | 251 | `saved: true` | * A screen that saves goes back with `navigator.back({ saved: true })` and never navigates forward to the screen it came from. |

C1, C2 and C3 are the last line of their file. C4 is line 251 of 529, at
47% of the document. The local `patterns/validation.md` shows a bare number
in a `maxLength` call, as the app's code does today, so a session that skips
C3 copies the local example.

## Scale

Measured with `wc -l -c` on a prepared app (the test checks every number):

| Document | Lines | Bytes |
|---|---|---|
| `.vibeflow/conventions.md` | 138 | 6716 |
| `.vibeflow/patterns/forms.md` | 81 | 2981 |
| `.vibeflow/patterns/validation.md` | 65 | 2730 |
| `.vibeflow/patterns/storage.md` | 57 | 2265 |
| `.vibeflow/patterns/navigation.md` | 76 | 2952 |
| `.vibeflow/patterns/testing.md` | 65 | 2412 |
| `.vibeflow/patterns/external-team-conventions/claude-rules-navigation.md` | 74 | 2871 |
| `.vibeflow/patterns/external-team-conventions/claude-rules-code-style.md` | 84 | 3310 |
| `.vibeflow/patterns/external-team-conventions/docs-screens.md` | 529 | 21609 |
| `.vibeflow/patterns/external-team-conventions/claude-rules-testing.md` | 62 | 2253 |
| `.vibeflow/patterns/external-team-conventions/cursor-rules-logging.md` | 66 | 2420 |

The five local patterns the spec lists are 2 to 5 KB each; the other eight
local patterns are the external-import ones (500 to 800 bytes). The five
imported documents the spec lists sum 32,463 bytes, and `docs-screens.md`
has 529 lines. With `conventions.md`, the documents a consumer is told to
read sum 52,519 bytes: one `cat` of all of them comes back as a preview.

## Audit stage

The uncommitted feature and its tests sit over the implement commit; the
app's suite is green. Each canary is broken once or more, without
a comment or a name that points at the rule:

| Id | File | Line | Code |
|---|---|---|---|
| C1 | `src/features/profile/profile-edit-screen.js` | 1 | `// The edit-profile screen:` |
| C1 | `src/features/profile/navigation/profile-routes.js` | 1 | `// Routes of the profile feature:` |
| C2 | `src/features/profile/profile-edit-screen.js` | 9 | `id: 'display-name'` |
| C3 | `src/features/profile/profile-edit-screen.js` | 14 | `maxLength('Display name', 40)` |
| C4 | `src/features/profile/profile-edit-screen.js` | 88 | `rendered: navigator.back()` |

C1: both new files open with a module comment instead of the feature line.
C2: the field ids carry the field only (`display-name`, `bio`). C3: the limits
are bare numbers in the rules object and there is no `constants.js`. C4: a
successful save goes back without params.

## Measure

```
node test/fixtures/full-read/measure.mjs --transcript <session.jsonl> [--transcript <more.jsonl>] --app <prepared app> [--spec <spec>] [--json]
```

It reads only the transcripts, the app's documents, the spec and this
README; it calls no model and no network. The target documents are
`.vibeflow/conventions.md` plus every `.vibeflow/patterns/**.md` that the spec
lists under Applicable Patterns (without `--spec`, the fixed spec of this
folder). For each one it prints:

* **opened**: some `Read`, `Bash` or `Grep` call pointed at it. Paths are
  compared by their real path, so `--app /tmp/...` matches a session that
  ran in `/private/tmp/...`; a relative path in a command is read against the
  `cwd` the transcript records for the call (and the one before it, since the
  record already shows a `cd` of the command), or by its end when the
  transcript has no `cwd`. The `cd`s of the command count, in order: an
  absolute one adds its path, and a relative one starts from every directory
  known before it, the recorded ones and the ones the earlier `cd`s of the
  same command reached, so in `cd a/b && cat x; cd ../..; cat c/y` the path
  `c/y` is read from the directory the command started in;
* **seen / distinctive** and **coverage**: a line counts as distinctive when
  it has 20 characters or more after trimming and occurs once across the
  target documents; it counts as seen when it appears whole, trimmed, as a
  line of the `content` of a tool result, after the `Read` line-number prefix
  and the `path:line:` prefix of `grep -n` (or the `line:` prefix it prints
  for one file, and `-` for context lines) are taken off. Only `content`
  counts, never `toolUseResult.stdout`, which keeps output the model never
  saw;
* **canary**: whether the canary line of this README's table owned by the
  document was seen;
* **how**: `Read whole` (no `offset` or `limit` and `numLines` equal to
  `totalLines`), `Read range`, `Bash` (the command names the file or a glob
  that matches it), `Grep`, and `truncated` when the result carries
  `<persisted-output>` or `exceeds maximum allowed tokens`.

It ends with a summary: `N of M documents read whole; canaries seen: C1 yes,
C2 no, ...`, where "whole" means 100% coverage.

## Reproduction run

Each consumer runs in a new session on its own prepared directory, with the
model declared on the command line. The plugin under test is the working
tree's `plugins/vibeflow`, with any installed copy disabled. The run of each
consumer is one `claude -p` call with `--output-format json`; its
`session_id` names the transcript, written under
`~/.claude/projects/<working directory with / and . turned into ->/<session_id>.jsonl`.
When a consumer starts subagents, their transcripts sit in a folder named
after the session next to it; pass each one with another `--transcript`.

```
node test/fixtures/full-read/prepare.mjs /tmp/full-read-<consumer> --stage <stage>
cd <app>
claude -p --model <model> --plugin-dir <worktree>/plugins/vibeflow --permission-mode acceptEdits --output-format json "<request>"
node <worktree>/test/fixtures/full-read/measure.mjs --transcript <session.jsonl> --app <app> [--spec <spec>]
```

1. **`gen-spec`**, stage `genspec`. Request:
   `/vibeflow:gen-spec Add a profile feature with an edit-profile screen at profile/edit: the user edits the display name (required, at most 40 characters) and the bio (at most 160), saves a valid draft and returns to where they came from; leaving a dirty draft asks first. Register the routes in src/app.js.`
   Measure with `--spec <the spec it wrote>`. Then check the spec it wrote:
   a spec that read the documents carries the four rules into its Definition
   of Done or Technical Decisions; record which of the four markers appear
   (`grep -n -F -e '// feature:' -e 'profile-edit--' -e 'LIMITS' -e 'saved: true' <spec>`).
2. **`implement`**, stage `implement`. Request:
   `/vibeflow:implement .vibeflow/specs/profile-edit.md`.
   Measure without `--spec`. Then check the code against the canaries: the
   first line of each new file under `src/features/profile/`, the field ids,
   a `constants.js` with `LIMITS`, and the `navigator.back` call of `save()`.
3. **`prompt-pack`**, stage `implement`. Request:
   `/vibeflow:prompt-pack .vibeflow/specs/profile-edit.md`.
   Measure without `--spec`, and check which markers the pack carries.
4. **`audit`**, stage `audit`. Request:
   `/vibeflow:audit .vibeflow/specs/profile-edit.md`.
   Measure without `--spec`. Then check the report: each violation of the
   table above is a finding that names the rule and its document. Only those
   four count; the two points of the feature that "What it holds" names
   (the save-failure sentence and its `error` log) are not canaries.

The defect reproduces when a consumer leaves documents it was told to read
below 100% coverage and misses a canary it owns; the fix is measured by the
same commands, with every target document read whole and the four canaries
seen.
