// The matrix of the gate-languages fixture: the same seven dangerous behaviours of the audit's
// Critical Gate (step 4) written in 13 languages, plus three decoys per language. make.mjs turns
// it into a scratch git repository with two commits; measure.mjs reads audit reports against the
// manifest it writes.
//
// CATALOG_1_20 is a frozen copy of what the 1.20.0 catalog writes in its Security and Data
// domains: the file list and the terms in parentheses of each rule. It labels the cases and
// nothing else; no test ties it to the live SKILL.md, which part 2 of the work changes.
//
// Each planted case is a segment: `before` and `after` are context lines in both commits, `lines`
// are the planted lines (1 to 4), added by the change, or, for a rule whose scope is removed
// lines (SEC101), present in the base and taken out by the change. `key` is the index of the line
// that carries the behaviour (0 when absent). Variants: `catalog` uses a term the 1.20.0 catalog
// names for that ecosystem, `other` is another form of the same behaviour without any catalog
// term, `idiomatic` is the single case of a pair that has no ecosystem term or whose extension is
// not on the 1.20.0 list.
//
// The fake secret of SEC104 is assembled from parts and written into the source lines only by
// interpolation, so no versioned file of the fixture holds a line that looks like a secret; the
// generated files in the scratch repository hold the whole line.

export const FAKE_VALUE = ['fixture', 'not', 'a', 'real', 'value'].join('-');
const FAKE = FAKE_VALUE;

const SOURCE_1_20 = Object.freeze(['.py', '.js', '.ts', '.rb', '.go', '.java']);

export const CATALOG_1_20 = Object.freeze({
  version: '1.20.0',
  domains: Object.freeze({
    Security: Object.freeze({ files: 'source (*.py,*.js,*.ts,*.rb,*.go,*.java); SEC104 also config/env', extensions: SOURCE_1_20 }),
    // The Data domain says "files: source; DAT102 also config": source is read as the list the
    // Security domain spells out.
    Data: Object.freeze({ files: 'source; DAT102 also config', extensions: SOURCE_1_20 }),
  }),
  rules: Object.freeze({
    SEC101: Object.freeze({ domain: 'Security', severity: 'CRITICAL', scope: 'r', trigger: 'auth middleware/guard removed', terms: ['authenticate', '@login_required', 'isAuthenticated', 'requireAuth'] }),
    SEC104: Object.freeze({ domain: 'Security', severity: 'CRITICAL', scope: 'a', trigger: 'hardcoded secret (= literal of 8 or more characters)', terms: ['password', 'secret', 'api_key', 'token'] }),
    SEC106: Object.freeze({ domain: 'Security', severity: 'HIGH', scope: 'a', trigger: 'cert verification off', terms: ['verify=false', 'InsecureSkipVerify=true', 'NODE_TLS_REJECT_UNAUTHORIZED=0'] }),
    SEC108: Object.freeze({ domain: 'Security', severity: 'WARNING', scope: 'a', trigger: 'dynamic exec', terms: ['eval', 'exec', 'system', 'popen', 'subprocess.call', 'child_process.exec'] }),
    DAT101: Object.freeze({ domain: 'Data', severity: 'CRITICAL', scope: 'a', trigger: 'mass delete', terms: ['delete_all', 'destroy_all', 'removeAll', 'bulk_delete', 'purge'] }),
    DAT102: Object.freeze({ domain: 'Data', severity: 'HIGH', scope: 'a', trigger: 'PII exposure', terms: ['ssn', 'cpf', 'cnpj', 'passport_number', 'credit_card', 'card_number'] }),
    // "logging sensitive data (console.log/logger.* of password/token/secret/key)": the calls are
    // the terms, and the words after "of" are what the call has to carry.
    DAT104: Object.freeze({ domain: 'Data', severity: 'WARNING', scope: 'a', trigger: 'logging sensitive data', terms: ['console.log', 'logger.*'], objects: ['password', 'token', 'secret', 'key'] }),
  }),
});

export const RULES = Object.freeze(Object.keys(CATALOG_1_20.rules));
export const DECOY_KINDS = Object.freeze(['comment', 'string', 'name']);

export const LANGUAGES = Object.freeze([
  { id: 'python', name: 'Python', extension: '.py', naming: 'snake' },
  { id: 'javascript', name: 'JavaScript', extension: '.js', naming: 'camel' },
  { id: 'typescript', name: 'TypeScript', extension: '.ts', naming: 'camel' },
  { id: 'ruby', name: 'Ruby', extension: '.rb', naming: 'snake' },
  { id: 'go', name: 'Go', extension: '.go', naming: 'snake' },
  { id: 'java', name: 'Java', extension: '.java', naming: 'pascal' },
  { id: 'tsx', name: 'TSX', extension: '.tsx', naming: 'pascal' },
  { id: 'csharp', name: 'C#', extension: '.cs', naming: 'pascal' },
  { id: 'kotlin', name: 'Kotlin', extension: '.kt', naming: 'pascal' },
  { id: 'swift', name: 'Swift', extension: '.swift', naming: 'pascal' },
  { id: 'php', name: 'PHP', extension: '.php', naming: 'pascal' },
  { id: 'rust', name: 'Rust', extension: '.rs', naming: 'snake' },
  { id: 'shell', name: 'Shell', extension: '.sh', naming: 'snake' },
].map((language) => Object.freeze(language)));

const ALL_LISTED = ['python', 'javascript', 'typescript', 'ruby', 'go', 'java'];

// Which of the six listed ecosystems each catalog term belongs to: the languages whose own
// libraries or idioms use the term. A term that names a field or a variable (SEC104, DAT102) is
// in every one of them; [] means the term names no API of the six. This table is an annotation of
// the 1.20.0 catalog, not part of it: it decides only which pairs carry two variants.
export const TERM_ECOSYSTEMS = Object.freeze({
  SEC101: { authenticate: ['python', 'ruby'], '@login_required': ['python'], isAuthenticated: ['javascript', 'typescript', 'java'], requireAuth: ['javascript', 'typescript'] },
  SEC104: { password: ALL_LISTED, secret: ALL_LISTED, api_key: ALL_LISTED, token: ALL_LISTED },
  SEC106: { 'verify=false': ['python'], 'InsecureSkipVerify=true': ['go'], 'NODE_TLS_REJECT_UNAUTHORIZED=0': ['javascript', 'typescript'] },
  SEC108: { eval: ['python', 'javascript', 'typescript', 'ruby'], exec: ['python', 'ruby', 'go', 'java'], system: ['python', 'ruby'], popen: ['python', 'ruby'], 'subprocess.call': ['python'], 'child_process.exec': ['javascript', 'typescript'] },
  DAT101: { delete_all: ['ruby'], destroy_all: ['ruby'], removeAll: [], bulk_delete: [], purge: [] },
  DAT102: { ssn: ALL_LISTED, cpf: ALL_LISTED, cnpj: ALL_LISTED, passport_number: ALL_LISTED, credit_card: ALL_LISTED, card_number: ALL_LISTED },
  DAT104: { 'console.log': ['javascript', 'typescript'], 'logger.*': ALL_LISTED },
});

