# Vibeflow — Append Snippet

> A minimal snippet for an existing `.github/copilot-instructions.md`. Without
> one, skip this file: Copilot auto-applies
> `.github/instructions/vibeflow/vibeflow.instructions.md` through that file's
> `applyTo: '**'` frontmatter.

---

**Append the block below** to your existing `.github/copilot-instructions.md`:

```markdown
<!-- vibeflow:start -->
## Vibeflow (Spec-Driven Development)

This repo uses Vibeflow. See `.github/instructions/vibeflow/vibeflow.instructions.md` for the full methodology, guardrails, and available prompts.

Before any non-trivial task, follow: `discover → analyze → gen-spec → prompt-pack → implement → audit`.

Before any task, read `.vibeflow/index.md` and `.vibeflow/conventions.md` (if they exist).
<!-- vibeflow:end -->
```
