# gate-languages fixture

Measures what the audit's Critical Gate (step 4 of `plugins/vibeflow/skills/audit/SKILL.md`)
flags in each programming language. The same seven dangerous behaviours of the Security and Data
domains are written in 13 languages, next to decoys that carry a catalog word without being the
behaviour. A model runs the step elsewhere; the scripts here build the input and read the output.
Nothing here calls a model or the network.

## Files

* `matrix.mjs`: the languages, the behaviours, the planted cases, the decoys, the not-applicable
  pairs with their reason, and `CATALOG_1_20`, a frozen copy of what the 1.20.0 catalog writes in
  its Security and Data domains (the file list and the terms of each rule). The labels of each case
  are computed from it by `extensionListed` and `tokenListed`, never written by hand.
* `make.mjs <dest>`: builds `<dest>/repo`, a git repository with two commits (the base and the
  change), and `<dest>/manifest.json`, the list of cases. `<dest>` must be missing or empty.
  Author, committer and date are fixed, so two runs build the same commits.
* `gate-prompt.mjs --skill <SKILL.md> --diff <file>`: prints the request for one isolated run of
  the step: the step taken from the given `SKILL.md` by structure, the lines of its
  `### Critical Gate` output section, and the diff.
* `measure.mjs --manifest <json> --report <file> [--report <another>] [--json]`: reads the
  `### Critical Gate` section of each report and prints what was detected, by quadrant, language
  and rule, the decoys flagged, the findings on another rule and the findings outside the manifest,
  per report and summed. The matching rule is in its header. Exit 0 when it read everything, 64 on
  a wrong argument or an unreadable file: it is a measure, not a gate.

A run, with the scratch directory of your choice:

```
node test/fixtures/gate-languages/make.mjs <scratch>/gl
git -C <scratch>/gl/repo diff HEAD~1 HEAD > <scratch>/gl.diff
node test/fixtures/gate-languages/gate-prompt.mjs --skill plugins/vibeflow/skills/audit/SKILL.md --diff <scratch>/gl.diff > <scratch>/prompt.md
# run a model on prompt.md and save its answer as <scratch>/report.md
node test/fixtures/gate-languages/measure.mjs --manifest <scratch>/gl/manifest.json --report <scratch>/report.md
```

## What it measures

* **Quadrants.** Each planted case has two labels: `extensionListed` (its extension is on the
  1.20.0 list `*.py,*.js,*.ts,*.rb,*.go,*.java`) and `tokenListed` (its planted lines hold a term
  the rule names in 1.20.0, as a word, in any case; for DAT104, a logging call the rule names and
  one of the words it names). The measure splits detection along the four combinations, so a
  version of the catalog that reads behaviour instead of extension and keyword shows up as a
  higher rate in the three quadrants other than "listed, listed".
* **Two variants.** In the six listed languages, where the catalog names a term of that ecosystem
  (`TERM_ECOSYSTEMS` in `matrix.mjs` says which), the pair has a `catalog` variant with the term and
  an `other` variant with another form of the same behaviour and no catalog term
  (`subprocess.call` against `subprocess.run`).
* **Decoys.** Three per language: a catalog word in a comment, in a string shown to a user (a label
  or an error message) and in a test or function name. A finding there is a false positive.
* **Coverage.** What the section said beyond findings (the `Left out of the package:` line, "Clean",
  "No diff scanned", any other line) is printed per report.

## What it does not measure

* The files are snippets in the idiom of each language, not programs that build: imports, classes
  and declarations are left out where they would only add lines.
* One run of a model is one sample. Comparing two versions of the step takes several runs of each,
  passed together to `measure.mjs`.
* The secret planted for SEC104 is fake and has no key format of any provider. The source of the
  matrix writes it only by interpolation, so no versioned file here looks like a secret to the
  review package of the loop kit; the generated files hold the whole line, and the table below
  shows it as `<fake>`.
* It does not judge the catalog: it gives the material to measure it.
* A finding on a removed line (SEC101) is matched by its line number in the base commit.

## Cases