export const NOT_APPLICABLE = Object.freeze({
  shell: { SEC101: 'A shell script has no request routing and no auth middleware or guard to take out.' },
  tsx: { SEC106: 'Code that runs in the browser cannot turn certificate verification off: the browser owns TLS.' },
});

// --- labels --------------------------------------------------------------------------------------

export function extensionListed(extension) {
  return SOURCE_1_20.includes(extension);
}

const isLetter = (ch) => ch !== undefined && /[A-Za-z]/.test(ch);
const isLower = (ch) => ch !== undefined && /[a-z]/.test(ch);
const isUpper = (ch) => ch !== undefined && /[A-Z]/.test(ch);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A term as a regular expression, matched in any case. `logger.*` is `logger.` and an
// identifier; `name=value` is the name, `=` or `:` with optional spaces, and the value, with or
// without quotes (Go writes `InsecureSkipVerify: true`, Node `= "0"`).
function termSource(term) {
  if (term.endsWith('.*')) return `${escape(term.slice(0, -2))}\\.[A-Za-z_]\\w*`;
  const eq = term.indexOf('=');
  if (eq > 0) return `${escape(term.slice(0, eq))}\\s*[=:]\\s*["']?${escape(term.slice(eq + 1))}["']?`;
  return escape(term);
}

// A term counts when it stands as a word: the character before it is not a letter, or the term
// starts a camel-case hump (a lower-case letter, then the term's first letter in upper case); the
// same on the right. `eval` is in `eval(x)` and not in `evaluate`; `password` is in `DB_PASSWORD`
// and in `dbPassword`; `exec` is in `execSync` and not in `executable`.
export function containsTerm(text, term) {
  const re = new RegExp(termSource(term), 'gi');
  for (const match of text.matchAll(re)) {
    const start = match.index;
    const end = start + match[0].length;
    const first = text[start];
    const prev = text[start - 1];
    const last = text[end - 1];
    const next = text[end];
    const startOk = !isLetter(first) || !isLetter(prev) || (isLower(prev) && isUpper(first));
    const endOk = !isLetter(last) || !isLetter(next) || (isLower(last) && isUpper(next));
    if (startOk && endOk) return true;
  }
  return false;
}

export function tokenListed(rule, text) {
  const entry = CATALOG_1_20.rules[rule];
  if (!entry) throw new Error(`unknown rule ${rule}`);
  const hasTerm = entry.terms.some((term) => containsTerm(text, term));
  if (!entry.objects) return hasTerm;
  return hasTerm && entry.objects.some((word) => containsTerm(text, word));
}

export function ecosystemTerms(rule, language) {
  return Object.entries(TERM_ECOSYSTEMS[rule] ?? {})
    .filter(([, languages]) => languages.includes(language))
    .map(([term]) => term);
}

// --- the cases -----------------------------------------------------------------------------------

const seg = (variant, before, lines, after, why, key = 0) => ({ variant, before, lines, after, why, key });
const one = (before, lines, after, why, key = 0) => [seg('idiomatic', before, lines, after, why, key)];
const decoy = (rule, before, line, after, why) => ({ rule, before, line, after, why });

