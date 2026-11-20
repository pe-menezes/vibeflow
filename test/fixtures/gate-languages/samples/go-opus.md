### Critical Gate
Left out of the package: none
- 🔴 CRITICAL [SEC101] go/admin_routes.go:2 — auth middleware `admin.Use(AuthRequired())` removed from the `/admin` route group, so `/admin/users` is now unauthenticated (line 2 of the old file) (blocks)
- 🔴 CRITICAL [SEC104] go/settings.go:2 — hardcoded secret: `dbPassword` assigned a string literal of 8 or more characters (blocks)
- 🔴 CRITICAL [SEC104] go/settings.go:7 — hardcoded secret: HMAC key `hmacKey` built from a string literal of 8 or more characters (blocks)
- 🔴 CRITICAL [DAT101] go/maintenance.go:2 — mass delete: `db.Exec("DELETE FROM orders")` with no `WHERE` wipes the whole table (DS106's pattern, inside Go source) (blocks)
- 🟠 HIGH [DAT102] go/customers.go:3 — PII exposure: `card_number` written to the HTTP response (blocks)
- 🟠 HIGH [SEC106] go/http_client.go:2 — cert verification off: `tls.Config{InsecureSkipVerify: true}` (blocks)
- 🟠 HIGH [SEC106] go/http_client.go:8 — cert verification off: `InsecureSkipVerify: skipVerify`, where `skipVerify := true` is set on line 7 (blocks)
- 🟡 WARNING [SEC108] go/jobs.go:2 — dynamic exec: `exec.Command("sh", "-c", …)` with the caller's `name` concatenated into the shell string
- 🟡 WARNING [SEC108] go/jobs.go:7 — dynamic exec: `os.StartProcess("/bin/sh", … "-c", "convert " + path …)` with the caller's `path` concatenated into the shell string
- 🟡 WARNING [DAT104] go/sessions.go:2 — logging sensitive data: `logger.Info` logs `token`
- 🟡 WARNING [DAT104] go/sessions.go:7 — logging sensitive data: `log.Printf` logs `password`

Not findings: the comment that mentions `password` (go/helpers.go:2), the word "purge" inside a confirmation string (go/helpers.go:8), the test name `TestArchiveNeverCallsExec` (go/helpers.go:13), and `tax_id` (go/customers.go:9), which is not on the DAT102 list. No `vibeflow:allow` overrides are present. Verdict: **FAIL**.