Generated from `matrix.mjs` by `casesTable()`; a test fails when this table and the matrix
disagree. Line numbers are in the change, except for SEC101, in the base. `⏎` joins the lines of a
planted block.

<!-- cases:start -->
| Id | Kind | Ext. listed | Term listed | Line | Planted | Why |
|---|---|---|---|---|---|---|
| python-SEC101-catalog | catalog | yes | yes | 2 (base) | `@login_required` | Flask-Login decorator that keeps anonymous users out of the admin view, removed. |
| python-SEC101-other | other | yes | no | 8 (base) | `@jwt_required()` | flask-jwt-extended decorator that demands a valid token, removed. |
| python-SEC104-catalog | catalog | yes | yes | 2 | `DATABASE_PASSWORD = "<fake>"` | Module-level settings constant holding the database password as a literal. |
| python-SEC104-other | other | yes | no | 7 | `SMTP_PASS = "<fake>"` | Same literal credential under a name the catalog does not list. |
| python-SEC106-catalog | catalog | yes | yes | 2 | `response = requests.get(url, verify=False)` | requests call with certificate verification turned off. |
| python-SEC106-other | other | yes | no | 7 | `context = ssl._create_unverified_context()` | Standard-library SSL context that skips certificate verification. |
| python-SEC108-catalog | catalog | yes | yes | 2 | `subprocess.call(f"tar -czf {name}.tgz reports/", shell=True)` | Shell command built from a parameter and run through subprocess.call. |
| python-SEC108-other | other | yes | no | 7 | `subprocess.run(f"convert {path} -resize 200x200 thumb.png", shell=True)` | The same through subprocess.run, the call current code uses. |
| python-DAT101-idiomatic | idiomatic | yes | no | 2 | `Order.objects.all().delete()` | Django queryset delete of every row of the table. |
| python-DAT102-catalog | catalog | yes | yes | 3 | `return JsonResponse({"name": customer.name, "card_number": customer.card_number})` | JSON response with the full card number, no mask. |
| python-DAT102-other | other | yes | no | 8 | `return JsonResponse({"name": customer.name, "tax_id": customer.tax_id})` | JSON response with the personal tax document number, no mask. |
| python-DAT104-catalog | catalog | yes | yes | 2 | `logger.info("login attempt user=%s password=%s", user, password)` | Module logger writes the password in clear text. |
| python-DAT104-other | other | yes | no | 7 | `logging.debug("refresh user=%s token=%s", user, token)` | Root logging call writes the session token. |
| python-SEC108-decoy-comment | decoy (comment) | yes | yes | 2 | `# never pass the text to eval, parse it` | The word eval is in a comment. |
| python-DAT102-decoy-string | decoy (string) | yes | yes | 7 | `tax_id = forms.CharField(label="CPF or CNPJ")` | CPF and CNPJ are a field label. |
| python-DAT101-decoy-name | decoy (name) | yes | yes | 12 | `def test_purge_button_needs_confirmation(client):` | purge is in a test name. |
| javascript-SEC101-catalog | catalog | yes | yes | 2 (base) | `router.use(requireAuth);` | Express router-level auth middleware, removed. |
| javascript-SEC101-other | other | yes | no | 7 (base) | `app.use("/admin", checkJwt);` | JWT check mounted on the admin path, removed. |
| javascript-SEC104-catalog | catalog | yes | yes | 2 | `const apiToken = "<fake>";` | API token as a string literal in a config module. |
| javascript-SEC104-other | other | yes | no | 7 | `const signingKey = "<fake>";` | Signing key as a string literal, under a name the catalog does not list. |
| javascript-SEC106-catalog | catalog | yes | yes | 2 | `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";` | Node-wide switch that accepts any certificate. |
| javascript-SEC106-other | other | yes | no | 8 | `return new https.Agent({ rejectUnauthorized: false });` | HTTPS agent that accepts any certificate. |
| javascript-SEC108-catalog | catalog | yes | yes | 2 | `` child_process.exec(`tar -czf ${name}.tgz reports/`); `` | Shell command built from a parameter, run by child_process.exec. |
| javascript-SEC108-other | other | yes | no | 8 | `` child_process.spawn(`convert ${path} -resize 200x200 thumb.png`, { shell: true }); `` | The same through spawn with a shell. |
| javascript-DAT101-idiomatic | idiomatic | yes | no | 2 | `await Order.deleteMany({});` | Mongoose deleteMany with an empty filter removes every document. |
| javascript-DAT102-catalog | catalog | yes | yes | 3 | `res.json({ name: customer.name, cpf: customer.cpf });` | Response carries the full CPF, no mask. |
| javascript-DAT102-other | other | yes | no | 9 | `res.json({ name: customer.name, taxId: customer.taxId });` | Response carries the full tax document number, no mask. |
| javascript-DAT104-catalog | catalog | yes | yes | 2 | `console.log("login", user, "token", token);` | console.log of the session token. |
| javascript-DAT104-other | other | yes | no | 8 | `log.info({ user, password }, "refresh");` | Structured log (pino style) of the password. |
| javascript-SEC108-decoy-comment | decoy (comment) | yes | yes | 2 | `// do not eval the text, parse it` | The word eval is in a comment. |
| javascript-SEC104-decoy-string | decoy (string) | yes | yes | 8 | `return "Your password needs at least 12 characters";` | password is in a message shown to the user. |
| javascript-SEC101-decoy-name | decoy (name) | yes | yes | 13 | `it("requireAuth sends anonymous users to /login", async () => {` | requireAuth is in a test name. |
| typescript-SEC101-catalog | catalog | yes | yes | 2 (base) | `adminRouter.use((req, res, next) => (req.isAuthenticated() ? next() : res.sendStatus(401)));` | Passport isAuthenticated guard on the admin router, removed. |
| typescript-SEC101-other | other | yes | no | 7 (base) | `@UseGuards(AuthGuard("jwt"))` | NestJS guard on the admin controller, removed. |
| typescript-SEC104-catalog | catalog | yes | yes | 2 | `export const WEBHOOK_SECRET = "<fake>";` | Webhook secret as an exported string literal. |
| typescript-SEC104-other | other | yes | no | 7 | `export const signingKey: string = "<fake>";` | Typed signing key literal, under a name the catalog does not list. |
| typescript-SEC106-catalog | catalog | yes | yes | 2 | `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";` | Node-wide switch that accepts any certificate. |
| typescript-SEC106-other | other | yes | no | 7 | `httpsAgent: new https.Agent({ rejectUnauthorized: false }),` | axios client whose agent accepts any certificate. |
| typescript-SEC108-catalog | catalog | yes | yes | 2 | `return eval(formula);` | eval of a string the caller passes. |
| typescript-SEC108-other | other | yes | no | 7 | `` return new Function(`return ${formula}`) as () => number; `` | The Function constructor runs the same string as code. |
| typescript-DAT101-idiomatic | idiomatic | yes | no | 2 | `await prisma.order.deleteMany();` | Prisma deleteMany with no filter removes every row. |
| typescript-DAT102-catalog | catalog | yes | yes | 3 | `res.json({ name: patient.name, ssn: patient.ssn });` | Response carries the full SSN, no mask. |
| typescript-DAT102-other | other | yes | no | 9 | `res.json({ holder: card.holder, pan: card.pan, expiry: card.expiry });` | Response carries the full card number (PAN), no mask. |
| typescript-DAT104-catalog | catalog | yes | yes | 2 | `` console.log(`login ${user} password=${password}`); `` | console.log of the password. |
| typescript-DAT104-other | other | yes | no | 8 | `console.info("rotate", { user, apiKey });` | console.info of the API key. |
| typescript-DAT101-decoy-comment | decoy (comment) | yes | yes | 2 | `// archive only: purge stays a manual job` | purge is in a comment. |
| typescript-SEC106-decoy-string | decoy (string) | yes | yes | 8 | `tls: "Certificate check failed: never set verify=false to get past it",` | verify=false is in an error message. |
| typescript-SEC104-decoy-name | decoy (name) | yes | yes | 13 | `it("rejects an empty api_key", () => {` | api_key is in a test name. |
| ruby-SEC101-catalog | catalog | yes | yes | 2 (base) | `before_action :authenticate_user!` | Devise before_action that requires a signed-in user, removed. |
| ruby-SEC101-other | other | yes | no | 10 (base) | `before_action :require_login` | Sorcery-style login filter, removed. |
| ruby-SEC104-catalog | catalog | yes | yes | 3 | `config.api_key = "<fake>"` | Initializer sets the API key to a literal. |
| ruby-SEC104-other | other | yes | no | 9 | `config.auth_pass = "<fake>"` | Initializer sets the mail credential to a literal, under a name the catalog does not list. |
| ruby-SEC106-idiomatic | idiomatic | yes | no | 3 | `http.verify_mode = OpenSSL::SSL::VERIFY_NONE` | Net::HTTP with certificate verification off. |
| ruby-SEC108-catalog | catalog | yes | yes | 2 | `system("tar -czf #{name}.tgz reports/")` | Kernel#system with an interpolated command string. |
| ruby-SEC108-other | other | yes | no | 7 | `` `convert #{path} -resize 200x200 thumb.png` `` | Backtick shell-out with an interpolated command string. |
| ruby-DAT101-catalog | catalog | yes | yes | 2 | `Order.delete_all` | Active Record delete_all on the whole model. |
| ruby-DAT101-other | other | yes | no | 7 | `ActiveRecord::Base.connection.execute("DELETE FROM invoices")` | Raw SQL delete of every invoice. |
| ruby-DAT102-catalog | catalog | yes | yes | 3 | `render json: { name: patient.name, ssn: patient.ssn }` | JSON response with the full SSN, no mask. |
| ruby-DAT102-other | other | yes | no | 9 | `render json: { name: patient.name, document_number: patient.document_number }` | JSON response with the full identity document number, no mask. |
| ruby-DAT104-catalog | catalog | yes | yes | 2 | `Rails.logger.info("login #{user} password=#{password}")` | Rails logger writes the password. |
| ruby-DAT104-other | other | yes | no | 8 | `puts "refresh #{user} token=#{token}"` | puts sends the token to the process log. |
| ruby-DAT102-decoy-comment | decoy (comment) | yes | yes | 2 | `# shows only the last digits of the CPF` | CPF is in a comment about masking. |
| ruby-SEC108-decoy-string | decoy (string) | yes | yes | 8 | `"Formulas are parsed, never run through eval"` | eval is in a help text. |
| ruby-DAT104-decoy-name | decoy (name) | yes | yes | 13 | `it "does not send the token to logger.info" do` | logger.info and token are in a test name. |
| go-SEC101-idiomatic | idiomatic | yes | no | 2 (base) | `admin.Use(AuthRequired())` | Gin group middleware that requires a user, removed. |
| go-SEC104-catalog | catalog | yes | yes | 2 | `const dbPassword = "<fake>"` | Package constant holding the database password. |
| go-SEC104-other | other | yes | no | 7 | `var hmacKey = []byte("<fake>")` | HMAC key as a byte-slice literal, under a name the catalog does not list. |
| go-SEC106-catalog | catalog | yes | yes | 2 | `return &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}` | TLS config that skips certificate verification. |
| go-SEC106-other | other | yes | no | 8 | `skipVerify := true ⏎ return &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: skipVerify}}}` | The same switch set through a variable, so the literal true is not on the field. |
| go-SEC108-catalog | catalog | yes | yes | 2 | `return exec.Command("sh", "-c", "tar -czf "+name+".tgz reports/").Run()` | os/exec runs a shell with a command built from a parameter. |
| go-SEC108-other | other | yes | no | 7 | `return os.StartProcess("/bin/sh", []string{"sh", "-c", "convert " + path + " thumb.png"}, &os.ProcAttr{})` | os.StartProcess runs the same kind of shell command. |
| go-DAT101-idiomatic | idiomatic | yes | no | 2 | `_, err := db.Exec("DELETE FROM orders")` | database/sql delete with no WHERE clause. |
| go-DAT102-catalog | catalog | yes | yes | 3 | `json.NewEncoder(w).Encode(map[string]string{"holder": card.Holder, "card_number": card.Number})` | Handler writes the full card number, no mask. |
| go-DAT102-other | other | yes | no | 9 | `json.NewEncoder(w).Encode(map[string]string{"name": customer.Name, "tax_id": customer.TaxID})` | Handler writes the full tax document number, no mask. |
| go-DAT104-catalog | catalog | yes | yes | 2 | `logger.Info("login", "user", user, "token", token)` | Structured logger (slog or zap) writes the token. |
| go-DAT104-other | other | yes | no | 8 | `log.Printf("refresh user=%s password=%s", user, password)` | Standard log package writes the password. |
| go-SEC104-decoy-comment | decoy (comment) | yes | yes | 2 | `// the password comes from the environment, never from this file` | password is in a comment. |
| go-DAT101-decoy-string | decoy (string) | yes | yes | 8 | `return "This will purge every archived order. Type the shop name to confirm."` | purge is in a confirmation message. |
| go-SEC106-decoy-name | decoy (name) | yes | no | 13 | `func TestInsecureSkipVerifyIsNeverSet(t *testing.T) {` | InsecureSkipVerify is in a test name. |
| java-SEC101-catalog | catalog | yes | yes | 2 (base) | `@PreAuthorize("isAuthenticated()")` | Spring Security method guard, removed. |
| java-SEC101-other | other | yes | no | 9 (base) | `http.authorizeHttpRequests(auth -> auth.requestMatchers("/admin/**").authenticated());` | Filter-chain rule that requires a login on /admin, removed. |
| java-SEC104-catalog | catalog | yes | yes | 3 | `static final String DB_SECRET = "<fake>";` | Constant holding the database secret. |
| java-SEC104-other | other | yes | no | 8 | `static final String SMTP_PASS = "<fake>";` | Constant holding the mail credential, under a name the catalog does not list. |
| java-SEC106-idiomatic | idiomatic | yes | no | 2 | `.loadTrustMaterial(null, TrustAllStrategy.INSTANCE)` | Apache HttpClient context that trusts every certificate. |
| java-SEC108-catalog | catalog | yes | yes | 2 | `Runtime.getRuntime().exec(new String[] {"sh", "-c", "tar -czf " + name + ".tgz reports/"});` | Runtime.exec runs a shell with a command built from a parameter. |
| java-SEC108-other | other | yes | no | 7 | `return new ProcessBuilder("sh", "-c", "convert " + path + " thumb.png").start();` | ProcessBuilder runs the same kind of shell command. |
| java-DAT101-idiomatic | idiomatic | yes | no | 3 | `orderRepository.deleteAll();` | Spring Data deleteAll removes every row. |
| java-DAT102-catalog | catalog | yes | yes | 4 | `return Map.of("name", customer.getName(), "cpf", customer.getCpf());` | Response carries the full CPF, no mask. |
| java-DAT102-other | other | yes | no | 11 | `return Map.of("name", customer.getName(), "taxId", customer.getTaxId());` | Response carries the full tax document number, no mask. |
| java-DAT104-catalog | catalog | yes | yes | 2 | `logger.info("login user={} password={}", user, password);` | SLF4J logger writes the password. |
| java-DAT104-other | other | yes | no | 8 | `System.out.println("refresh user=" + user + " token=" + token);` | Standard output writes the token. |
| java-SEC101-decoy-comment | decoy (comment) | yes | yes | 2 | `// public on purpose: no requireAuth here, the reports are open data` | requireAuth is in a comment. |
| java-DAT102-decoy-string | decoy (string) | yes | yes | 8 | `return "Credit card or SSN (only the last four digits are kept)";` | SSN is in a field label. |
| java-SEC108-decoy-name | decoy (name) | yes | yes | 13 | `void execIsNeverCalledWithUserInput() {` | exec is in a test name. |
| tsx-SEC101-idiomatic | idiomatic | no | no | 3 (base) | `if (!session) return <Navigate to="/login" replace />;` | Component guard that sends anonymous users to the login page, removed. |
| tsx-SEC104-idiomatic | idiomatic | no | yes | 2 | `export const MAPS_API_KEY = "<fake>";` | API key literal shipped in the client bundle. |
| tsx-SEC108-idiomatic | idiomatic | no | yes | 2 | `const value = eval(expression);` | Component evals a prop as code. |
| tsx-DAT101-idiomatic | idiomatic | no | no | 2 | `await supabase.from("orders").delete().neq("id", 0);` | Supabase delete whose filter matches every row. |
| tsx-DAT102-idiomatic | idiomatic | no | yes | 3 | `<tr><td>{customer.name}</td><td>{customer.cpf}</td></tr>` | Row renders the full CPF in the page, no mask. |
| tsx-DAT104-idiomatic | idiomatic | no | yes | 3 | `console.log("login", user, token);` | console.log of the session token in the browser. |
| tsx-SEC104-decoy-comment | decoy (comment) | no | yes | 2 | `// the token lives in an httpOnly cookie, never in this component` | token is in a comment. |
| tsx-DAT102-decoy-string | decoy (string) | no | yes | 8 | `return <label htmlFor="document">CPF / CNPJ</label>;` | CPF and CNPJ are a field label. |
| tsx-SEC108-decoy-name | decoy (name) | no | yes | 13 | `it("does not eval the expression", () => {` | eval is in a test name. |
| csharp-SEC101-idiomatic | idiomatic | no | no | 3 (base) | `[Authorize]` | ASP.NET Core [Authorize] attribute on the admin controller, removed. |
| csharp-SEC104-idiomatic | idiomatic | no | yes | 3 | `public const string ConnectionPassword = "<fake>";` | Constant holding the connection password. |
| csharp-SEC106-idiomatic | idiomatic | no | no | 2 | `handler.ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;` | HttpClientHandler that accepts any server certificate. |
| csharp-SEC108-idiomatic | idiomatic | no | no | 3 | `Process.Start("bash", $"-c \"tar -czf {name}.tgz reports/\"");` | Process.Start runs bash with an interpolated command. |
| csharp-DAT101-idiomatic | idiomatic | no | no | 3 | `await db.Orders.ExecuteDeleteAsync();` | EF Core ExecuteDeleteAsync on the whole set. |
| csharp-DAT102-idiomatic | idiomatic | no | no | 5 | `return Ok(new { card.Holder, card.CardNumber });` | Response carries the full card number, no mask. |
| csharp-DAT104-idiomatic | idiomatic | no | yes | 3 | `_logger.LogInformation("Login {User} with password {Password}", user, password);` | ILogger writes the password. |
| csharp-SEC101-decoy-comment | decoy (comment) | no | yes | 3 | `// no [Authorize] here: authenticate happens at the gateway` | authenticate is in a comment. |
| csharp-DAT104-decoy-string | decoy (string) | no | yes | 10 | `throw new InvalidOperationException("Do not pass the token to logger.LogDebug");` | logger.LogDebug and token are in an error message. |
| csharp-DAT101-decoy-name | decoy (name) | no | yes | 15 | `public async Task Purge_RequiresAdmin()` | Purge is in a test name. |
| kotlin-SEC101-idiomatic | idiomatic | no | yes | 2 (base) | `@PreAuthorize("isAuthenticated()")` | Spring Security method guard in Kotlin, removed. |
| kotlin-SEC104-idiomatic | idiomatic | no | no | 3 | `const val SIGNING_KEY = "<fake>"` | Constant holding the signing key. |
| kotlin-SEC106-idiomatic | idiomatic | no | no | 2 | `.sslSocketFactory(trustAllContext.socketFactory, trustAllManager) ⏎ .hostnameVerifier { _, _ -> true }` | OkHttp client with a trust-all manager and no hostname check. |
| kotlin-SEC108-idiomatic | idiomatic | no | yes | 2 | `Runtime.getRuntime().exec(arrayOf("sh", "-c", "tar -czf $name.tgz reports/"))` | Runtime.exec runs a shell with an interpolated command. |
| kotlin-DAT101-idiomatic | idiomatic | no | no | 3 | `orderRepository.deleteAll()` | Spring Data deleteAll removes every row. |
| kotlin-DAT102-idiomatic | idiomatic | no | yes | 4 | `return mapOf("name" to patient.name, "ssn" to patient.ssn)` | Response carries the full SSN, no mask. |
| kotlin-DAT104-idiomatic | idiomatic | no | yes | 2 | `logger.info("login user=$user token=$token")` | Logger writes the token. |
| kotlin-DAT104-decoy-comment | decoy (comment) | no | no | 2 | `// never log the password, only the user id` | password is in a comment about logging. |
| kotlin-SEC101-decoy-string | decoy (string) | no | yes | 8 | `const val LOGIN = "Please authenticate to see this page"` | authenticate is in a message shown to the user. |
| kotlin-SEC104-decoy-name | decoy (name) | no | yes | 13 | `` fun `secret is read from the vault`() { `` | secret is in a test name. |
| swift-SEC101-idiomatic | idiomatic | no | no | 2 (base) | `.grouped(User.guardMiddleware())` | Vapor guard middleware on the admin group, removed. |
| swift-SEC104-idiomatic | idiomatic | no | yes | 3 | `static let clientSecret = "<fake>"` | Client secret literal shipped in the app. |
| swift-SEC106-idiomatic | idiomatic | no | no | 3 | `completionHandler(.useCredential, URLCredential(trust: challenge.protectionSpace.serverTrust!))` | Delegate accepts any server trust without evaluating it. |
| swift-SEC108-idiomatic | idiomatic | no | no | 4 | `task.arguments = ["-c", "tar -czf \(name).tgz reports/"]` | Process runs sh -c with an interpolated command. |
| swift-DAT101-idiomatic | idiomatic | no | no | 2 | `let request = NSBatchDeleteRequest(fetchRequest: Order.fetchRequest()) ⏎ try context.execute(request)` | Core Data batch delete with no predicate. |
| swift-DAT102-idiomatic | idiomatic | no | no | 2 | `CardDTO(holder: card.holder, cardNumber: card.cardNumber)` | Response object carries the full card number, no mask. |
| swift-DAT104-idiomatic | idiomatic | no | yes | 2 | `logger.debug("Login \(user) token \(token, privacy: .public)")` | os Logger writes the token and marks it public. |
| swift-SEC108-decoy-comment | decoy (comment) | no | yes | 2 | `// no NSExpression or eval here: the text is parsed as a number` | eval is in a comment. |
| swift-DAT102-decoy-string | decoy (string) | no | yes | 9 | `TextField("CPF", text: $document)` | CPF is a field label. |
| swift-SEC106-decoy-name | decoy (name) | no | no | 15 | `func testVerifyFalseIsNeverAccepted() {` | verify is in a test name. |
| php-SEC101-idiomatic | idiomatic | no | no | 3 (base) | `$this->middleware('auth');` | Laravel controller auth middleware, removed. |
| php-SEC104-idiomatic | idiomatic | no | no | 2 | `define('DB_PASS', '<fake>');` | Constant holding the database credential. |
| php-SEC106-idiomatic | idiomatic | no | no | 2 | `curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);` | cURL option that turns peer verification off. |
| php-SEC108-idiomatic | idiomatic | no | yes | 3 | `return shell_exec("convert " . $path . " -resize 200x200 thumb.png");` | shell_exec of a command built from a parameter. |
| php-DAT101-idiomatic | idiomatic | no | no | 3 | `DB::table('orders')->delete();` | Query builder delete with no where clause. |
| php-DAT102-idiomatic | idiomatic | no | yes | 3 | `return response()->json(['name' => $customer->name, 'cpf' => $customer->cpf]);` | Response carries the full CPF, no mask. |
| php-DAT104-idiomatic | idiomatic | no | no | 3 | `error_log("login $user password=$password");` | error_log writes the password. |
| php-DAT101-decoy-comment | decoy (comment) | no | yes | 3 | `// archived orders are kept; purge runs only from the console` | purge is in a comment. |
| php-SEC104-decoy-string | decoy (string) | no | yes | 10 | `return ['min' => 'The password needs at least 12 characters'];` | password is in a validation message. |
| php-SEC106-decoy-name | decoy (name) | no | no | 16 | `public function test_verify_false_is_rejected(): void` | verify is in a test name. |
| rust-SEC101-idiomatic | idiomatic | no | no | 3 (base) | `.route_layer(middleware::from_fn(require_auth))` | axum auth layer on the admin routes, removed. |
| rust-SEC104-idiomatic | idiomatic | no | yes | 2 | `const AUTH_TOKEN: &str = "<fake>";` | Constant holding the auth token. |
| rust-SEC106-idiomatic | idiomatic | no | no | 2 | `.danger_accept_invalid_certs(true)` | reqwest client that accepts invalid certificates. |
| rust-SEC108-idiomatic | idiomatic | no | no | 2 | `Command::new("sh").arg("-c").arg(format!("tar -czf {name}.tgz reports/")).spawn()` | std::process runs sh -c with a formatted command. |
| rust-DAT101-idiomatic | idiomatic | no | no | 2 | `diesel::delete(orders::table).execute(conn)` | Diesel delete on the whole table. |
| rust-DAT102-idiomatic | idiomatic | no | yes | 3 | `Json(json!({ "name": t.name, "passport_number": t.passport_number }))` | Response carries the full passport number, no mask. |
| rust-DAT104-idiomatic | idiomatic | no | no | 2 | `info!("login user={} token={}", user, token);` | tracing info! writes the token. |
| rust-DAT102-decoy-comment | decoy (comment) | no | yes | 2 | `// keep only the last four digits of the card_number` | card_number is in a comment about masking. |
| rust-SEC101-decoy-string | decoy (string) | no | yes | 8 | `(StatusCode::UNAUTHORIZED, "Please authenticate first").into_response()` | authenticate is in an error message. |
| rust-SEC108-decoy-name | decoy (name) | no | yes | 13 | `fn eval_is_not_exposed() {` | eval is in a test name. |
| shell-SEC104-idiomatic | idiomatic | no | yes | 2 | `export API_TOKEN="<fake>"` | Exported variable holding the API token. |
| shell-SEC106-idiomatic | idiomatic | no | no | 2 | `curl --insecure -fsSL "$RATES_URL"` | curl with certificate verification off. |
| shell-SEC108-idiomatic | idiomatic | no | yes | 2 | `eval "$HOOK_COMMAND"` | eval of a command held in a variable. |
| shell-DAT101-idiomatic | idiomatic | no | no | 2 | `rm -rf "${UPLOAD_DIR:?}"/*` | Recursive delete of every upload. |
| shell-DAT102-idiomatic | idiomatic | no | yes | 2 | `echo "customer=$NAME cpf=$CPF"` | Prints the full CPF to the output, no mask. |
| shell-DAT104-idiomatic | idiomatic | no | no | 2 | `echo "login user=$USER token=$TOKEN" >> "$LOG_FILE"` | Appends the token to a log file. |
| shell-SEC108-decoy-comment | decoy (comment) | no | yes | 2 | `# no eval here: the job name picks a script from jobs/` | eval is in a comment. |
| shell-DAT101-decoy-string | decoy (string) | no | yes | 8 | `read -r -p "This will purge every upload. Continue? " answer` | purge is in a prompt shown to the user. |
| shell-SEC104-decoy-name | decoy (name) | no | yes | 14 | `test_token_is_read_from_env() {` | token is in a test function name. |

| Language | Rule | Not applicable because |
|---|---|---|
| TSX | SEC106 | Code that runs in the browser cannot turn certificate verification off: the browser owns TLS. |
| Shell | SEC101 | A shell script has no request routing and no auth middleware or guard to take out. |
<!-- cases:end -->