const CASES = {
  python: {
    SEC101: [
      seg('catalog', ['@app.route("/admin/users")'], ['@login_required'], ['def list_users():', '    return render_template("admin/users.html", users=User.query.all())'], 'Flask-Login decorator that keeps anonymous users out of the admin view, removed.'),
      seg('other', ['@app.route("/api/admin/export")'], ['@jwt_required()'], ['def export_users():', '    return jsonify([u.to_dict() for u in User.query.all()])'], 'flask-jwt-extended decorator that demands a valid token, removed.'),
    ],
    SEC104: [
      seg('catalog', ['DATABASE_HOST = "db.internal"'], [`DATABASE_PASSWORD = "${FAKE}"`], ['DATABASE_PORT = 5432'], 'Module-level settings constant holding the database password as a literal.'),
      seg('other', ['SMTP_HOST = "smtp.internal"'], [`SMTP_PASS = "${FAKE}"`], ['SMTP_PORT = 587'], 'Same literal credential under a name the catalog does not list.'),
    ],
    SEC106: [
      seg('catalog', ['def fetch_rates(url):'], ['    response = requests.get(url, verify=False)'], ['    return response.json()'], 'requests call with certificate verification turned off.'),
      seg('other', ['def open_feed(url):'], ['    context = ssl._create_unverified_context()'], ['    return urllib.request.urlopen(url, context=context).read()'], 'Standard-library SSL context that skips certificate verification.'),
    ],
    SEC108: [
      seg('catalog', ['def archive(name):'], ['    subprocess.call(f"tar -czf {name}.tgz reports/", shell=True)'], ['    return f"{name}.tgz"'], 'Shell command built from a parameter and run through subprocess.call.'),
      seg('other', ['def thumbnail(path):'], ['    subprocess.run(f"convert {path} -resize 200x200 thumb.png", shell=True)'], ['    return "thumb.png"'], 'The same through subprocess.run, the call current code uses.'),
    ],
    DAT101: one(['def reset_orders():'], ['    Order.objects.all().delete()'], ['    return "orders reset"'], 'Django queryset delete of every row of the table.'),
    DAT102: [
      seg('catalog', ['def customer_detail(request, pk):', '    customer = Customer.objects.get(pk=pk)'], ['    return JsonResponse({"name": customer.name, "card_number": customer.card_number})'], [],'JSON response with the full card number, no mask.'),
      seg('other', ['def customer_export(request, pk):', '    customer = Customer.objects.get(pk=pk)'], ['    return JsonResponse({"name": customer.name, "tax_id": customer.tax_id})'], [],'JSON response with the personal tax document number, no mask.'),
    ],
    DAT104: [
      seg('catalog', ['def login(user, password):'], ['    logger.info("login attempt user=%s password=%s", user, password)'], ['    return auth.check(user, password)'], 'Module logger writes the password in clear text.'),
      seg('other', ['def refresh(user, token):'], ['    logging.debug("refresh user=%s token=%s", user, token)'], ['    return auth.refresh(token)'], 'Root logging call writes the session token.'),
    ],
  },
  javascript: {
    SEC101: [
      seg('catalog', ['const router = express.Router();'], ['router.use(requireAuth);'], ['router.get("/admin/users", listUsers);'], 'Express router-level auth middleware, removed.'),
      seg('other', ['const app = express();'], ['app.use("/admin", checkJwt);'], ['app.use("/admin", adminRouter);'], 'JWT check mounted on the admin path, removed.'),
    ],
    SEC104: [
      seg('catalog', ['const apiBase = "https://api.internal";'], [`const apiToken = "${FAKE}";`], ['module.exports = { apiBase };'], 'API token as a string literal in a config module.'),
      seg('other', ['const issuer = "billing";'], [`const signingKey = "${FAKE}";`], ['module.exports = { issuer };'], 'Signing key as a string literal, under a name the catalog does not list.'),
    ],
    SEC106: [
      seg('catalog', ['function insecureFetch(url) {'], ['  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";'], ['  return fetch(url);', '}'], 'Node-wide switch that accepts any certificate.'),
      seg('other', ['function makeAgent() {'], ['  return new https.Agent({ rejectUnauthorized: false });'], ['}'], 'HTTPS agent that accepts any certificate.'),
    ],
    SEC108: [
      seg('catalog', ['function archive(name) {'], ['  child_process.exec(`tar -czf ${name}.tgz reports/`);'], ['  return `${name}.tgz`;', '}'], 'Shell command built from a parameter, run by child_process.exec.'),
      seg('other', ['function thumbnail(path) {'], ['  child_process.spawn(`convert ${path} -resize 200x200 thumb.png`, { shell: true });'], ['  return "thumb.png";', '}'], 'The same through spawn with a shell.'),
    ],
    DAT101: one(['async function resetOrders() {'], ['  await Order.deleteMany({});'], ['  return "orders reset";', '}'], 'Mongoose deleteMany with an empty filter removes every document.'),
    DAT102: [
      seg('catalog', ['router.get("/customers/:id", async (req, res) => {', '  const customer = await Customer.findById(req.params.id);'], ['  res.json({ name: customer.name, cpf: customer.cpf });'], ['});'], 'Response carries the full CPF, no mask.'),
      seg('other', ['router.get("/customers/:id/export", async (req, res) => {', '  const customer = await Customer.findById(req.params.id);'], ['  res.json({ name: customer.name, taxId: customer.taxId });'], ['});'], 'Response carries the full tax document number, no mask.'),
    ],
    DAT104: [
      seg('catalog', ['async function login(user, token) {'], ['  console.log("login", user, "token", token);'], ['  return session.open(user, token);', '}'], 'console.log of the session token.'),
      seg('other', ['async function refresh(user, password) {'], ['  log.info({ user, password }, "refresh");'], ['  return session.refresh(user, password);', '}'], 'Structured log (pino style) of the password.'),
    ],
  },
  typescript: {
    SEC101: [
      seg('catalog', ['export const adminRouter = Router();'], ['adminRouter.use((req, res, next) => (req.isAuthenticated() ? next() : res.sendStatus(401)));'], ['adminRouter.get("/users", listUsers);'], 'Passport isAuthenticated guard on the admin router, removed.'),
      seg('other', ['@Controller("admin")'], ['@UseGuards(AuthGuard("jwt"))'], ['export class AdminController {}'], 'NestJS guard on the admin controller, removed.'),
    ],
    SEC104: [
      seg('catalog', ['export const webhookUrl = "https://hooks.internal/billing";'], [`export const WEBHOOK_SECRET = "${FAKE}";`], ['export const retries = 3;'], 'Webhook secret as an exported string literal.'),
      seg('other', ['export const issuer = "billing";'], [`export const signingKey: string = "${FAKE}";`], ['export const ttlSeconds = 3600;'], 'Typed signing key literal, under a name the catalog does not list.'),
    ],
    SEC106: [
      seg('catalog', ['export function allowSelfSigned(): void {'], ['  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";'], ['}'], 'Node-wide switch that accepts any certificate.'),
      seg('other', ['export const client = axios.create({'], ['  httpsAgent: new https.Agent({ rejectUnauthorized: false }),'], ['});'], 'axios client whose agent accepts any certificate.'),
    ],
    SEC108: [
      seg('catalog', ['export function calculate(formula: string): number {'], ['  return eval(formula);'], ['}'], 'eval of a string the caller passes.'),
      seg('other', ['export function compile(formula: string): () => number {'], ['  return new Function(`return ${formula}`) as () => number;'], ['}'], 'The Function constructor runs the same string as code.'),
    ],
    DAT101: one(['export async function resetOrders(): Promise<void> {'], ['  await prisma.order.deleteMany();'], ['}'], 'Prisma deleteMany with no filter removes every row.'),
    DAT102: [
      seg('catalog', ['app.get("/patients/:id", async (req, res) => {', '  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: req.params.id } });'], ['  res.json({ name: patient.name, ssn: patient.ssn });'], ['});'], 'Response carries the full SSN, no mask.'),
      seg('other', ['app.get("/cards/:id", async (req, res) => {', '  const card = await prisma.card.findUniqueOrThrow({ where: { id: req.params.id } });'], ['  res.json({ holder: card.holder, pan: card.pan, expiry: card.expiry });'], ['});'], 'Response carries the full card number (PAN), no mask.'),
    ],
    DAT104: [
      seg('catalog', ['export async function login(user: string, password: string) {'], ['  console.log(`login ${user} password=${password}`);'], ['  return auth.verify(user, password);', '}'], 'console.log of the password.'),
      seg('other', ['export async function rotate(user: string, apiKey: string) {'], ['  console.info("rotate", { user, apiKey });'], ['  return keys.rotate(user, apiKey);', '}'], 'console.info of the API key.'),
    ],
  },
  ruby: {
    SEC101: [
      seg('catalog', ['class Admin::UsersController < ApplicationController'], ['  before_action :authenticate_user!'], ['  def index', '    @users = User.all', '  end', 'end'], 'Devise before_action that requires a signed-in user, removed.'),
      seg('other', ['class Admin::ReportsController < ApplicationController'], ['  before_action :require_login'], ['  def index', '    @reports = Report.all', '  end', 'end'], 'Sorcery-style login filter, removed.'),
    ],
    SEC104: [
      seg('catalog', ['Billing.configure do |config|', '  config.host = "billing.internal"'], [`  config.api_key = "${FAKE}"`], ['end'], 'Initializer sets the API key to a literal.'),
      seg('other', ['Mailer.configure do |config|', '  config.host = "smtp.internal"'], [`  config.auth_pass = "${FAKE}"`], ['end'], 'Initializer sets the mail credential to a literal, under a name the catalog does not list.'),
    ],
    SEC106: one(['http = Net::HTTP.new(uri.host, uri.port)', 'http.use_ssl = true'], ['http.verify_mode = OpenSSL::SSL::VERIFY_NONE'], ['response = http.get(uri.request_uri)'], 'Net::HTTP with certificate verification off.'),
    SEC108: [
      seg('catalog', ['def archive(name)'], ['  system("tar -czf #{name}.tgz reports/")'], ['end'], 'Kernel#system with an interpolated command string.'),
      seg('other', ['def thumbnail(path)'], ['  `convert #{path} -resize 200x200 thumb.png`'], ['end'], 'Backtick shell-out with an interpolated command string.'),
    ],
    DAT101: [
      seg('catalog', ['def reset_orders'], ['  Order.delete_all'], ['end'], 'Active Record delete_all on the whole model.'),
      seg('other', ['def reset_invoices'], ['  ActiveRecord::Base.connection.execute("DELETE FROM invoices")'], ['end'], 'Raw SQL delete of every invoice.'),
    ],
    DAT102: [
      seg('catalog', ['def show', '  patient = Patient.find(params[:id])'], ['  render json: { name: patient.name, ssn: patient.ssn }'], ['end'], 'JSON response with the full SSN, no mask.'),
      seg('other', ['def export', '  patient = Patient.find(params[:id])'], ['  render json: { name: patient.name, document_number: patient.document_number }'], ['end'], 'JSON response with the full identity document number, no mask.'),
    ],
    DAT104: [
      seg('catalog', ['def login(user, password)'], ['  Rails.logger.info("login #{user} password=#{password}")'], ['  Session.open(user, password)', 'end'], 'Rails logger writes the password.'),
      seg('other', ['def refresh(user, token)'], ['  puts "refresh #{user} token=#{token}"'], ['  Session.refresh(user, token)', 'end'], 'puts sends the token to the process log.'),
    ],
  },
  go: {
    SEC101: one(['admin := r.Group("/admin")'], ['admin.Use(AuthRequired())'], ['admin.GET("/users", listUsers)'], 'Gin group middleware that requires a user, removed.'),
    SEC104: [
      seg('catalog', ['const dbHost = "db.internal"'], [`const dbPassword = "${FAKE}"`], ['const dbPort = 5432'], 'Package constant holding the database password.'),
      seg('other', ['var issuer = "billing"'], [`var hmacKey = []byte("${FAKE}")`], ['var ttl = time.Hour'], 'HMAC key as a byte-slice literal, under a name the catalog does not list.'),
    ],
    SEC106: [
      seg('catalog', ['func insecureClient() *http.Client {'], ['\treturn &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}'], ['}'], 'TLS config that skips certificate verification.'),
      seg('other', ['func clientFor(cfg Config) *http.Client {'], ['\tskipVerify := true', '\treturn &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: skipVerify}}}'], ['}'], 'The same switch set through a variable, so the literal true is not on the field.', 1),
    ],
    SEC108: [
      seg('catalog', ['func archive(name string) error {'], ['\treturn exec.Command("sh", "-c", "tar -czf "+name+".tgz reports/").Run()'], ['}'], 'os/exec runs a shell with a command built from a parameter.'),
      seg('other', ['func thumbnail(path string) (*os.Process, error) {'], ['\treturn os.StartProcess("/bin/sh", []string{"sh", "-c", "convert " + path + " thumb.png"}, &os.ProcAttr{})'], ['}'], 'os.StartProcess runs the same kind of shell command.'),
    ],
    DAT101: one(['func resetOrders(db *sql.DB) error {'], ['\t_, err := db.Exec("DELETE FROM orders")'], ['\treturn err', '}'], 'database/sql delete with no WHERE clause.'),
    DAT102: [
      seg('catalog', ['func cardHandler(w http.ResponseWriter, r *http.Request) {', '\tcard := loadCard(r)'], ['\tjson.NewEncoder(w).Encode(map[string]string{"holder": card.Holder, "card_number": card.Number})'], ['}'], 'Handler writes the full card number, no mask.'),
      seg('other', ['func customerHandler(w http.ResponseWriter, r *http.Request) {', '\tcustomer := loadCustomer(r)'], ['\tjson.NewEncoder(w).Encode(map[string]string{"name": customer.Name, "tax_id": customer.TaxID})'], ['}'], 'Handler writes the full tax document number, no mask.'),
    ],
    DAT104: [
      seg('catalog', ['func login(user, token string) error {'], ['\tlogger.Info("login", "user", user, "token", token)'], ['\treturn sessions.Open(user, token)', '}'], 'Structured logger (slog or zap) writes the token.'),
      seg('other', ['func refresh(user, password string) error {'], ['\tlog.Printf("refresh user=%s password=%s", user, password)'], ['\treturn sessions.Refresh(user, password)', '}'], 'Standard log package writes the password.'),
    ],
  },
  java: {
    SEC101: [
      seg('catalog', ['@GetMapping("/admin/users")'], ['@PreAuthorize("isAuthenticated()")'], ['public List<User> listUsers() {', '    return userRepository.findAll();', '}'], 'Spring Security method guard, removed.'),
      seg('other', ['public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {'], ['    http.authorizeHttpRequests(auth -> auth.requestMatchers("/admin/**").authenticated());'], ['    return http.build();', '}'], 'Filter-chain rule that requires a login on /admin, removed.'),
    ],
    SEC104: [
      seg('catalog', ['public final class Settings {', '    static final String DB_HOST = "db.internal";'], [`    static final String DB_SECRET = "${FAKE}";`], ['    static final int DB_PORT = 5432;'], 'Constant holding the database secret.'),
      seg('other', ['    static final String SMTP_HOST = "smtp.internal";'], [`    static final String SMTP_PASS = "${FAKE}";`], ['    static final int SMTP_PORT = 587;', '}'], 'Constant holding the mail credential, under a name the catalog does not list.'),
    ],
    SEC106: one(['SSLContext sslContext = SSLContextBuilder.create()'], ['        .loadTrustMaterial(null, TrustAllStrategy.INSTANCE)'], ['        .build();', 'HttpClient client = HttpClients.custom().setSSLContext(sslContext).build();'], 'Apache HttpClient context that trusts every certificate.'),
    SEC108: [
      seg('catalog', ['public void archive(String name) throws IOException {'], ['    Runtime.getRuntime().exec(new String[] {"sh", "-c", "tar -czf " + name + ".tgz reports/"});'], ['}'], 'Runtime.exec runs a shell with a command built from a parameter.'),
      seg('other', ['public Process thumbnail(String path) throws IOException {'], ['    return new ProcessBuilder("sh", "-c", "convert " + path + " thumb.png").start();'], ['}'], 'ProcessBuilder runs the same kind of shell command.'),
    ],
    DAT101: one(['@Transactional', 'public void resetOrders() {'], ['    orderRepository.deleteAll();'], ['}'], 'Spring Data deleteAll removes every row.'),
    DAT102: [
      seg('catalog', ['@GetMapping("/customers/{id}")', 'public Map<String, String> customer(@PathVariable long id) {', '    Customer customer = customers.findById(id).orElseThrow();'], ['    return Map.of("name", customer.getName(), "cpf", customer.getCpf());'], ['}'], 'Response carries the full CPF, no mask.'),
      seg('other', ['@GetMapping("/customers/{id}/export")', 'public Map<String, String> export(@PathVariable long id) {', '    Customer customer = customers.findById(id).orElseThrow();'], ['    return Map.of("name", customer.getName(), "taxId", customer.getTaxId());'], ['}'], 'Response carries the full tax document number, no mask.'),
    ],
    DAT104: [
      seg('catalog', ['public Session login(String user, String password) {'], ['    logger.info("login user={} password={}", user, password);'], ['    return sessions.open(user, password);', '}'], 'SLF4J logger writes the password.'),
      seg('other', ['public Session refresh(String user, String token) {'], ['    System.out.println("refresh user=" + user + " token=" + token);'], ['    return sessions.refresh(user, token);', '}'], 'Standard output writes the token.'),
    ],
  },
  tsx: {
    SEC101: one(['export function AdminPage() {', '  const { session } = useSession();'], ['  if (!session) return <Navigate to="/login" replace />;'], ['  return <UserTable />;', '}'], 'Component guard that sends anonymous users to the login page, removed.'),
    SEC104: one(['export const mapsUrl = "https://maps.internal/embed";'], [`export const MAPS_API_KEY = "${FAKE}";`], ['export const defaultZoom = 12;'], 'API key literal shipped in the client bundle.'),
    SEC108: one(['export function Formula({ expression }: { expression: string }) {'], ['  const value = eval(expression);'], ['  return <span>{value}</span>;', '}'], 'Component evals a prop as code.'),
    DAT101: one(['async function onResetClick() {'], ['  await supabase.from("orders").delete().neq("id", 0);'], ['  setOrders([]);', '}'], 'Supabase delete whose filter matches every row.'),
    DAT102: one(['export function CustomerRow({ customer }: { customer: Customer }) {', '  return ('], ['    <tr><td>{customer.name}</td><td>{customer.cpf}</td></tr>'], ['  );', '}'], 'Row renders the full CPF in the page, no mask.'),
    DAT104: one(['export function useLogin() {', '  return async (user: string, token: string) => {'], ['    console.log("login", user, token);'], ['    await api.login(user, token);', '  };', '}'], 'console.log of the session token in the browser.'),
  },
  csharp: {
    SEC101: one(['[ApiController]', '[Route("admin/users")]'], ['[Authorize]'], ['public class AdminUsersController : ControllerBase', '{', '}'], 'ASP.NET Core [Authorize] attribute on the admin controller, removed.'),
    SEC104: one(['public static class Settings', '{'], [`    public const string ConnectionPassword = "${FAKE}";`], ['}'], 'Constant holding the connection password.'),
    SEC106: one(['var handler = new HttpClientHandler();'], ['handler.ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;'], ['var client = new HttpClient(handler);'], 'HttpClientHandler that accepts any server certificate.'),
    SEC108: one(['public void Archive(string name)', '{'], ['    Process.Start("bash", $"-c \\"tar -czf {name}.tgz reports/\\"");'], ['}'], 'Process.Start runs bash with an interpolated command.'),
    DAT101: one(['public async Task ResetOrdersAsync()', '{'], ['    await db.Orders.ExecuteDeleteAsync();'], ['}'], 'EF Core ExecuteDeleteAsync on the whole set.'),
    DAT102: one(['[HttpGet("{id}")]', 'public IActionResult Get(int id)', '{', '    var card = db.Cards.Find(id);'], ['    return Ok(new { card.Holder, card.CardNumber });'], ['}'], 'Response carries the full card number, no mask.'),
    DAT104: one(['public async Task<Session> LoginAsync(string user, string password)', '{'], ['    _logger.LogInformation("Login {User} with password {Password}", user, password);'], ['    return await _sessions.OpenAsync(user, password);', '}'], 'ILogger writes the password.'),
  },
  kotlin: {
    SEC101: one(['@GetMapping("/admin/users")'], ['@PreAuthorize("isAuthenticated()")'], ['fun listUsers(): List<User> = userRepository.findAll()'], 'Spring Security method guard in Kotlin, removed.'),
    SEC104: one(['object SigningSettings {', '    const val ISSUER = "billing"'], [`    const val SIGNING_KEY = "${FAKE}"`], ['}'], 'Constant holding the signing key.'),
    SEC106: one(['val client = OkHttpClient.Builder()'], ['    .sslSocketFactory(trustAllContext.socketFactory, trustAllManager)', '    .hostnameVerifier { _, _ -> true }'], ['    .build()'], 'OkHttp client with a trust-all manager and no hostname check.'),
    SEC108: one(['fun archive(name: String) {'], ['    Runtime.getRuntime().exec(arrayOf("sh", "-c", "tar -czf $name.tgz reports/"))'], ['}'], 'Runtime.exec runs a shell with an interpolated command.'),
    DAT101: one(['@Transactional', 'fun resetOrders() {'], ['    orderRepository.deleteAll()'], ['}'], 'Spring Data deleteAll removes every row.'),
    DAT102: one(['@GetMapping("/patients/{id}")', 'fun patient(@PathVariable id: Long): Map<String, String> {', '    val patient = patients.findById(id).orElseThrow()'], ['    return mapOf("name" to patient.name, "ssn" to patient.ssn)'], ['}'], 'Response carries the full SSN, no mask.'),
    DAT104: one(['fun login(user: String, token: String): Session {'], ['    logger.info("login user=$user token=$token")'], ['    return sessions.open(user, token)', '}'], 'Logger writes the token.'),
  },
  swift: {
    SEC101: one(['let admin = app.grouped("admin")'], ['    .grouped(User.guardMiddleware())'], ['admin.get("users", use: listUsers)'], 'Vapor guard middleware on the admin group, removed.'),
    SEC104: one(['enum Credentials {', '    static let clientId = "ios-app"'], [`    static let clientSecret = "${FAKE}"`], ['}'], 'Client secret literal shipped in the app.'),
    SEC106: one(['func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,', '                completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {'], ['    completionHandler(.useCredential, URLCredential(trust: challenge.protectionSpace.serverTrust!))'], ['}'], 'Delegate accepts any server trust without evaluating it.'),
    SEC108: one(['func archive(name: String) throws {', '    let task = Process()', '    task.executableURL = URL(fileURLWithPath: "/bin/sh")'], ['    task.arguments = ["-c", "tar -czf \\(name).tgz reports/"]'], ['    try task.run()', '}'], 'Process runs sh -c with an interpolated command.'),
    DAT101: one(['func resetOrders(in context: NSManagedObjectContext) throws {'], ['    let request = NSBatchDeleteRequest(fetchRequest: Order.fetchRequest())', '    try context.execute(request)'], ['}'], 'Core Data batch delete with no predicate.'),
    DAT102: one(['func cardResponse(_ card: Card) -> CardDTO {'], ['    CardDTO(holder: card.holder, cardNumber: card.cardNumber)'], ['}'], 'Response object carries the full card number, no mask.'),
    DAT104: one(['func login(user: String, token: String) async throws {'], ['    logger.debug("Login \\(user) token \\(token, privacy: .public)")'], ['    try await session.open(user: user, token: token)', '}'], 'os Logger writes the token and marks it public.'),
  },
  php: {
    SEC101: one(['public function __construct()', '{'], ["    $this->middleware('auth');"], ['}'], 'Laravel controller auth middleware, removed.'),
    SEC104: one(["define('DB_HOST', 'db.internal');"], [`define('DB_PASS', '${FAKE}');`], ["define('DB_PORT', 3306);"], 'Constant holding the database credential.'),
    SEC106: one(['$ch = curl_init($url);'], ['curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);'], ['$body = curl_exec($ch);'], 'cURL option that turns peer verification off.'),
    SEC108: one(['function thumbnail(string $path): string', '{'], ['    return shell_exec("convert " . $path . " -resize 200x200 thumb.png");'], ['}'], 'shell_exec of a command built from a parameter.'),
    DAT101: one(['public function reset(): void', '{'], ["    DB::table('orders')->delete();"], ['}'], 'Query builder delete with no where clause.'),
    DAT102: one(['public function show(Customer $customer)', '{'], ["    return response()->json(['name' => $customer->name, 'cpf' => $customer->cpf]);"], ['}'], 'Response carries the full CPF, no mask.'),
    DAT104: one(['function login(string $user, string $password): bool', '{'], ['    error_log("login $user password=$password");'], ['    return Auth::attempt($user, $password);', '}'], 'error_log writes the password.'),
  },
  rust: {
    SEC101: one(['let admin = Router::new()', '    .route("/admin/users", get(list_users))'], ['    .route_layer(middleware::from_fn(require_auth))'], ['    .with_state(state);'], 'axum auth layer on the admin routes, removed.'),
    SEC104: one(['const API_URL: &str = "https://api.internal";'], [`const AUTH_TOKEN: &str = "${FAKE}";`], ['const TIMEOUT_SECS: u64 = 30;'], 'Constant holding the auth token.'),
    SEC106: one(['let client = reqwest::Client::builder()'], ['    .danger_accept_invalid_certs(true)'], ['    .build()?;'], 'reqwest client that accepts invalid certificates.'),
    SEC108: one(['fn archive(name: &str) -> std::io::Result<Child> {'], ['    Command::new("sh").arg("-c").arg(format!("tar -czf {name}.tgz reports/")).spawn()'], ['}'], 'std::process runs sh -c with a formatted command.'),
    DAT101: one(['fn reset_orders(conn: &mut PgConnection) -> QueryResult<usize> {'], ['    diesel::delete(orders::table).execute(conn)'], ['}'], 'Diesel delete on the whole table.'),
    DAT102: one(['async fn traveler(Path(id): Path<i64>, State(db): State<Db>) -> Json<Value> {', '    let t = db.traveler(id).await;'], ['    Json(json!({ "name": t.name, "passport_number": t.passport_number }))'], ['}'], 'Response carries the full passport number, no mask.'),
    DAT104: one(['fn login(user: &str, token: &str) -> Result<Session> {'], ['    info!("login user={} token={}", user, token);'], ['    sessions::open(user, token)', '}'], 'tracing info! writes the token.'),
  },
  shell: {
    SEC104: one(['export DB_HOST="db.internal"'], [`export API_TOKEN="${FAKE}"`], ['export DB_PORT=5432'], 'Exported variable holding the API token.'),
    SEC106: one(['fetch_rates() {'], ['  curl --insecure -fsSL "$RATES_URL"'], ['}'], 'curl with certificate verification off.'),
    SEC108: one(['run_hook() {'], ['  eval "$HOOK_COMMAND"'], ['}'], 'eval of a command held in a variable.'),
    DAT101: one(['reset_uploads() {'], ['  rm -rf "${UPLOAD_DIR:?}"/*'], ['}'], 'Recursive delete of every upload.'),
    DAT102: one(['report_customer() {'], ['  echo "customer=$NAME cpf=$CPF"'], ['}'], 'Prints the full CPF to the output, no mask.'),
    DAT104: one(['login() {'], ['  echo "login user=$USER token=$TOKEN" >> "$LOG_FILE"'], ['}'], 'Appends the token to a log file.'),
  },
};

