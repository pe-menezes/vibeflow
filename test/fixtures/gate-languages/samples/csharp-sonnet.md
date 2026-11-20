### Critical Gate
Left out of the package: none
- 🔴 CRITICAL [SEC101] csharp/AdminRoutes.cs:3 — `[Authorize]` removed from `AdminUsersController` (blocks)
- 🔴 CRITICAL [DAT101] csharp/Maintenance.cs:3 — `db.Orders.ExecuteDeleteAsync()` with no filter deletes every order (blocks)
- 🔴 CRITICAL [SEC104] csharp/Settings.cs:3 — hardcoded `ConnectionPassword` literal of 8 or more characters (blocks)
- 🟠 HIGH [DAT102] csharp/Customers.cs:5 — response now returns `card.CardNumber` (blocks)
- 🟠 HIGH [SEC106] csharp/HttpClient.cs:2 — `DangerousAcceptAnyServerCertificateValidator` turns off certificate verification (blocks)
- 🟡 WARNING [SEC108] csharp/Jobs.cs:3 — `Process.Start("bash", -c …)` runs a command built from the `name` parameter
- 🟡 WARNING [DAT104] csharp/Sessions.cs:3 — the login password is written to the log