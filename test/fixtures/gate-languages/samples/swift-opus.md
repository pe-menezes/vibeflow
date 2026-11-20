### Critical Gate
Left out of the package: none

No catalog rule fired. Every changed file is `.swift`, and the Security and Data rules only target `*.py, *.js, *.ts, *.rb, *.go, *.java`. That means this diff falls outside the gate's coverage. It does not mean the diff is safe. The gate puts no cap on the verdict, but the following changed lines match the intent of a rule and need a human review before this is called safe:

- ⚠️ OUT OF COVERAGE [SEC101-like] swift/AdminRoutes.swift:2 (removed line): `User.guardMiddleware()` was taken off the `admin` route group, so `admin/users` no longer requires an authenticated user.
- ⚠️ OUT OF COVERAGE [SEC106-like] swift/HttpClient.swift:3: the URLSession challenge handler accepts any server trust, which turns off certificate verification.
- ⚠️ OUT OF COVERAGE [SEC104-like] swift/Settings.swift:3: `clientSecret` is assigned a string literal of 8 or more characters (the value claims to be a fixture).
- ⚠️ OUT OF COVERAGE [DAT101-like] swift/Maintenance.swift:2: an `NSBatchDeleteRequest` with no predicate deletes every `Order`.
- ⚠️ OUT OF COVERAGE [DAT102-like] swift/Customers.swift:3: the full `cardNumber` is returned in the `cards/:id` response.
- ⚠️ OUT OF COVERAGE [DAT104-like] swift/Sessions.swift:2: the login token is logged with `privacy: .public`.
- ⚠️ OUT OF COVERAGE [SEC108-like] swift/Jobs.swift:4: `/bin/sh -c` runs a command that interpolates `name`, which allows shell injection.

These lines match a keyword but are not risks: swift/Helpers.swift:2 is a comment saying eval is *not* used, swift/Helpers.swift:7 is a "CPF" input field label, and swift/Helpers.swift:13 is a test name containing "Purge".