const DECOYS = {
  python: {
    comment: decoy('SEC108', ['def parse_amount(text):'], '    # never pass the text to eval, parse it', ['    return Decimal(text)'], 'The word eval is in a comment.'),
    string: decoy('DAT102', ['class CompanyForm(forms.Form):'], '    tax_id = forms.CharField(label="CPF or CNPJ")', ['    name = forms.CharField(label="Company name")'], 'CPF and CNPJ are a field label.'),
    name: decoy('DAT101', ['@pytest.mark.django_db'], 'def test_purge_button_needs_confirmation(client):', ['    assert client.get("/orders/").status_code == 200'], 'purge is in a test name.'),
  },
  javascript: {
    comment: decoy('SEC108', ['function parseAmount(text) {'], '  // do not eval the text, parse it', ['  return Number.parseFloat(text);', '}'], 'The word eval is in a comment.'),
    string: decoy('SEC104', ['function hintFor(field) {'], '  return "Your password needs at least 12 characters";', ['}'], 'password is in a message shown to the user.'),
    name: decoy('SEC101', ['describe("admin routes", () => {'], '  it("requireAuth sends anonymous users to /login", async () => {', ['    await request(app).get("/admin").expect(302);', '  });', '});'], 'requireAuth is in a test name.'),
  },
  typescript: {
    comment: decoy('DAT101', ['export function archiveOrders(ids: string[]) {'], '  // archive only: purge stays a manual job', ['  return prisma.order.updateMany({ where: { id: { in: ids } }, data: { archived: true } });', '}'], 'purge is in a comment.'),
    string: decoy('SEC106', ['export const errors = {'], '  tls: "Certificate check failed: never set verify=false to get past it",', ['};'], 'verify=false is in an error message.'),
    name: decoy('SEC104', ['describe("settings", () => {'], '  it("rejects an empty api_key", () => {', ['    expect(() => loadSettings({})).toThrow();', '  });', '});'], 'api_key is in a test name.'),
  },
  ruby: {
    comment: decoy('DAT102', ['def masked_document(value)'], '  # shows only the last digits of the CPF', ['  "***#{value[-4..]}"', 'end'], 'CPF is in a comment about masking.'),
    string: decoy('SEC108', ['def help_text'], '  "Formulas are parsed, never run through eval"', ['end'], 'eval is in a help text.'),
    name: decoy('DAT104', ['RSpec.describe SessionsController do'], '  it "does not send the token to logger.info" do', ['    expect(Rails.logger).not_to receive(:info)', '  end', 'end'], 'logger.info and token are in a test name.'),
  },
  go: {
    comment: decoy('SEC104', ['func loadConfig() Config {'], '\t// the password comes from the environment, never from this file', ['\treturn Config{DSN: os.Getenv("DSN")}', '}'], 'password is in a comment.'),
    string: decoy('DAT101', ['func confirmText() string {'], '\treturn "This will purge every archived order. Type the shop name to confirm."', ['}'], 'purge is in a confirmation message.'),
    name: decoy('SEC106', ['type tlsSuite struct{}'], 'func TestInsecureSkipVerifyIsNeverSet(t *testing.T) {', ['\tif defaultTLS().InsecureSkipVerify {', '\t\tt.Fatal("verification must stay on")', '\t}', '}'], 'InsecureSkipVerify is in a test name.'),
  },
  java: {
    comment: decoy('SEC101', ['public List<Report> publicReports() {'], '    // public on purpose: no requireAuth here, the reports are open data', ['    return reports.findPublic();', '}'], 'requireAuth is in a comment.'),
    string: decoy('DAT102', ['public String documentLabel() {'], '    return "Credit card or SSN (only the last four digits are kept)";', ['}'], 'SSN is in a field label.'),
    name: decoy('SEC108', ['@Test'], 'void execIsNeverCalledWithUserInput() {', ['    assertThat(runner.commands()).isEmpty();', '}'], 'exec is in a test name.'),
  },
  tsx: {
    comment: decoy('SEC104', ['export function LoginForm() {'], '  // the token lives in an httpOnly cookie, never in this component', ['  return <form action="/login" method="post" />;', '}'], 'token is in a comment.'),
    string: decoy('DAT102', ['export function DocumentField() {'], '  return <label htmlFor="document">CPF / CNPJ</label>;', ['}'], 'CPF and CNPJ are a field label.'),
    name: decoy('SEC108', ['describe("Formula", () => {'], '  it("does not eval the expression", () => {', ['    render(<Formula expression="1+1" />);', '  });', '});'], 'eval is in a test name.'),
  },
  csharp: {
    comment: decoy('SEC101', ['public class HealthController : ControllerBase', '{'], '    // no [Authorize] here: authenticate happens at the gateway', ['    public IActionResult Get() => Ok();', '}'], 'authenticate is in a comment.'),
    string: decoy('DAT104', ['public void Guard(string value)', '{'], '    throw new InvalidOperationException("Do not pass the token to logger.LogDebug");', ['}'], 'logger.LogDebug and token are in an error message.'),
    name: decoy('DAT101', ['[Fact]'], 'public async Task Purge_RequiresAdmin()', ['{', '    await Assert.ThrowsAsync<UnauthorizedAccessException>(() => _orders.ArchiveAsync(guest));', '}'], 'Purge is in a test name.'),
  },
  kotlin: {
    comment: decoy('DAT104', ['fun audit(user: User) {'], '    // never log the password, only the user id', ['    auditLog.record(user.id)', '}'], 'password is in a comment about logging.'),
    string: decoy('SEC101', ['object Messages {'], '    const val LOGIN = "Please authenticate to see this page"', ['}'], 'authenticate is in a message shown to the user.'),
    name: decoy('SEC104', ['@Test'], 'fun `secret is read from the vault`() {', ['    assertNotNull(settings.vaultRef)', '}'], 'secret is in a test name.'),
  },
  swift: {
    comment: decoy('SEC108', ['func parse(_ text: String) -> Decimal? {'], '    // no NSExpression or eval here: the text is parsed as a number', ['    Decimal(string: text)', '}'], 'eval is in a comment.'),
    string: decoy('DAT102', ['struct DocumentField: View {', '    var body: some View {'], '        TextField("CPF", text: $document)', ['    }', '}'], 'CPF is a field label.'),
    name: decoy('SEC106', ['final class TLSTests: XCTestCase {'], '    func testVerifyFalseIsNeverAccepted() {', ['        XCTAssertTrue(client.validatesCertificates)', '    }', '}'], 'verify is in a test name.'),
  },
  php: {
    comment: decoy('DAT101', ['public function archive(Order $order): void', '{'], '    // archived orders are kept; purge runs only from the console', ["    $order->update(['archived' => true]);", '}'], 'purge is in a comment.'),
    string: decoy('SEC104', ['public function messages(): array', '{'], "    return ['min' => 'The password needs at least 12 characters'];", ['}'], 'password is in a validation message.'),
    name: decoy('SEC106', ['class HttpClientTest extends TestCase', '{'], '    public function test_verify_false_is_rejected(): void', ['    {', "        $this->assertTrue(Http::options()['verify']);", '    }', '}'], 'verify is in a test name.'),
  },
  rust: {
    comment: decoy('DAT102', ['fn masked(doc: &str) -> String {'], '    // keep only the last four digits of the card_number', ['    format!("****{}", &doc[doc.len() - 4..])', '}'], 'card_number is in a comment about masking.'),
    string: decoy('SEC101', ['fn unauthorized() -> Response {'], '    (StatusCode::UNAUTHORIZED, "Please authenticate first").into_response()', ['}'], 'authenticate is in an error message.'),
    name: decoy('SEC108', ['#[test]'], 'fn eval_is_not_exposed() {', ['    assert!(!routes().contains("/calc"));', '}'], 'eval is in a test name.'),
  },
  shell: {
    comment: decoy('SEC108', ['run_job() {'], '  # no eval here: the job name picks a script from jobs/', ['  "./jobs/$1.sh"', '}'], 'eval is in a comment.'),
    string: decoy('DAT101', ['confirm_reset() {'], '  read -r -p "This will purge every upload. Continue? " answer', ['  [ "$answer" = "yes" ]', '}'], 'purge is in a prompt shown to the user.'),
    name: decoy('SEC104', ['set -eu'], 'test_token_is_read_from_env() {', ['  [ -n "${HOME:-}" ]', '}'], 'token is in a test function name.'),
  },
};

