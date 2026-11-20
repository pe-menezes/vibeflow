### Critical Gate
Left out of the package: none
Clean — no destructive operations detected.

Note: every changed file is `*.sh`, and no rule in the catalog targets shell scripts, so no rule could fire. The diff still adds lines that would match rules if they applied to `*.sh`:
- `curl --insecure` in shell/http_client.sh:2 turns off certificate checks.
- `eval "$HOOK_COMMAND"` in shell/jobs.sh:2 runs a command built from a variable.
- A `cpf` value is printed in shell/customers.sh:2.
- A token is written to a log in shell/sessions.sh:2.
- A literal `API_TOKEN` is set in shell/settings.sh:2.
- `rm -rf` in shell/maintenance.sh:2 deletes every upload.

None of these is a gate finding, but they are worth a manual review.