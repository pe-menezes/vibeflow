### Critical Gate
Left out of the package: none
- 🔴 CRITICAL [SEC101] javascript/adminRoutes.js:2 (removed line) — `router.use(requireAuth)` removed, so the admin router no longer requires authentication (blocks)
- 🔴 CRITICAL [SEC101] javascript/adminRoutes.js:7 (removed line) — `app.use("/admin", checkJwt)` removed, so the JWT guard is gone from `/admin` and nothing authenticates admin routes any more (blocks)
- 🔴 CRITICAL [SEC104] javascript/settings.js:2 — hardcoded secret: `apiToken` is assigned a string literal of 8 or more characters (blocks)
- 🔴 CRITICAL [SEC104] javascript/settings.js:7 — hardcoded secret: `signingKey` is assigned a string literal of 8 or more characters (blocks)
- 🔴 CRITICAL [DAT101] javascript/maintenance.js:2 — mass delete: `Order.deleteMany({})` with an empty filter wipes every order (blocks)
- 🟠 HIGH [SEC106] javascript/httpClient.js:2 — cert verification off: `NODE_TLS_REJECT_UNAUTHORIZED = "0"` (blocks)
- 🟠 HIGH [SEC106] javascript/httpClient.js:8 — cert verification off: `https.Agent({ rejectUnauthorized: false })` (blocks)
- 🟠 HIGH [DAT102] javascript/customers.js:3 — PII exposure: the response returns `customer.cpf` (blocks)
- 🟠 HIGH [DAT102] javascript/customers.js:9 — PII exposure: the export response returns `customer.taxId`, a tax identifier like the CPF (blocks)
- 🟡 WARNING [SEC108] javascript/jobs.js:2 — dynamic exec: `child_process.exec` runs a shell command built from interpolated `name`
- 🟡 WARNING [SEC108] javascript/jobs.js:8 — dynamic exec: `child_process.spawn(..., { shell: true })` runs a shell command built from interpolated `path`
- 🟡 WARNING [DAT104] javascript/sessions.js:2 — logging sensitive data: `console.log` writes the `token`
- 🟡 WARNING [DAT104] javascript/sessions.js:8 — logging sensitive data: `log.info` writes the `password`

No overrides: the change has no spec, no PR body and no `vibeflow:allow` comment. Checked and not matched: `javascript/helpers.js:2` (a comment saying not to use eval), `javascript/helpers.js:8` (a UI hint string, not a credential assignment) and `javascript/helpers.js:13` (an added test title naming `requireAuth`, while SEC101 only fires on removed lines).