// --- layout --------------------------------------------------------------------------------------

const STEMS = {
  SEC101: ['admin', 'routes'],
  SEC104: ['settings'],
  SEC106: ['http', 'client'],
  SEC108: ['jobs'],
  DAT101: ['maintenance'],
  DAT102: ['customers'],
  DAT104: ['sessions'],
  decoys: ['helpers'],
};

const cap = (word) => word[0].toUpperCase() + word.slice(1);

export function fileName(language, stem) {
  const words = STEMS[stem];
  let base;
  if (language.naming === 'snake') base = words.join('_');
  else if (language.naming === 'camel') base = words[0] + words.slice(1).map(cap).join('');
  else base = words.map(cap).join('');
  return `${language.id}/${base}${language.extension}`;
}

// Two blank lines between segments: with one line of context on each side, two planted lines
// of one file sit at least 5 lines apart.
const GAP = ['', ''];

function layout(segments, side) {
  const base = [];
  const change = [];
  const placed = [];
  segments.forEach((segment, i) => {
    if (i > 0) {
      base.push(...GAP);
      change.push(...GAP);
    }
    base.push(...segment.before);
    change.push(...segment.before);
    const target = side === 'removed' ? base : change;
    placed.push({ segment, line: target.length + 1 + segment.key });
    target.push(...segment.lines);
    base.push(...segment.after);
    change.push(...segment.after);
  });
  return { base: `${base.join('\n')}\n`, change: `${change.join('\n')}\n`, placed };
}

function entry({ id, kind, rule, language, variant, decoyKind, path, line, side, snippet, text, why }) {
  return {
    id,
    kind,
    rule,
    language: language.id,
    extension: language.extension,
    variant,
    decoyKind,
    path,
    line,
    side,
    extensionListed: extensionListed(language.extension),
    tokenListed: tokenListed(rule, snippet.join('\n')),
    text,
    snippet,
    why,
  };
}

// The whole fixture: the files of the base commit, the files of the change commit, and the cases
// in a fixed order (language, then rule, then variant, then the three decoys).
export function buildFixture() {
  const base = {};
  const change = {};
  const cases = [];
  for (const language of LANGUAGES) {
    for (const rule of RULES) {
      const segments = CASES[language.id]?.[rule];
      if (!segments) continue;
      const side = CATALOG_1_20.rules[rule].scope === 'r' ? 'removed' : 'added';
      const path = fileName(language, rule);
      const files = layout(segments, side);
      base[path] = files.base;
      change[path] = files.change;
      for (const { segment, line } of files.placed) {
        cases.push(entry({
          id: `${language.id}-${rule}-${segment.variant}`,
          kind: 'planted',
          rule,
          language,
          variant: segment.variant,
          decoyKind: null,
          path,
          line,
          side,
          snippet: [...segment.lines],
          text: segment.lines[segment.key],
          why: segment.why,
        }));
      }
    }
    const path = fileName(language, 'decoys');
    const segments = DECOY_KINDS.map((kind) => {
      const d = DECOYS[language.id][kind];
      return { variant: kind, before: d.before, lines: [d.line], after: d.after, why: d.why, key: 0, rule: d.rule };
    });
    const files = layout(segments, 'added');
    base[path] = files.base;
    change[path] = files.change;
    for (const { segment, line } of files.placed) {
      cases.push(entry({
        id: `${language.id}-${segment.rule}-decoy-${segment.variant}`,
        kind: 'decoy',
        rule: segment.rule,
        language,
        variant: null,
        decoyKind: segment.variant,
        path,
        line,
        side: 'added',
        snippet: [...segment.lines],
        text: segment.lines[0],
        why: segment.why,
      }));
    }
  }
  return { base, change, cases };
}

export function expandCases() {
  return buildFixture().cases;
}

// --- the README table ----------------------------------------------------------------------------

function cell(text) {
  return text.replace(/\|/g, '\\|');
}

function code(lines) {
  const text = lines.map((l) => l.replace(/\t/g, '  ').trim()).join(' ⏎ ').split(FAKE_VALUE).join('<fake>');
  return text.includes('`') ? `\`\` ${cell(text)} \`\`` : `\`${cell(text)}\``;
}

const yesNo = (value) => (value ? 'yes' : 'no');

// The table of cases the README carries, generated from the matrix. The fake secret shows as
// <fake>.
export function casesTable() {
  const rows = [
    '| Id | Kind | Ext. listed | Term listed | Line | Planted | Why |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const c of expandCases()) {
    const kind = c.kind === 'decoy' ? `decoy (${c.decoyKind})` : c.variant;
    rows.push(`| ${c.id} | ${kind} | ${yesNo(c.extensionListed)} | ${yesNo(c.tokenListed)} | ${c.side === 'removed' ? `${c.line} (base)` : c.line} | ${code(c.snippet)} | ${cell(c.why)} |`);
  }
  rows.push('');
  rows.push('| Language | Rule | Not applicable because |');
  rows.push('|---|---|---|');
  for (const language of LANGUAGES) {
    for (const rule of RULES) {
      const reason = NOT_APPLICABLE[language.id]?.[rule];
      if (reason) rows.push(`| ${language.name} | ${rule} | ${cell(reason)} |`);
    }
  }
  return `${rows.join('\n')}\n`;
}
