// The matrix of the gate-tech fixture: the 25 rules of the Database, Infrastructure (IaC),
// Kubernetes and Config domains of the audit's Critical Gate (step 4), each planted in several
// formats, with decoys, controls and the regression cases measured by hand in part 2a. make.mjs
// turns it into a scratch git repository with two commits; gate-languages/measure.mjs reads audit
// reports against the manifest it writes.
//
// CATALOG_TECH_1_20 is a frozen copy of what the 1.20.0 catalog writes in those four domains: the
// `files:` line of each domain and the id, severity, scope and trigger of each rule. It labels the
// cases and nothing else; no test ties it to the live SKILL.md, which part 2b-2 changes.
//
// Every file of the repository sits under a top folder named after its format (`sql/`,
// `terraform/`, `regression/`...), with a realistic path inside it, so the diff of one format is
// `git diff HEAD~1 HEAD -- <format>/`. The labels read the whole path.
//
// A case is a segment of a file: `before` and `after` are context lines in both commits, `lines`
// are the case lines (1 to 4), added by the change or, on a removed side, present in the base and
// taken out by the change; `was`, when given, are the lines the base holds where the change puts
// the added ones (a value flipped in place). `key` is the index of the line that carries the
// behaviour. Kinds: `planted` (the behaviour of the rule), `control` (legitimate configuration or
// code next to the behaviour that is not it: a finding there is a false positive) and `decoy` (the
// rule's trigger word in a comment, a string shown to a person or a name, without the behaviour).
// The regression cases are planted or control by what part 2a expects of them.
//
// No line here holds a credential, real or fake.

import { extname } from 'node:path';

import * as languages from '../gate-languages/matrix.mjs';

export const REGRESSION = 'regression';
export const DECOY_KINDS = Object.freeze(['comment', 'string', 'name']);

// --- the 1.20.0 catalog of the four domains -------------------------------------------------------

const DOCKERFILES = ['Dockerfile', 'Dockerfile.*', '*.Dockerfile'];

// "code" in the Config file line read as any source-code file.
export const SOURCE_CODE = Object.freeze(['.py', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.rb', '.go', '.java', '.kt', '.cs', '.swift', '.php', '.rs', '.scala', '.sh']);

const rule = (domain, severity, scope, trigger, terms) => Object.freeze({ domain, severity, scope, trigger, terms: Object.freeze(terms) });

export const CATALOG_TECH_1_20 = Object.freeze({
  version: '1.20.0',
  domains: Object.freeze({
    Database: Object.freeze({ heading: 'Database', files: '`*.sql`, `**/migrations/*`', globs: Object.freeze(['*.sql', '**/migrations/*']), code: false }),
    Infrastructure: Object.freeze({ heading: 'Infrastructure (IaC)', files: '`*.tf`, `*.hcl`', globs: Object.freeze(['*.tf', '*.hcl']), code: false }),
    Kubernetes: Object.freeze({ heading: 'Kubernetes', files: '`*.yml`, `*.yaml`', globs: Object.freeze(['*.yml', '*.yaml']), code: false }),
    Config: Object.freeze({ heading: 'Config', files: '`*.yml,*.yaml,*.json,*.toml`, Dockerfiles, code', globs: Object.freeze(['*.yml', '*.yaml', '*.json', '*.toml', ...DOCKERFILES]), code: true }),
  }),
  // `trigger` is the cell of the 1.20.0 table as written. `terms` are the words of the trigger the
  // labels look for: the backticked terms, and, where the trigger has none (IAC104, CFG104, CFG105),
  // the words it names. `…` stands for anything on the same line and `<table>` for a table name.
  rules: Object.freeze({
    DS101: rule('Database', 'CRITICAL', 'a', '`DROP DATABASE`', ['DROP DATABASE']),
    DS102: rule('Database', 'CRITICAL', 'a', '`DROP TABLE`', ['DROP TABLE']),
    DS103: rule('Database', 'CRITICAL', 'a', '`TRUNCATE [TABLE]`', ['TRUNCATE']),
    DS104: rule('Database', 'HIGH', 'a', '`DROP COLUMN`', ['DROP COLUMN']),
    DS105: rule('Database', 'HIGH', 'a', '`ALTER TABLE … DROP`', ['ALTER TABLE … DROP']),
    DS106: rule('Database', 'HIGH', 'a', '`DELETE FROM <table>` with no `WHERE`', ['DELETE FROM <table>']),
    DS108: rule('Database', 'WARNING', 'a', '`RENAME TABLE` / `ALTER TABLE … RENAME`', ['RENAME TABLE', 'ALTER TABLE … RENAME']),
    DS110: rule('Database', 'INFO', 'a', '`ALTER TABLE … MODIFY` (column type change → data loss)', ['ALTER TABLE … MODIFY']),
    IAC101: rule('Infrastructure', 'CRITICAL', 'a', '`force_destroy = true` / `destroy = true`', ['force_destroy = true', 'destroy = true']),
    IAC102: rule('Infrastructure', 'CRITICAL', 'a', '`prevent_destroy = false`', ['prevent_destroy = false']),
    IAC103: rule('Infrastructure', 'HIGH', 'b', 'IAM change (`iam_policy`/`iam_role`/`iam_user`/`aws_iam`)', ['iam_policy', 'iam_role', 'iam_user', 'aws_iam']),
    IAC104: rule('Infrastructure', 'HIGH', 'r', 'security group / firewall rule / network ACL removed', ['security group', 'firewall', 'network ACL']),
    IAC105: rule('Infrastructure', 'WARNING', 'a', '`cidr_blocks = ["0.0.0.0/0"]` (public access)', ['cidr_blocks = ["0.0.0.0/0"]']),
    IAC106: rule('Infrastructure', 'WARNING', 'a', '`publicly_accessible`/`public_access = true`', ['publicly_accessible', 'public_access = true']),
    K8S101: rule('Kubernetes', 'HIGH', 'a', '`privileged: true`', ['privileged: true']),
    K8S102: rule('Kubernetes', 'HIGH', 'a', '`hostPath:`', ['hostPath']),
    K8S103: rule('Kubernetes', 'HIGH', 'a', '`runAsUser: 0`', ['runAsUser: 0']),
    K8S104: rule('Kubernetes', 'HIGH', 'a', '`runAsNonRoot: false`', ['runAsNonRoot: false']),
    K8S105: rule('Kubernetes', 'WARNING', 'a', 'dangerous capability (`SYS_ADMIN`/`NET_ADMIN`/`ALL`)', ['SYS_ADMIN', 'NET_ADMIN', 'ALL']),
    K8S106: rule('Kubernetes', 'WARNING', 'a', '`hostNetwork: true`', ['hostNetwork: true']),
    CFG101: rule('Config', 'HIGH', 'a', 'CORS wildcard `*` (`access-control-allow-origin: *`)', ['access-control-allow-origin: *']),
    CFG102: rule('Config', 'WARNING', 'a', 'debug mode on (`debug = true`)', ['debug = true']),
    CFG103: rule('Config', 'WARNING', 'a', 'log level `debug`/`trace` (prod data exposure)', ['debug', 'trace']),
    CFG104: rule('Config', 'WARNING', 'a', 'sensitive port exposed (22/3389/5432/3306/6379/27017/9200/11211)', ['22', '3389', '5432', '3306', '6379', '27017', '9200', '11211']),
    CFG105: rule('Config', 'INFO', 'r', 'timeout config removed (hung connections)', ['timeout']),
  }),
});

export const TECH_RULES = Object.freeze(Object.keys(CATALOG_TECH_1_20.rules));

// A rule with no case possible in one of the three quadrants the spec asks for (`both`: the format
// is on the rule's file line and the line holds the trigger word; `formatOff`; `wordOff`) says why
// here. Every rule of this matrix covers the three.
export const QUADRANT_GAPS = Object.freeze({});

// --- labels --------------------------------------------------------------------------------------

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function globSource(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob.startsWith('**/', i)) {
      out += '(?:[^/]+/)*';
      i += 2;
    } else if (glob[i] === '*') out += '[^/]*';
    else out += escape(glob[i]);
  }
  return `^${out}$`;
}

// A glob of a `files:` line: one without a slash names a file anywhere in the tree; one with a
// slash is read against the whole path, `**/` standing for any number of folders.
export function globMatches(glob, path) {
  const target = glob.includes('/') ? path : path.split('/').pop();
  return new RegExp(globSource(glob)).test(target);
}

const domainOf = (id) => {
  const entry = CATALOG_TECH_1_20.rules[id];
  if (!entry) throw new Error(`unknown rule ${id}`);
  return CATALOG_TECH_1_20.domains[entry.domain];
};

// The path is on the `files:` line of the rule's domain in 1.20.0.
export function extensionListed(id, path) {
  const domain = domainOf(id);
  return domain.globs.some((glob) => globMatches(glob, path)) || (domain.code && SOURCE_CODE.includes(extname(path)));
}

const isAlnum = (ch) => ch !== undefined && /[A-Za-z0-9]/.test(ch);
const isLower = (ch) => ch !== undefined && /[a-z]/.test(ch);
const isUpper = (ch) => ch !== undefined && /[A-Z]/.test(ch);

// A term as a regular expression, matched in any case. `name = value` and `name: value` take `=`
// or `:` with any spaces and an optional quote around the value, but no quote between the name
// and the separator: `"privileged": true` in JSON is another spelling, not the word. Words are
// separated by white space only (`DROP TABLE`, not `drop_table`), `…` is anything on the same line
// and `<table>` a table name.
export function techTermSource(term) {
  const pair = term.match(/^([^\s=:]+)\s*[=:]\s*(\S.*)$/);
  if (pair) return `${escape(pair[1])}[ \\t]*[=:][ \\t]*["']?${escape(pair[2]).replace(/ /g, '\\s*')}["']?`;
  return term
    .split('…')
    .map((piece) => piece.trim().split(/\s+/).map((word) => (word === '<table>' ? '[\\w.`"]+' : escape(word))).join('\\s+'))
    .join('[^\\n]*?');
}

// A term counts when it stands as a word: the character before it is not a letter or a digit, or
// the term starts a camel-case hump; the same on the right. `TRUNCATE` is in `truncate(`, `5432` is
// not in `15432`, `destroy = true` is in `forceDestroy: true`.
export function containsTechTerm(text, term) {
  const re = new RegExp(techTermSource(term), 'gi');
  for (const match of text.matchAll(re)) {
    const start = match.index;
    const end = start + match[0].length;
    const first = text[start];
    const prev = text[start - 1];
    const last = text[end - 1];
    const next = text[end];
    const startOk = !isAlnum(first) || !isAlnum(prev) || (isLower(prev) && isUpper(first));
    const endOk = !isAlnum(last) || !isAlnum(next) || (isLower(last) && isUpper(next));
    if (startOk && endOk) return true;
  }
  return false;
}

// The case lines hold the trigger word of the rule in 1.20.0.
export function tokenListed(id, text) {
  const entry = CATALOG_TECH_1_20.rules[id];
  if (!entry) throw new Error(`unknown rule ${id}`);
  return entry.terms.some((term) => containsTechTerm(text, term));
}

// The two labels of a case: by CATALOG_TECH_1_20 for a rule of the four domains, and by the
// gate-languages CATALOG_1_20 for a Security or Data rule of a regression case.
export function labels(id, path, text) {
  if (CATALOG_TECH_1_20.rules[id]) return { extensionListed: extensionListed(id, path), tokenListed: tokenListed(id, text) };
  if (languages.CATALOG_1_20.rules[id]) return { extensionListed: languages.extensionListed(extname(path)), tokenListed: languages.tokenListed(id, text) };
  throw new Error(`unknown rule ${id}`);
}

// --- the formats ---------------------------------------------------------------------------------

export const FORMATS = Object.freeze([
  { id: 'sql', name: 'SQL file', extension: '.sql' },
  { id: 'app-sql', name: 'SQL in Python application code, outside a migrations folder', extension: '.py' },
  { id: 'django-migration', name: 'Django migration', extension: '.py' },
  { id: 'rails-migration', name: 'Rails migration (db/migrate)', extension: '.rb' },
  { id: 'liquibase', name: 'Liquibase XML changelog', extension: '.xml' },
  { id: 'terraform', name: 'Terraform', extension: '.tf' },
  { id: 'cloudformation', name: 'CloudFormation template in YAML', extension: '.yaml' },
  { id: 'pulumi', name: 'Pulumi in TypeScript', extension: '.ts' },
  { id: 'k8s-manifest', name: 'Kubernetes manifest', extension: '.yaml' },
  { id: 'helm', name: 'Helm chart (templates and values)', extension: '.yaml' },
  { id: 'compose', name: 'Docker Compose file', extension: '.yml' },
  { id: 'ecs-task', name: 'ECS task definition in JSON', extension: '.json' },
  { id: 'docker-run', name: 'docker run in a shell script', extension: '.sh' },
  { id: 'config-yaml', name: 'Configuration in YAML', extension: '.yml' },
  { id: 'config-json', name: 'Configuration in JSON', extension: '.json' },
  { id: 'config-code', name: 'Configuration written in code (Express)', extension: '.js' },
  { id: 'dotenv', name: '.env file', extension: '.env' },
  { id: 'ini', name: 'INI file (php.ini)', extension: '.ini' },
  { id: 'nginx', name: 'nginx configuration', extension: '.conf' },
  { id: 'dockerfile', name: 'Dockerfile', extension: '' },
  { id: REGRESSION, name: 'Regression cases measured by hand in part 2a, each under its origin', extension: null },
].map((format) => Object.freeze(format)));

// --- the cases -----------------------------------------------------------------------------------

const segment = (kind, id, variant, before, lines, after, why, opts = {}) => ({
  kind, rule: id, variant, decoyKind: null, before, lines, after, why, key: opts.key ?? 0, was: opts.was ?? null, side: opts.side ?? null, origin: null,
});
const P = (id, variant, before, lines, after, why, opts) => segment('planted', id, variant, before, lines, after, why, opts);
const C = (id, variant, before, lines, after, why, opts) => segment('control', id, variant, before, lines, after, why, opts);
const D = (id, decoyKind, before, line, after, why) => ({ ...segment('decoy', id, null, before, [line], after, why), decoyKind });
const R = (origin, expected, id, variant, before, lines, after, why, opts) => ({ ...segment(expected, id, variant, before, lines, after, why, opts), origin });
const file = (format, path, segments, extra = {}) => ({ format, path: `${format}/${path}`, segments, head: [], tail: [], newFile: false, ...extra });
const raw = (format, path, base, change) => ({ format, path: `${format}/${path}`, raw: { base, change } });

// One operation of a Django migration, inside its `operations` list.
const OPS = (id, variant, line, why) => P(id, variant, ['    operations = ['], [line], ['    ]'], why);
const XML = { head: ['<?xml version="1.0" encoding="UTF-8"?>', '<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog">'], tail: ['</databaseChangeLog>'] };

const DATABASE = [
  // sql
  file('sql', 'db/scripts/2026_11_02_retire_analytics.sql', [
    P('DS101', 'drop-database', ['-- Analytics moved to the warehouse cluster.'], ['DROP DATABASE IF EXISTS analytics;'], ['-- Dashboards now read the warehouse.'], 'Drops the whole analytics database.'),
    C('DS101', 'create-database', ['-- A copy for the auditors.'], ['CREATE DATABASE analytics_archive;'], ['GRANT CONNECT ON DATABASE analytics_archive TO auditors;'], 'Creates a database; nothing is lost.'),
  ]),
  file('sql', 'db/scripts/2026_11_03_orders.sql', [
    P('DS102', 'drop-table', ['BEGIN;'], ['DROP TABLE orders_archive;'], ['COMMIT;'], 'Drops a table with its rows.'),
    C('DS102', 'drop-view', ['BEGIN;'], ['DROP VIEW IF EXISTS monthly_totals;'], ['COMMIT;'], 'Drops a view: no row is stored in it.'),
  ]),
  file('sql', 'db/scripts/2026_11_04_sessions.sql', [
    P('DS103', 'truncate', ['-- Log everyone out after the key rotation.'], ['TRUNCATE TABLE sessions;'], ['ANALYZE sessions;'], 'Empties the sessions table.'),
    C('DS103', 'expired-rows', ['-- Nightly clean-up.'], ['DELETE FROM sessions WHERE expires_at < now();'], ['ANALYZE sessions;'], 'Deletes only the expired rows; the table keeps the live ones.'),
  ]),
  file('sql', 'db/scripts/2026_11_05_users.sql', [
    P('DS104', 'drop-column', ['-- legacy_email was replaced by email in 2025.'], ['ALTER TABLE users DROP COLUMN legacy_email;'], ['ANALYZE users;'], 'Drops a column with its values.'),
    C('DS104', 'add-column', ['-- Phone for the two-step login.'], ['ALTER TABLE users ADD COLUMN phone text;'], ['ANALYZE users;'], 'Adds a column; nothing is lost.'),
  ]),
  file('sql', 'db/scripts/2026_11_06_events.sql', [
    P('DS105', 'drop-partition', ['-- MySQL: events is partitioned by quarter.'], ['ALTER TABLE events DROP PARTITION p2025_q1;'], ['ANALYZE TABLE events;'], 'Drops a partition of the table with every row in it.'),
    C('DS105', 'add-partition', ['-- Next quarter.'], ["ALTER TABLE events ADD PARTITION (PARTITION p2026_q2 VALUES LESS THAN ('2026-07-01'));"], ['ANALYZE TABLE events;'], 'Adds a partition; nothing is lost.'),
  ]),
  file('sql', 'db/scripts/2026_11_07_carts.sql', [
    P('DS106', 'delete-all-rows', ['BEGIN;'], ['DELETE FROM carts;'], ['COMMIT;'], 'Deletes every row of the table: no WHERE.'),
  ]),
  file('sql', 'db/scripts/2026_11_08_purchases.sql', [
    P('DS108', 'rename-table', ['BEGIN;'], ['ALTER TABLE orders RENAME TO purchases;'], ['COMMIT;'], 'Renames a table that running code still reads by its old name.'),
    C('DS108', 'rename-index', ['BEGIN;'], ['ALTER INDEX idx_orders_created RENAME TO idx_orders_created_at;'], ['COMMIT;'], 'Renames an index: no query names it.'),
  ]),
  file('sql', 'db/scripts/2026_11_09_invoices.sql', [
    P('DS110', 'modify', ['-- MySQL: amounts are whole units from now on.'], ['ALTER TABLE invoices MODIFY amount INT;'], ['ANALYZE TABLE invoices;'], 'Changes the column type from decimal to integer: the cents are cut.'),
    P('DS110', 'alter-type', ['-- PostgreSQL: the same change.'], ['ALTER TABLE invoices ALTER COLUMN amount TYPE integer;'], ['ANALYZE invoices;'], 'The same type change in PostgreSQL, without the word MODIFY.'),
    C('DS110', 'set-default', ['-- An empty note by default.'], ["ALTER TABLE invoices ALTER COLUMN note SET DEFAULT '';"], ['ANALYZE invoices;'], 'Sets a default; the type stays.'),
  ]),
  file('sql', 'db/scripts/2026_11_10_archive_policy.sql', [
    D('DS102', 'comment', ['-- Retention of the archive tables.'], '-- never DROP TABLE on an archive: the auditors read them for seven years', ['CREATE INDEX IF NOT EXISTS idx_orders_archive_year ON orders_archive (year);'], 'DROP TABLE is in a comment.'),
    D('DS103', 'string', ['CREATE TABLE IF NOT EXISTS ledger (id bigint PRIMARY KEY, amount numeric);'], "COMMENT ON TABLE ledger IS 'Append only: do not TRUNCATE, every row is audited';", ['ALTER TABLE ledger OWNER TO finance;'], 'TRUNCATE is in the table comment people read in the catalog.'),
    D('DS103', 'name', ['-- pgTAP test.'], 'CREATE FUNCTION test_truncate_is_refused() RETURNS SETOF text AS $$', ["  SELECT pass('ledger is append only');", '$$ LANGUAGE sql;'], 'truncate is in a test name.'),
  ]),
  // app-sql
  file('app-sql', 'app/admin/reset.py', [
    P('DS101', 'drop-database', ['def reset_staging(cursor):'], ['    cursor.execute("DROP DATABASE IF EXISTS analytics_staging")'], ['    return "staging reset"'], 'Application code drops a database.'),
  ]),
  file('app-sql', 'app/imports/cleanup.py', [
    P('DS102', 'drop-table', ['def finish_import(cursor):'], ['    cursor.execute("DROP TABLE IF EXISTS import_batches")'], ['    log.info("import finished")'], 'Application code drops a table.'),
  ]),
  file('app-sql', 'app/audit/rotate.py', [
    P('DS103', 'truncate', ['def rotate_audit_log(cursor):'], ['    cursor.execute("TRUNCATE audit_events")'], ['    return True'], 'Application code empties the audit table.'),
  ]),
  file('app-sql', 'app/events/partitions.py', [
    P('DS105', 'drop-partition', ['def close_year(cursor):'], ['    cursor.execute("ALTER TABLE events DROP PARTITION p2024")'], ['    return "p2024 closed"'], 'Application code drops a partition with its rows.'),
  ]),
  file('app-sql', 'app/carts/repository.py', [
    P('DS106', 'delete-all-rows', ['def clear_carts(cursor):'], ['    cursor.execute("DELETE FROM carts")'], ['    return cursor.rowcount'], 'Application code deletes every row: no WHERE.'),
    C('DS106', 'delete-by-id', ['def remove_cart(cursor, cart_id):'], ['    cursor.execute("DELETE FROM carts WHERE id = %s", (cart_id,))'], ['    return cursor.rowcount'], 'Deletes one row by its key.'),
  ]),
  file('app-sql', 'app/orders/rename.py', [
    P('DS108', 'rename-table', ['def adopt_new_names(cursor):'], ['    cursor.execute("RENAME TABLE orders TO purchases")'], ['    return "renamed"'], 'Application code renames a table.'),
  ]),
  file('app-sql', 'app/maintenance/guards.py', [
    D('DS103', 'comment', ['def rotate_in_batches(cursor):'], '    # TRUNCATE would lock the table; old rows go in batches instead', ['    return delete_old_rows(cursor, batch=1000)'], 'TRUNCATE is in a comment.'),
    D('DS102', 'string', ['def refuse_schema_change(statement):', '    if statement.lstrip().upper().startswith("DROP"):'], '        raise PermissionError("DROP TABLE is not allowed from the application")', ['    return statement'], 'DROP TABLE is in an error message.'),
    D('DS103', 'name', ['@pytest.mark.django_db'], 'def test_truncate_needs_the_admin_role(cursor):', ['    assert can_run(cursor, "audit_events") is False'], 'truncate is in a test name.'),
  ]),
  // django-migration
  file('django-migration', 'billing/migrations/0008_delete_invoice.py', [
    OPS('DS102', 'delete-model', '        migrations.DeleteModel(name="Invoice"),', 'Django deletes the model and drops its table, with no SQL word.'),
  ]),
  file('django-migration', 'shop/migrations/0012_empty_carts.py', [
    OPS('DS103', 'run-python-delete-all', '        migrations.RunPython(lambda apps, schema_editor: apps.get_model("shop", "Cart").objects.all().delete()),', 'A data migration that empties the table.'),
  ]),
  file('django-migration', 'accounts/migrations/0015_remove_user_legacy_email.py', [
    OPS('DS104', 'remove-field', '        migrations.RemoveField(model_name="user", name="legacy_email"),', 'Django drops the column, with no SQL word.'),
  ]),
  file('django-migration', 'shop/migrations/0013_order_table.py', [
    OPS('DS108', 'alter-model-table', '        migrations.AlterModelTable(name="order", table="purchases"),', 'Django renames the table of the model.'),
  ]),
  file('django-migration', 'billing/migrations/0009_invoice_amount.py', [
    OPS('DS110', 'alter-field', '        migrations.AlterField(model_name="invoice", name="amount", field=models.IntegerField()),', 'Django changes the column type from decimal to integer.'),
  ]),
  file('django-migration', 'billing/migrations/0010_ledger_note.py', [
    D('DS103', 'name', ['from django.db import migrations, models'], 'def forwards_truncate_check(apps, schema_editor):', ['    assert apps.get_model("billing", "Ledger").objects.exists()'], 'truncate is in a function name.'),
    D('DS102', 'comment', ['class Migration(migrations.Migration):'], '    # DROP TABLE of the old ledger is left to the DBA runbook', ['    dependencies = [("billing", "0009_invoice_amount")]'], 'DROP TABLE is in a comment.'),
    D('DS103', 'string', ['    operations = [', '        migrations.AddField('], '            model_name="ledger", name="note", field=models.TextField(help_text="Append only: never TRUNCATE this table"),', ['        ),', '    ]'], 'TRUNCATE is in a help text.'),
  ]),
  // rails-migration
  file('rails-migration', 'db/migrate/20261102000001_drop_legacy_orders.rb', [
    P('DS102', 'drop-table', ['class DropLegacyOrders < ActiveRecord::Migration[7.1]', '  def up'], ['    drop_table :legacy_orders'], ['  end', 'end'], 'Rails drops the table, with no SQL word.'),
  ]),
  file('rails-migration', 'db/migrate/20261102000002_remove_legacy_email_from_users.rb', [
    P('DS104', 'remove-column', ['class RemoveLegacyEmailFromUsers < ActiveRecord::Migration[7.1]', '  def up'], ['    remove_column :users, :legacy_email'], ['  end', 'end'], 'Rails drops the column, with no SQL word.'),
  ]),
  file('rails-migration', 'db/migrate/20261102000003_remove_customer_from_orders.rb', [
    P('DS105', 'remove-reference', ['class RemoveCustomerFromOrders < ActiveRecord::Migration[7.1]', '  def up'], ['    remove_reference :orders, :customer, foreign_key: true, index: true'], ['  end', 'end'], 'Rails drops the foreign key, its index and the customer_id column: a part of the table.'),
  ]),
  file('rails-migration', 'db/migrate/20261102000004_rename_orders_to_purchases.rb', [
    P('DS108', 'rename-table', ['class RenameOrdersToPurchases < ActiveRecord::Migration[7.1]', '  def change'], ['    rename_table :orders, :purchases'], ['  end', 'end'], 'Rails renames the table.'),
  ]),
  file('rails-migration', 'db/migrate/20261102000005_change_invoice_amount_to_integer.rb', [
    P('DS110', 'change-column', ['class ChangeInvoiceAmountToInteger < ActiveRecord::Migration[7.1]', '  def up'], ['    change_column :invoices, :amount, :integer'], ['  end', 'end'], 'Rails changes the column type from decimal to integer.'),
  ]),
  file('rails-migration', 'db/migrate/20261102000006_add_note_to_ledger.rb', [
    D('DS102', 'comment', ['class AddNoteToLedger < ActiveRecord::Migration[7.1]'], '  # DROP TABLE of the ledger never happens here: it is append only', ['  def up'], 'DROP TABLE is in a comment.'),
    D('DS103', 'string', ['    add_column :ledgers, :note, :text', '  end', '  def down'], '    raise ActiveRecord::IrreversibleMigration, "Cannot TRUNCATE the ledger to roll back"', ['  end'], 'TRUNCATE is in an error message.'),
    D('DS103', 'name', ['  private'], '  def truncate_guard!', ['    raise "ledger is append only" if Ledger.any?', '  end', 'end'], 'truncate is in a method name.'),
  ]),
  // liquibase
  file('liquibase', 'db/changelog/changes/041-retire-analytics.xml', [
    P('DS101', 'drop-schema', ['    <changeSet id="41" author="data-team">'], ['        <sql>DROP SCHEMA analytics CASCADE</sql>'], ['    </changeSet>'], 'Drops the analytics schema with every table in it.'),
  ], XML),
  file('liquibase', 'db/changelog/changes/042-legacy-orders.xml', [
    P('DS102', 'drop-table', ['    <changeSet id="42" author="data-team">'], ['        <dropTable tableName="legacy_orders" cascadeConstraints="true"/>'], ['    </changeSet>'], 'Liquibase drops the table, with no SQL word.'),
  ], XML),
  file('liquibase', 'db/changelog/changes/043-users.xml', [
    P('DS104', 'drop-column', ['    <changeSet id="43" author="data-team">'], ['        <dropColumn tableName="users" columnName="legacy_email"/>'], ['    </changeSet>'], 'Liquibase drops the column, with no SQL word.'),
  ], XML),
  file('liquibase', 'db/changelog/changes/044-carts.xml', [
    P('DS106', 'delete-all-rows', ['    <changeSet id="44" author="data-team">'], ['        <delete tableName="carts"/>'], ['    </changeSet>'], 'Liquibase deletes every row of the table: the change has no where.'),
  ], XML),
  file('liquibase', 'db/changelog/changes/045-ledger.xml', [
    D('DS102', 'comment', ['    <!-- The ledger is append only. -->'], '    <!-- DROP TABLE of the ledger needs a ticket from finance -->', ['    <changeSet id="45" author="data-team">', '        <tagDatabase tag="ledger-v2"/>', '    </changeSet>'], 'DROP TABLE is in a comment.'),
    D('DS103', 'string', ['    <changeSet id="46" author="data-team">'], '        <comment>Replaces the nightly TRUNCATE job with a batched delete</comment>', ['        <tagDatabase tag="batched-delete"/>', '    </changeSet>'], 'TRUNCATE is in the change description people read.'),
    D('DS103', 'name', ['    <!-- Guard. -->'], '    <changeSet id="truncate-guard-001" author="data-team">', ['        <tagDatabase tag="before-guard"/>', '    </changeSet>'], 'truncate is in the change id.'),
  ], XML),
];

const INFRASTRUCTURE = [
  // terraform
  file('terraform', 'modules/storage/main.tf', [
    P('IAC101', 'force-destroy', ['resource "aws_s3_bucket" "invoices" {', '  bucket        = "acme-invoices"'], ['  force_destroy = true'], ['}'], 'Lets terraform destroy the bucket with every invoice in it.'),
    C('IAC101', 'force-destroy-off', ['resource "aws_s3_bucket" "reports" {', '  bucket        = "acme-reports"'], ['  force_destroy = false'], ['}'], 'Keeps the bucket from being destroyed while it holds objects.'),
  ]),
  file('terraform', 'modules/database/main.tf', [
    P('IAC101', 'skip-final-snapshot', ['resource "aws_db_instance" "orders" {', '  identifier          = "orders"'], ['  skip_final_snapshot = true'], ['}'], 'Destroying the database takes no final snapshot, so its data goes with it.'),
  ]),
  file('terraform', 'modules/database/lifecycle.tf', [
    P('IAC102', 'prevent-destroy-off', ['resource "aws_db_instance" "ledger" {', '  lifecycle {'], ['    prevent_destroy = false'], ['  }', '}'], 'Takes the lock against destruction off the ledger database.', { was: ['    prevent_destroy = true'] }),
    P('IAC102', 'deletion-protection-off', ['resource "aws_rds_cluster" "ledger" {', '  cluster_identifier  = "ledger"'], ['  deletion_protection = false'], ['}'], 'Takes the deletion protection off the cluster.', { was: ['  deletion_protection = true'] }),
    C('IAC102', 'prevent-destroy-on', ['resource "aws_s3_bucket" "audit" {', '  lifecycle {'], ['    prevent_destroy = true'], ['  }', '}'], 'Puts the lock against destruction on.'),
  ]),
  file('terraform', 'modules/ci/iam.tf', [
    P('IAC103', 'admin-attachment', ['resource "aws_iam_role" "ci" {', '  name               = "ci"', '  assume_role_policy = data.aws_iam_policy_document.ci_assume.json', '}'], ['resource "aws_iam_role_policy_attachment" "ci_admin" {', '  role       = aws_iam_role.ci.name', '  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"', '}'], ['output "ci_role_name" {', '  value = aws_iam_role.ci.name', '}'], 'Grants the CI role full administrator access.', { key: 2 }),
  ]),
  file('terraform', 'modules/ci/outputs.tf', [
    C('IAC103', 'role-output', ['output "ci_role_arn" {'], ['  value = aws_iam_role.ci.arn'], ['}'], 'Reads the ARN of a role to print it; no permission changes.'),
  ]),
  file('terraform', 'modules/ci/legacy_iam.tf', [
    P('IAC103', 'user-attachment-removed', ['resource "aws_iam_user" "auditor" {', '  name = "auditor"', '}'], ['resource "aws_iam_user_policy_attachment" "auditor_read_only" {', '  user       = aws_iam_user.auditor.name', '  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"', '}'], ['output "auditor_name" {', '  value = aws_iam_user.auditor.name', '}'], 'An IAM policy attachment taken out: an IAM change on a removed line.', { side: 'removed' }),
  ]),
  file('terraform', 'modules/gcp/iam.tf', [
    P('IAC103', 'project-owner', ['data "google_project" "current" {}'], ['resource "google_project_iam_member" "ci_owner" {', '  role   = "roles/owner"', '  member = "serviceAccount:ci@acme-prod.iam.gserviceaccount.com"', '}'], ['output "project_number" {', '  value = data.google_project.current.number', '}'], 'Makes the CI service account owner of the whole project.', { key: 1 }),
  ]),
  file('terraform', 'modules/network/firewall.tf', [
    P('IAC104', 'firewall-rule-removed', ['resource "google_compute_network" "main" {', '  name = "main"', '}'], ['resource "google_compute_firewall" "deny_ssh_from_internet" {', '  network = google_compute_network.main.name', '  deny { protocol = "tcp" }', '}'], ['output "network_name" {', '  value = google_compute_network.main.name', '}'], 'A deny rule of the firewall taken out.'),
  ]),
  file('terraform', 'modules/database/network.tf', [
    P('IAC104', 'security-group-detached', ['resource "aws_db_instance" "billing" {', '  identifier             = "billing"'], ['  vpc_security_group_ids = [aws_security_group.db_private.id]'], ['  db_subnet_group_name   = aws_db_subnet_group.private.name', '}'], 'The database loses its private security group and falls back to the default one of the VPC.'),
  ]),
  file('terraform', 'modules/database/network_reports.tf', [
    C('IAC104', 'security-group-attached', ['resource "aws_db_instance" "reports" {', '  identifier             = "reports"'], ['  vpc_security_group_ids = [aws_security_group.reports_private.id]'], ['  db_subnet_group_name   = aws_db_subnet_group.private.name', '}'], 'Attaches a private security group: added, and it narrows access.'),
  ]),
  file('terraform', 'modules/network/ingress.tf', [
    P('IAC105', 'world-ipv4', ['resource "aws_security_group" "admin" {', '  ingress {', '    from_port   = 8443', '    to_port     = 8443'], ['    cidr_blocks = ["0.0.0.0/0"]'], ['  }', '}'], 'Opens the admin port to every IPv4 address.', { was: ['    cidr_blocks = ["10.0.0.0/16"]'] }),
    P('IAC105', 'world-ipv6', ['resource "aws_security_group" "metrics" {', '  ingress {', '    from_port   = 9100', '    to_port     = 9100'], ['    ipv6_cidr_blocks = ["::/0"]'], ['  }', '}'], 'Opens the metrics port to every IPv6 address.'),
    C('IAC105', 'vpc-only', ['resource "aws_security_group" "internal" {', '  ingress {', '    from_port   = 8080', '    to_port     = 8080'], ['    cidr_blocks = ["10.0.0.0/16"]'], ['  }', '}'], 'Opens a port to the private network only.'),
  ]),
  file('terraform', 'modules/database/exposure.tf', [
    P('IAC106', 'publicly-accessible', ['resource "aws_db_instance" "analytics" {', '  identifier          = "analytics"'], ['  publicly_accessible = true'], ['}'], 'Gives the database a public address.'),
    C('IAC106', 'not-public', ['resource "aws_db_instance" "billing_replica" {', '  identifier          = "billing-replica"'], ['  publicly_accessible = false'], ['}'], 'Keeps the database private.'),
  ]),
  file('terraform', 'modules/storage/public_access.tf', [
    P('IAC106', 'public-acls', ['resource "aws_s3_bucket_public_access_block" "exports" {', '  bucket              = aws_s3_bucket.exports.id'], ['  block_public_acls   = false', '  block_public_policy = false'], ['}'], 'Lets the exports bucket take public ACLs and a public policy.', { was: ['  block_public_acls   = true', '  block_public_policy = true'] }),
  ]),
  file('terraform', 'modules/network/variables.tf', [
    D('IAC103', 'comment', ['# Inputs of the network module.'], '# IAM roles live in the iam module: no aws_iam resource is created here', ['variable "vpc_cidr" {', '  type = string', '}'], 'aws_iam is in a comment.'),
    D('IAC104', 'string', ['variable "allowed_office_cidrs" {', '  type        = list(string)'], '  description = "Office ranges; firewall rules are managed by the network team"', ['}'], 'firewall is in a description.'),
    D('IAC106', 'name', ['# Buckets the reports job may publish to.'], 'variable "publicly_accessible_buckets" {', ['  type    = list(string)', '  default = []', '}'], 'publicly_accessible is in a variable name.'),
  ]),
  // cloudformation
  file('cloudformation', 'templates/database.yaml', [
    P('IAC101', 'deletion-policy-delete', ['  OrdersDatabase:', '    Type: AWS::RDS::DBInstance'], ['    DeletionPolicy: Delete'], ['    Properties:', '      DBInstanceClass: db.t3.medium'], 'Deleting the stack deletes the database with no snapshot.', { was: ['    DeletionPolicy: Snapshot'] }),
  ], { head: ['Resources:'] }),
  file('cloudformation', 'templates/ledger.yaml', [
    P('IAC102', 'deletion-protection-off', ['  LedgerCluster:', '    Type: AWS::RDS::DBCluster', '    Properties:'], ['      DeletionProtection: false'], ['      Engine: aurora-postgresql'], 'Takes the deletion protection off the cluster.', { was: ['      DeletionProtection: true'] }),
  ], { head: ['Resources:'] }),
  file('cloudformation', 'templates/ci-role.yaml', [
    P('IAC103', 'admin-policy', ['  CiRole:', '    Type: AWS::IAM::Role', '    Properties:', '      ManagedPolicyArns:'], ['        - arn:aws:iam::aws:policy/AdministratorAccess'], ['      RoleName: ci'], 'Grants the CI role full administrator access.'),
  ], { head: ['Resources:'] }),
  file('cloudformation', 'templates/database-network.yaml', [
    P('IAC104', 'security-group-detached', ['  BillingDatabase:', '    Type: AWS::RDS::DBInstance', '    Properties:'], ['      VPCSecurityGroups: [!Ref DatabaseSecurityGroup]'], ['      DBSubnetGroupName: !Ref PrivateSubnets'], 'The database loses its security group.'),
  ], { head: ['Resources:'] }),
  file('cloudformation', 'templates/admin-ingress.yaml', [
    P('IAC105', 'world-ipv4', ['  AdminIngress:', '    Type: AWS::EC2::SecurityGroupIngress', '    Properties:', '      IpProtocol: tcp'], ['      CidrIp: 0.0.0.0/0'], ['      FromPort: 8443', '      ToPort: 8443'], 'Opens the admin port to every address.', { was: ['      CidrIp: 10.0.0.0/16'] }),
  ], { head: ['Resources:'] }),
  file('cloudformation', 'templates/analytics.yaml', [
    P('IAC106', 'publicly-accessible', ['  AnalyticsDatabase:', '    Type: AWS::RDS::DBInstance', '    Properties:'], ['      PubliclyAccessible: true'], ['      DBInstanceClass: db.t3.large'], 'Gives the database a public address.'),
  ], { head: ['Resources:'] }),
  file('cloudformation', 'templates/shared.yaml', [
    D('IAC103', 'comment', ['Resources:'], '  # no iam_role here: roles come from the shared IAM stack', ['  LogsBucket:', '    Type: AWS::S3::Bucket'], 'iam_role is in a comment.'),
    D('IAC104', 'string', ['Parameters:', '  OfficeCidr:', '    Type: String'], '    Description: "Office range; firewall rules are managed by the network stack"', ['    Default: 10.20.0.0/16'], 'firewall is in a description.'),
    D('IAC104', 'name', ['  # Lists the rules for the weekly review.'], '  FirewallAuditFunction:', ['    Type: AWS::Serverless::Function', '    Properties:', '      Handler: audit.handler'], 'Firewall is in a function name.'),
  ]),
  // pulumi
  file('pulumi', 'infra/storage.ts', [
    P('IAC101', 'force-destroy', ['export const exportsBucket = new aws.s3.BucketV2("exports", {', '    bucket: "acme-exports",'], ['    forceDestroy: true,'], ['});'], 'Lets Pulumi delete the bucket with every object in it.'),
  ]),
  file('pulumi', 'infra/ledger.ts', [
    P('IAC102', 'protect-off', ['export const ledger = new aws.rds.Instance("ledger", {', '    instanceClass: "db.t3.medium",'], ['}, { protect: false });'], ['export const ledgerId = ledger.id;'], 'Takes the Pulumi protect option off, so a destroy goes through.', { was: ['}, { protect: true });'] }),
  ]),
  file('pulumi', 'infra/ci.ts', [
    P('IAC103', 'admin-attachment', ['const ciRole = new aws.iam.Role("ci", { assumeRolePolicy: ciAssume.json });'], ['new aws.iam.RolePolicyAttachment("ci-admin", {', '    role: ciRole.name,', '    policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",', '});'], ['export const ciRoleName = ciRole.name;'], 'Grants the CI role full administrator access.', { key: 2 }),
  ]),
  file('pulumi', 'infra/database.ts', [
    P('IAC104', 'security-group-detached', ['export const billing = new aws.rds.Instance("billing", {', '    instanceClass: "db.t3.medium",'], ['    vpcSecurityGroupIds: [dbSecurityGroup.id],'], ['    dbSubnetGroupName: privateSubnets.name,', '});'], 'The database loses its security group.'),
  ]),
  file('pulumi', 'infra/network.ts', [
    P('IAC105', 'world-ipv4', ['export const admin = new aws.ec2.SecurityGroup("admin", {', '    vpcId: vpc.id,'], ['    ingress: [{ protocol: "tcp", fromPort: 8443, toPort: 8443, cidrBlocks: ["0.0.0.0/0"] }],'], ['});'], 'Opens the admin port to every address.'),
  ]),
  file('pulumi', 'infra/analytics.ts', [
    P('IAC106', 'publicly-accessible', ['export const analytics = new aws.rds.Instance("analytics", {', '    instanceClass: "db.t3.large",'], ['    publiclyAccessible: true,'], ['});'], 'Gives the database a public address.'),
  ]),
  file('pulumi', 'infra/policies.ts', [
    D('IAC103', 'comment', ['import * as aws from "@pulumi/aws";'], '// iam_policy documents come from ./policy-docs; this file creates none', ['export const region = aws.config.region;'], 'iam_policy is in a comment.'),
    D('IAC104', 'string', ['export function requireNetworkTicket(change: string): void {'], '    throw new Error("firewall rules are managed by the network stack: " + change);', ['}'], 'firewall is in an error message.'),
    D('IAC104', 'name', ['// Lists the rules for the weekly review.'], 'export function auditFirewallRules(): string[] {', ['    return [];', '}'], 'Firewall is in a function name.'),
  ]),
];

const container = (name) => ['      containers:', `        - name: ${name}`, `          image: acme/${name}:2`, '          securityContext:'];
const podSecurity = ['    spec:', '      securityContext:'];

const KUBERNETES = [
  // k8s-manifest
  file('k8s-manifest', 'deploy/node-agent.yaml', [
    P('K8S101', 'privileged', container('node-agent'), ['            privileged: true'], ['      serviceAccountName: node-agent'], 'The container runs privileged, with every device of the node.'),
    C('K8S101', 'not-privileged', container('api'), ['            privileged: false'], ['      serviceAccountName: api'], 'Says the container is not privileged.'),
  ]),
  file('k8s-manifest', 'deploy/log-shipper.yaml', [
    P('K8S102', 'host-path', ['      volumes:'], ['        - name: docker-socket', '          hostPath:', '            path: /var/run/docker.sock'], ['      containers:', '        - name: log-shipper'], 'Mounts the Docker socket of the node into the pod.', { key: 1 }),
    C('K8S102', 'empty-dir', ['      volumes:'], ['        - name: scratch', '          emptyDir: {}'], ['      containers:', '        - name: api'], 'A scratch volume of the pod; nothing of the node.', { key: 1 }),
  ]),
  file('k8s-manifest', 'deploy/backup.yaml', [
    P('K8S103', 'run-as-root', podSecurity, ['        runAsUser: 0'], ['      containers:', '        - name: backup'], 'The pod runs as root.'),
    C('K8S103', 'run-as-user', podSecurity, ['        runAsUser: 1000'], ['      containers:', '        - name: api'], 'The pod runs as an ordinary user.'),
  ]),
  file('k8s-manifest', 'deploy/indexer.yaml', [
    P('K8S104', 'non-root-off', podSecurity, ['        runAsNonRoot: false'], ['      containers:', '        - name: indexer'], 'Lets the pod run as root.', { was: ['        runAsNonRoot: true'] }),
    C('K8S104', 'non-root-on', podSecurity, ['        runAsNonRoot: true'], ['      containers:', '        - name: api'], 'Requires a user other than root.'),
  ]),
  file('k8s-manifest', 'deploy/scc-indexer.yaml', [
    P('K8S104', 'scc-run-as-any', ['apiVersion: security.openshift.io/v1', 'kind: SecurityContextConstraints', 'metadata:', '  name: indexer', 'runAsUser:'], ['  type: RunAsAny'], ['seLinuxContext:', '  type: MustRunAs'], 'OpenShift constraint that lets the pods run as any user, root included.'),
  ]),
  file('k8s-manifest', 'deploy/vpn.yaml', [
    P('K8S105', 'sys-admin', ['          securityContext:', '            capabilities:'], ['              add: ["NET_ADMIN", "SYS_ADMIN"]'], ['      restartPolicy: Always'], 'Gives the container the admin capabilities of the kernel.'),
    P('K8S105', 'sys-module', ['          securityContext:', '            capabilities:'], ['              add: ["SYS_MODULE"]'], ['      nodeSelector: { role: edge }'], 'Lets the container load kernel modules on the node.'),
    C('K8S105', 'drop-all', ['          securityContext:', '            capabilities:'], ['              drop: ["ALL"]'], ['      restartPolicy: Always'], 'Drops every capability.'),
  ]),
  file('k8s-manifest', 'deploy/dns-cache.yaml', [
    P('K8S106', 'host-network', ['  template:', '    spec:'], ['      hostNetwork: true'], ['      containers:', '        - name: dns-cache'], 'The pod shares the network of the node.'),
    C('K8S106', 'pod-network', ['  template:', '    spec:'], ['      hostNetwork: false'], ['      containers:', '        - name: api'], 'The pod keeps its own network.'),
  ]),
  file('k8s-manifest', 'deploy/admission.yaml', [
    D('K8S101', 'comment', ['apiVersion: v1', 'kind: Namespace'], '# privileged: true is rejected here by the admission policy', ['metadata:', '  name: workers'], 'privileged: true is in a comment.'),
    D('K8S106', 'string', ['kind: ConfigMap', 'data:'], '  help: "Pods in this namespace may not set hostNetwork: true"', ['  owner: platform-team'], 'hostNetwork: true is in a help text.'),
    D('K8S102', 'name', ['kind: CronJob', 'metadata:'], '  name: hostpath-audit', ['spec:', '  schedule: "0 3 * * *"'], 'hostpath is in a job name.'),
  ]),
  // helm
  file('helm', 'charts/agent/templates/daemonset.yaml', [
    P('K8S102', 'host-path', ['      volumes:'], ['        - name: host-root', '          hostPath:', '            path: /'], ['      containers:', '        - name: {{ .Chart.Name }}'], 'Mounts the whole file system of the node.', { key: 1 }),
  ]),
  file('helm', 'charts/agent/values.yaml', [
    P('K8S104', 'non-root-off', ['podSecurityContext:', '  runAsUser: 1000'], ['  runAsNonRoot: false'], ['  fsGroup: 2000'], 'The chart default lets the pods run as root.', { was: ['  runAsNonRoot: true'] }),
  ]),
  file('helm', 'charts/agent/templates/checks.yaml', [
    D('K8S104', 'comment', ['{{- if .Values.podSecurityContext }}'], '{{- /* runAsNonRoot: false is refused by values.schema.json */}}', ['{{- end }}'], 'runAsNonRoot: false is in a template comment.'),
    D('K8S101', 'string', ['{{- if .Values.agent.debugShell }}'], '{{- fail "privileged: true is not allowed in this chart" }}', ['{{- end }}'], 'privileged: true is in an error message.'),
    D('K8S102', 'name', ['{{/* Volume list of the agent. */}}'], '{{- define "agent.hostPathVolumes" -}}', ['{{- toYaml .Values.extraVolumes }}', '{{- end }}'], 'hostPath is in a template name.'),
  ]),
  // compose
  file('compose', 'docker-compose.yml', [
    P('K8S101', 'privileged', ['  ci-runner:', '    image: acme/ci-runner:3'], ['    privileged: true'], ['    restart: unless-stopped'], 'The container runs privileged.'),
    P('K8S102', 'docker-socket', ['  watchtower:', '    image: containrrr/watchtower', '    volumes:'], ['      - /var/run/docker.sock:/var/run/docker.sock'], ['    restart: unless-stopped'], 'Mounts the Docker socket of the host.'),
    P('K8S103', 'user-root', ['  backup:', '    image: acme/backup:1'], ['    user: root'], ['    restart: "no"'], 'The container runs as root.'),
    P('K8S105', 'net-admin', ['  vpn:', '    image: acme/vpn:2'], ['    cap_add: [NET_ADMIN]'], ['    restart: unless-stopped'], 'Gives the container the network admin capability.'),
    P('K8S106', 'host-network', ['  metrics:', '    image: prom/node-exporter'], ['    network_mode: host'], ['    restart: unless-stopped'], 'The container shares the network of the host.'),
  ], { head: ['services:'] }),
  file('compose', 'docker-compose.override.yml', [
    D('K8S101', 'comment', ['services:', '  ci-runner:'], '    # privileged: true was taken out after the security review', ['    image: acme/ci-runner:3'], 'privileged: true is in a comment.'),
    D('K8S101', 'string', ['  api:', '    labels:'], '      com.acme.help: "Do not run this stack with privileged: true"', ['    image: acme/api:5'], 'privileged: true is in a help label.'),
    D('K8S102', 'name', ['  # One-off job, run by hand.'], '  hostpath-cleaner:', ['    image: acme/cleaner:1', '    profiles: [manual]'], 'hostpath is in a service name.'),
  ]),
  // ecs-task
  file('ecs-task', 'deploy/agent-task.json', [
    P('K8S101', 'privileged', ['  "containerDefinitions": [{', '      "name": "agent",', '      "image": "acme/agent:2",'], ['      "privileged": true,'], ['      "essential": true', '  }]'], 'The container runs privileged.'),
  ], { head: ['{', '  "family": "agent",'], tail: ['}'] }),
  file('ecs-task', 'deploy/shipper-task.json', [
    P('K8S102', 'host-volume', ['  "family": "log-shipper",', '  "volumes": ['], ['    { "name": "docker-socket", "host": { "sourcePath": "/var/run/docker.sock" } }'], ['  ],', '  "containerDefinitions": []'], 'Mounts the Docker socket of the host.'),
  ], { head: ['{'], tail: ['}'] }),
  file('ecs-task', 'deploy/backup-task.json', [
    P('K8S103', 'user-root', ['  "containerDefinitions": [{', '      "name": "backup",', '      "image": "acme/backup:1",'], ['      "user": "0",'], ['      "essential": true', '  }]'], 'The container runs as root.'),
  ], { head: ['{', '  "family": "backup",'], tail: ['}'] }),
  file('ecs-task', 'deploy/profiler-task.json', [
    P('K8S105', 'sys-ptrace', ['  "containerDefinitions": [{', '      "name": "profiler",', '      "image": "acme/profiler:1",'], ['      "linuxParameters": { "capabilities": { "add": ["SYS_PTRACE"] } },'], ['      "essential": true', '  }]'], 'Lets the container trace other processes and read their memory.'),
  ], { head: ['{', '  "family": "profiler",'], tail: ['}'] }),
  file('ecs-task', 'deploy/metrics-task.json', [
    P('K8S106', 'host-network', ['  "family": "node-metrics",'], ['  "networkMode": "host",'], ['  "containerDefinitions": []'], 'The task shares the network of the host.'),
  ], { head: ['{'], tail: ['}'] }),
  file('ecs-task', 'deploy/audit-task.json', [
    D('K8S101', 'comment', ['{'], '  "//": "privileged: true is blocked by the cluster policy",', ['  "cpu": "256",'], 'privileged: true is in a comment key.'),
    D('K8S103', 'string', ['  "containerDefinitions": [{', '      "name": "audit",'], '      "dockerLabels": { "help": "runAsUser: 0 is not supported here" },', ['      "image": "acme/audit:1"', '  }],'], 'runAsUser: 0 is in a help label.'),
    D('K8S102', 'name', ['  "tags": [{ "key": "team", "value": "platform" }],'], '  "family": "hostpath-audit"', ['}'], 'hostpath is in the task family name.'),
  ]),
  // docker-run
  file('docker-run', 'scripts/start-services.sh', [
    P('K8S101', 'privileged', ['# CI runner.'], ['docker run -d --name ci-runner --privileged acme/ci-runner:3'], ['echo "ci-runner started"'], 'The container runs privileged.'),
    P('K8S102', 'host-root', ['# Inspector.'], ['docker run -d --name inspector -v /:/host:ro acme/inspector:1'], ['echo "inspector started"'], 'Mounts the whole file system of the host.'),
    P('K8S103', 'user-root', ['# Backup.'], ['docker run --rm --user 0 -v backups:/backups acme/backup:1'], ['echo "backup done"'], 'The container runs as root.'),
    P('K8S105', 'sys-ptrace', ['# Profiler.'], ['docker run --rm --cap-add SYS_PTRACE acme/profiler:1'], ['echo "profile written"'], 'Lets the container trace other processes and read their memory.'),
    P('K8S106', 'host-network', ['# Metrics.'], ['docker run -d --name metrics --network host prom/node-exporter'], ['echo "metrics started"'], 'The container shares the network of the host.'),
  ], { head: ['#!/bin/sh', 'set -eu'] }),
  file('docker-run', 'scripts/checks.sh', [
    D('K8S101', 'comment', ['#!/bin/sh'], '# no --privileged here: privileged: true is not allowed on these hosts', ['set -eu'], 'privileged: true is in a comment.'),
    D('K8S106', 'string', ['check_network() {'], '  echo "Refusing to start: hostNetwork: true is not allowed" >&2', ['  return 1', '}'], 'hostNetwork: true is in an error message.'),
    D('K8S102', 'name', ['# Run by the nightly job.'], 'test_hostpath_is_never_mounted() {', ['  [ -z "$(docker inspect -f "{{ .Mounts }}" agent | grep bind)" ]', '}'], 'hostpath is in a test name.'),
  ]),
  // pulumi (Kubernetes provider)
  file('pulumi', 'infra/k8s/worker.ts', [
    P('K8S104', 'non-root-off', ['        spec: {', '            containers: [{', '                name: "worker",', '                image: "acme/worker:1.4",'], ['                securityContext: { runAsNonRoot: false },'], ['            }],', '        },'], 'Lets the worker run as root, through the Kubernetes provider of Pulumi.'),
  ]),
  file('pulumi', 'infra/k8s/guards.ts', [
    D('K8S101', 'comment', ['import * as k8s from "@pulumi/kubernetes";'], '// privileged: true stays off: the namespace enforces the restricted level', ['export const namespace = "workers";'], 'privileged: true is in a comment.'),
    D('K8S103', 'string', ['export function checkUser(uid: number): void {'], '    if (uid === 0) throw new Error("runAsUser: 0 is not allowed in this cluster");', ['}'], 'runAsUser: 0 is in an error message.'),
    D('K8S102', 'name', ['// Volumes the worker may mount.'], 'export function hostPathVolumes(): string[] {', ['    return [];', '}'], 'hostPath is in a function name.'),
  ]),
];

const CONFIG = [
  // config-yaml
  file('config-yaml', 'traefik/dynamic.yml', [
    P('CFG101', 'wildcard-header', ['http:', '  middlewares:', '    api-headers:', '      headers:', '        customResponseHeaders:'], ['          Access-Control-Allow-Origin: "*"'], ['          Vary: Origin'], 'Every origin may read the API responses.'),
  ]),
  file('config-yaml', 'config/settings.yml', [
    P('CFG102', 'debug-on', ['app:', '  name: billing'], ['  debug: true'], ['  workers: 4'], 'Turns debug mode on.', { was: ['  debug: false'] }),
    C('CFG102', 'debug-off', ['worker:', '  name: billing-worker'], ['  debug: false'], ['  concurrency: 8'], 'Debug mode stays off.'),
  ]),
  file('config-yaml', 'config/application.yml', [
    P('CFG103', 'root-debug', ['logging:', '  level:'], ['    root: DEBUG'], ['    org.hibernate.SQL: WARN'], 'Sets the root logger to DEBUG.', { was: ['    root: INFO'] }),
  ]),
  file('config-yaml', 'config/application-staging.yml', [
    C('CFG103', 'root-info', ['logging:', '  level:'], ['    root: INFO'], ['    org.hibernate.SQL: WARN'], 'The root logger at INFO.'),
  ]),
  file('config-yaml', 'config/application-db.yml', [
    P('CFG105', 'pool-timeout-removed', ['spring:', '  datasource:', '    hikari:'], ['      connection-timeout: 30000'], ['      maximum-pool-size: 10'], 'Takes the connection timeout of the pool out.'),
  ]),
  file('config-yaml', 'config/application-reports.yml', [
    C('CFG105', 'pool-timeout-added', ['spring:', '  datasource:', '    hikari:'], ['      connection-timeout: 30000'], ['      maximum-pool-size: 4'], 'Adds a connection timeout.'),
  ]),
  file('config-yaml', 'config/messages.yml', [
    D('CFG102', 'comment', ['# Settings shared by every environment.'], '# debug = true only in config/dev.yml, never here', ['shared:', '  locale: en'], 'debug = true is in a comment.'),
    D('CFG105', 'string', ['errors:'], '  gateway: "The request hit a timeout, please retry"', ['  not_found: "Not found"'], 'timeout is in a message shown to the user.'),
    D('CFG103', 'name', ['checks:'], '  - name: test-debug-endpoint-is-disabled', ['    url: /internal/status', '    expect: 404'], 'debug is in a test name.'),
  ]),
  // config-json
  file('config-json', 'config/production.json', [
    P('CFG102', 'debug-on', ['  "name": "billing",'], ['  "debug": true,'], ['  "workers": 4'], 'Turns debug mode on.', { was: ['  "debug": false,'] }),
  ], { head: ['{'], tail: ['}'] }),
  file('config-json', 'config/logging.json', [
    P('CFG103', 'level-silly', ['  "logger": {'], ['    "level": "silly",'], ['    "format": "json"', '  }'], 'winston level silly, more verbose than debug: every payload goes to the log.', { was: ['    "level": "info",'] }),
  ], { head: ['{'], tail: ['}'] }),
  file('config-json', 'docker/daemon.json', [
    P('CFG104', 'docker-api', ['  "log-driver": "json-file",'], ['  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2375"],'], ['  "live-restore": true'], 'The Docker daemon API on TCP 2375, with no TLS, on every interface.'),
  ], { head: ['{'], tail: ['}'] }),
  file('config-json', 'config/app.json', [
    D('CFG102', 'comment', ['{'], '  "//": "debug = true is set only in development.json",', ['  "locale": "en",'], 'debug = true is in a comment key.'),
    D('CFG105', 'string', ['  "errors": {'], '    "gateway": "Gateway timeout, try again later",', ['    "notFound": "Not found"', '  },'], 'timeout is in a message shown to the user.'),
    D('CFG103', 'name', ['  "scripts": {'], '    "test:debug-flag-off": "node --test test/flags.test.js",', ['    "start": "node server.js"', '  }'], 'debug is in a test script name.'),
  ], { tail: ['}'] }),
  // config-code
  file('config-code', 'src/server.js', [
    P('CFG101', 'cors-any-origin', ['const app = express();'], ['app.use(cors({ origin: "*" }));'], ['app.use(express.json());'], 'Every origin may read the API responses.'),
    C('CFG101', 'cors-named-origin', ['const admin = express();'], ['admin.use(cors({ origin: "https://app.acme.example" }));'], ['admin.use(express.json());'], 'CORS for one named origin.'),
  ]),
  file('config-code', 'src/routes.js', [
    D('CFG103', 'comment', ['const router = express.Router();'], '// trace sampling is set in otel.js, not here', ['router.get("/health", (req, res) => res.send("ok"));'], 'trace is in a comment.'),
    D('CFG105', 'string', ['function upstreamFailed(res) {'], '  return res.status(504).send("Upstream timeout, please retry");', ['}'], 'timeout is in a message shown to the user.'),
    D('CFG103', 'name', ['// Guard for production builds.'], 'function debugRoutesDisabled(env) {', ['  return env === "production";', '}'], 'debug is in a function name.'),
  ]),
  // dotenv
  file('dotenv', 'deploy/production.env', [
    P('CFG102', 'app-debug', ['APP_ENV=production'], ['APP_DEBUG=true'], ['APP_URL=https://billing.acme.example'], 'Turns debug mode on.', { was: ['APP_DEBUG=false'] }),
    P('CFG103', 'log-trace', ['LOG_CHANNEL=stack'], ['LOG_LEVEL=trace'], ['LOG_STACK=single'], 'Sets the log level to trace.', { was: ['LOG_LEVEL=info'] }),
  ]),
  file('dotenv', 'deploy/shared.env', [
    D('CFG102', 'comment', ['APP_NAME=billing'], '# APP_DEBUG=true goes only in .env.development', ['APP_LOCALE=en'], 'DEBUG=true is in a comment.'),
    D('CFG105', 'string', ['MAINTENANCE=false'], 'MAINTENANCE_MESSAGE="Requests may timeout during the upgrade"', ['MAINTENANCE_RETRY_AFTER=120'], 'timeout is in a message shown to the user.'),
    D('CFG103', 'name', ['CRON_TIMEZONE=UTC'], 'CRON_JOB_NAME=purge-debug-logs', ['CRON_SCHEDULE="0 4 * * *"'], 'debug is in a job name.'),
  ]),
  // ini
  file('ini', 'php/conf.d/app.ini', [
    P('CFG102', 'display-errors', ['[PHP]'], ['display_errors = On'], ['log_errors = On'], 'PHP prints errors and stack traces in the page: debug mode by another name.', { was: ['display_errors = Off'] }),
  ]),
  file('ini', 'php/conf.d/limits.ini', [
    P('CFG105', 'max-execution-time-removed', ['[PHP]', 'memory_limit = 256M'], ['max_execution_time = 30'], ['post_max_size = 16M'], 'Without the limit a request can run forever.'),
  ]),
  file('ini', 'php/conf.d/workers.ini', [
    D('CFG102', 'comment', ['[PHP]'], '; display_errors stays Off: debug = true is never set in production', ['expose_php = Off'], 'debug = true is in a comment.'),
    D('CFG105', 'string', ['[maintenance]'], 'message = "Requests may timeout during the upgrade"', ['retry_after = 120'], 'timeout is in a message shown to the user.'),
    D('CFG103', 'name', ['; Rotates the verbose logs every night.'], '[program:debug-log-rotator]', ['command = /usr/local/bin/rotate-logs'], 'debug is in a program name.'),
  ]),
  // nginx
  file('nginx', 'conf.d/api.conf', [
    P('CFG101', 'add-header-any-origin', ['location /api/ {'], ['    add_header Access-Control-Allow-Origin * always;'], ['    proxy_pass http://api:8080;', '}'], 'Every origin may read the API responses.'),
  ]),
  file('nginx', 'nginx.conf', [
    P('CFG103', 'error-log-debug', ['worker_processes auto;'], ['error_log /var/log/nginx/error.log debug;'], ['pid /run/nginx.pid;'], 'Sets the error log to debug.', { was: ['error_log /var/log/nginx/error.log warn;'] }),
  ]),
  file('nginx', 'conf.d/stream.conf', [
    P('CFG104', 'listen-redis', ['stream {', '    server {'], ['        listen 6379;'], ['        proxy_pass cache:6379;', '    }', '}'], 'Puts the Redis port on the edge proxy.'),
  ]),
  file('nginx', 'conf.d/upstream.conf', [
    P('CFG105', 'read-timeout-removed', ['location /reports/ {', '    proxy_pass http://reports:8080;'], ['    proxy_read_timeout 30s;'], ['}'], 'Takes the read timeout of the proxy out.'),
  ]),
  file('nginx', 'conf.d/tools.conf', [
    D('CFG103', 'comment', ['# Internal tools.'], '# no debug log here: error_log stays at warn', ['upstream grafana { server grafana:3000; }'], 'debug is in a comment.'),
    D('CFG105', 'string', ['location @upstream_down {'], '    return 504 "Upstream timeout, please retry";', ['}'], 'timeout is in a message shown to the user.'),
    D('CFG103', 'name', ['# Profilers, reachable from the office only.'], 'upstream debug_tools {', ['    server profiler:6060;', '}'], 'debug is in an upstream name.'),
  ]),
  // dockerfile
  file('dockerfile', 'images/db/Dockerfile', [
    P('CFG104', 'expose-postgres', ['FROM postgres:16', 'COPY init.sql /docker-entrypoint-initdb.d/'], ['EXPOSE 5432'], ['CMD ["postgres"]'], 'Exposes the PostgreSQL port of the image.'),
  ]),
  file('dockerfile', 'images/api/Dockerfile', [
    C('CFG104', 'expose-http', ['FROM node:22-alpine', 'COPY . /app'], ['EXPOSE 8080'], ['CMD ["node", "/app/server.js"]'], 'Exposes the HTTP port of the API.'),
  ]),
  file('dockerfile', 'images/tools/Dockerfile', [
    D('CFG102', 'comment', ['FROM node:22 AS build'], '# debug = true is set only in the dev image', ['WORKDIR /src'], 'debug = true is in a comment.'),
    D('CFG103', 'string', ['FROM node:22-alpine'], 'LABEL description="API image; the debug endpoints are off"', ['COPY --from=build /src/dist /app'], 'debug is in an image description.'),
    D('CFG103', 'name', ['# Extra stage with the profilers.'], 'FROM node:22 AS debug-tools', ['RUN npm install -g clinic'], 'debug is in a stage name.'),
  ]),
];

// The cases measured by hand in part 2a (`.vibeflow/aceite/medicao/<origin>/mini.diff` in the
// worktree of that work), with their path under `regression/<origin>/`. Two lines that sat next to
// each other in a measured diff sit apart here, so a finding matches one of them.
const r5n = 'r5-estreitamento';
const r5c = 'r5-controles';
const r6 = 'r6-cache-compartilhado';
const f1b = 'f1b-marcada-pelo-projeto';
const r7 = 'r7-dado-literal';
const reg = (origin, path, segments, extra) => file(REGRESSION, `${origin}/${path}`, segments, extra);

const REGRESSION_CASES = [
  reg(r5n, 'app/jobs/session_cleanup.rb', [
    R(r5n, 'planted', 'DAT101', 'session-where-delete-all', ['class SessionCleanup < ApplicationJob', '  def perform(cutoff)'], ['    Session.where("expires_at < ?", cutoff).delete_all'], ['    Rails.logger.info("session cleanup done")', '  end', 'end'], 'Deletes every expired session in one statement: a mass delete with a filter.'),
  ]),
  reg(r5n, 'app/services/trial_reaper.rb', [
    R(r5n, 'planted', 'DAT101', 'account-where-destroy-all', ['class TrialReaper', '  def call'], ['    Account.where(plan: "trial").destroy_all'], ['    true', '  end', 'end'], 'Destroys every trial account: a mass delete with a filter.'),
  ]),
  reg(r5n, 'billing/tasks.py', [
    R(r5n, 'planted', 'DAT101', 'invoice-filter-delete', ['from billing.models import Invoice', '', '', '@shared_task', 'def drop_void_invoices():'], ['    Invoice.objects.filter(status="void").delete()'], ['    return "done"'], 'Deletes every void invoice: a mass delete with a filter.'),
  ]),
  reg(r5n, 'src/events/retention.ts', [
    R(r5n, 'planted', 'DAT101', 'event-delete-many-where', ['import { prisma } from "../db";', '', 'export async function dropTenantEvents(tenantId: string): Promise<void> {'], ['  await prisma.event.deleteMany({ where: { tenantId } });'], ['  console.info("tenant events dropped");', '}'], 'Deletes every event of a tenant: a mass delete with a filter.'),
  ]),
  reg(r5n, 'Services/AuditLogRetention.cs', [
    R(r5n, 'planted', 'DAT101', 'audit-log-execute-delete', ['public class AuditLogRetention', '{', '    public async Task RunAsync(DateTime cutoff)', '    {'], ['        await db.AuditLogs.Where(l => l.CreatedAt < cutoff).ExecuteDeleteAsync();'], ['        logger.LogInformation("audit log retention done");', '    }', '}'], 'Deletes every old audit log row in one statement.'),
  ]),
  reg(r5n, 'scripts/prune_cache.sh', [
    R(r5n, 'planted', 'DAT101', 'find-delete', ['#!/usr/bin/env bash', 'set -euo pipefail', 'CACHE_DIR="${CACHE_DIR:?}"'], ['find "$CACHE_DIR" -type f -mtime +30 -delete'], ['echo "cache pruned"'], 'Deletes every file older than 30 days.'),
  ]),
  reg(r5n, 'app/controllers/users_controller.rb', [
    R(r5n, 'control', 'DAT101', 'user-find-destroy', ['class UsersController < ApplicationController', '  def destroy'], ['    User.find(params[:id]).destroy'], ['    head :no_content', '  end', 'end'], 'Deletes one record by its key.'),
  ]),
  reg(r5n, 'src/users/remove.ts', [
    R(r5n, 'control', 'DAT101', 'user-delete-by-id', ['import { prisma } from "../db";', '', 'export async function removeUser(id: string): Promise<void> {'], ['  await prisma.user.delete({ where: { id } });'], ['}'], 'Deletes one record by its key.'),
  ]),
  reg(r5n, 'tools/release.py', [
    R(r5n, 'control', 'SEC108', 'subprocess-call-list', ['import os', 'import subprocess', '', '', 'def fetch_and_build():'], ['    subprocess.call(["git", "fetch", "--all"])'], ['    return 0'], 'A fixed command as a list: nothing is built at run time.'),
    R(r5n, 'control', 'SEC108', 'os-system-fixed', ['def build_only():'], ['    os.system("make build")'], ['    return 0'], 'A fixed command string: nothing is built at run time.'),
  ]),
  reg(r5n, 'src/crm/sync.js', [
    R(r5n, 'planted', 'DAT102', 'crm-post-cpf', ['const crm = require("./client");', '', 'async function pushContact(user) {'], ['  await crm.post("/contacts", { name: user.name, cpf: user.cpf });'], ['  return true;', '}'], 'Sends the full CPF to a third party.'),
  ]),
  reg(r5c, 'src/main/java/shop/CartService.java', [
    R(r5c, 'control', 'DAT101', 'list-remove-all', ['public class CartService {', '    public Cart dropExpired(Cart cart, List<Item> expiredItems) {'], ['        cart.getItems().removeAll(expiredItems);'], ['        return cart;', '    }', '}'], 'removeAll on a list in memory: no stored data.'),
  ]),
  reg(r5c, 'src/session/cache.js', [
    R(r5c, 'control', 'DAT101', 'map-clear', ['const sessionCache = new Map();', '', 'function resetLocalCache() {'], ['  sessionCache.clear();'], ['  return sessionCache.size;', '}'], 'Clears a map in memory: no stored data.'),
  ]),
  reg(r5c, 'worker/queue.py', [
    R(r5c, 'control', 'DAT101', 'list-clear', ['pending_jobs = []', '', '', 'def drop_pending():'], ['    pending_jobs.clear()'], ['    return len(pending_jobs)'], 'Clears a list in memory: no stored data.'),
  ]),
  reg(r5c, 'internal/store/users.go', [
    R(r5c, 'control', 'DAT101', 'delete-by-id', ['type UserStore struct{ db *sql.DB }', '', 'func (s *UserStore) Remove(ctx context.Context, id int64) error {'], ['\t_, err := s.db.ExecContext(ctx, "DELETE FROM users WHERE id = $1", id)'], ['\treturn err', '}'], 'Deletes one row by its key.'),
  ]),
  reg(r5c, 'internal/store/messages.go', [
    R(r5c, 'planted', 'DAT101', 'delete-older-than', ['type MessageStore struct{ db *sql.DB }', '', 'func (s *MessageStore) DropOlderThan(ctx context.Context, cutoff time.Time) error {'], ['\t_, err := s.db.ExecContext(ctx, "DELETE FROM messages WHERE created_at < $1", cutoff)'], ['\treturn err', '}'], 'Deletes every message older than a date: a mass delete with a filter.'),
  ]),
  reg(r5c, 'app/services/order_archiver.rb', [
    R(r5c, 'control', 'DAT101', 'soft-delete', ['class OrderArchiver', '  def call(ids)'], ['    Order.where(id: ids).update_all(deleted_at: Time.current)'], ['    true', '  end', 'end'], 'Marks rows as deleted: nothing is removed.'),
  ]),
  reg(r5c, 'storage/cleanup.py', [
    R(r5c, 'planted', 'DAT101', 's3-delete-objects', ['s3 = boto3.client("s3")', '', '', 'def drop_stale(bucket, stale):'], ['    s3.delete_objects(Bucket=bucket, Delete={"Objects": stale})'], ['    return len(stale)'], 'Deletes many stored objects at once.'),
    R(r5c, 'control', 'DAT101', 'redis-delete-one-key', ['def release_lock(bucket):'], ['    redis_client.delete(f"upload:{bucket}:lock")'], ['    return True'], 'Deletes one key; in the measured diff this line sat right after the delete_objects one.'),
  ]),
  reg(r5c, 'ops/reset_cache.py', [
    R(r5c, 'planted', 'DAT101', 'redis-flushdb', ['redis_client = redis.Redis.from_url(settings.REDIS_URL)', '', '', 'def reset_everything():'], ['    redis_client.flushdb()'], ['    return True'], 'Deletes every key of the Redis database.'),
  ]),
  reg(r6, 'src/search/reindex.ts', [
    R(r6, 'planted', 'DAT101', 'es-delete-by-query', ['import { es } from "./client";', '', 'export async function dropStaleDocuments(before: string): Promise<void> {'], ['  await es.deleteByQuery({ index: "orders", query: { range: { updatedAt: { lt: before } } } });'], ['  console.info("stale documents dropped");', '}'], 'Deletes every stale document of a search index.'),
  ]),
  raw(REGRESSION, `${f1b}/.gitattributes`, '*.png binary\npackage-lock.json linguist-generated=true\n', '*.png binary\npackage-lock.json linguist-generated=true\n# makemigrations output: collapsed in review\n*/migrations/*.py linguist-generated=true\n'),
  reg(f1b, 'billing/migrations/0007_remove_invoice.py', [
    R(f1b, 'planted', 'DS102', 'run-sql-drop-table', ['# Generated by Django 5.1.3 on 2026-11-02 14:10', '', 'from django.db import migrations', '', '', 'class Migration(migrations.Migration):', '', '    dependencies = [', '        ("billing", "0006_invoice_paid_at"),', '    ]', '', '    operations = ['], ['        migrations.RunSQL("DROP TABLE billing_invoice_archive"),'], ['        migrations.DeleteModel(', '            name="Invoice",', '        ),', '    ]'], 'DROP TABLE in a migration the project marks as generated in its .gitattributes.'),
  ], { newFile: true }),
  reg(r7, 'test/fixtures/customers.json', [
    R(r7, 'planted', 'DAT102', 'json-cpf-and-card', ['[', '  { "name": "Carla Souza", "email": "carla.souza@example.com" },'], ['  { "name": "Marcos Vieira", "email": "marcos.vieira@gmail.com", "cpf": "286.455.970-14", "card_number": "5425 2334 3010 9903" },'], ['  { "name": "Dora Pires", "email": "dora.pires@example.com" }', ']'], 'A CPF and a card number written into a committed file.'),
  ]),
  reg(r7, 'data/import/2026-11-customers.csv', [
    R(r7, 'planted', 'DAT102', 'csv-cpf', ['name,email,cpf', 'Helena Prado,helena.prado@uol.com.br,417.208.963-51'], ['Rui Antunes,rui.antunes@terra.com.br,905.317.482-06'], ['Vera Matos,vera.matos@bol.com.br,638.150.294-77'], 'A CPF written into a committed data file.'),
  ]),
  reg(r7, 'app/validators/cpf_validator.rb', [
    R(r7, 'control', 'DAT102', 'cpf-regex', ['class CpfValidator < ActiveModel::EachValidator'], ['  CPF_FORMAT = /\\A\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}\\z/'], ['  def validate_each(record, attribute, value)', '  end', 'end'], 'The format of a CPF, not a CPF.'),
  ]),
  reg(r7, 'README.md', [
    R(r7, 'control', 'DAT102', 'readme-sentence', ['Run the importer with a CSV of customers.', '', 'The file needs a `name` column.'], ['', 'The `cpf` column takes the 11 digits with or without punctuation, for example `123.456.789-09`.'], [], 'A sentence of documentation with a made-up example.', { key: 1 }),
  ]),
];

export const FILES = Object.freeze([...DATABASE, ...INFRASTRUCTURE, ...KUBERNETES, ...CONFIG, ...REGRESSION_CASES]);

// --- layout --------------------------------------------------------------------------------------

// Two blank lines between segments: with one line of context on each side, two cases of one file
// sit at least 5 lines apart.
const GAP = ['', ''];

function sideOf(s) {
  if (s.kind === 'decoy' || s.kind === 'control') return s.side ?? 'added';
  if (s.side) return s.side;
  const entry = CATALOG_TECH_1_20.rules[s.rule] ?? languages.CATALOG_1_20.rules[s.rule];
  return entry.scope === 'r' ? 'removed' : 'added';
}

function layout(f) {
  const base = [...f.head];
  const change = [...f.head];
  const placed = [];
  f.segments.forEach((s, i) => {
    if (i > 0) {
      base.push(...GAP);
      change.push(...GAP);
    }
    base.push(...s.before);
    change.push(...s.before);
    const side = sideOf(s);
    if (side === 'removed') {
      placed.push({ s, side, line: base.length + 1 + s.key });
      base.push(...s.lines);
      change.push(...(s.was ?? []));
    } else {
      placed.push({ s, side, line: change.length + 1 + s.key });
      change.push(...s.lines);
      base.push(...(s.was ?? []));
    }
    base.push(...s.after);
    change.push(...s.after);
  });
  base.push(...f.tail);
  change.push(...f.tail);
  const sides = new Set(placed.map((p) => p.side));
  if (sides.size > 1) throw new Error(`${f.path} mixes added and removed cases`);
  return { base: `${base.join('\n')}\n`, change: `${change.join('\n')}\n`, placed };
}

function caseId(format, s) {
  if (s.kind === 'decoy') return `${format}-${s.rule}-decoy-${s.decoyKind}`;
  if (format === REGRESSION) return `${REGRESSION}-${s.origin}-${s.variant}`;
  if (s.kind === 'control') return `${format}-${s.rule}-control-${s.variant}`;
  return `${format}-${s.rule}-${s.variant}`;
}

function entry(format, path, { s, side, line }) {
  const snippet = [...s.lines];
  return {
    id: caseId(format, s),
    kind: s.kind,
    rule: s.rule,
    language: format,
    extension: extname(path),
    variant: s.variant,
    decoyKind: s.decoyKind,
    path,
    line,
    side,
    ...labels(s.rule, path, snippet.join('\n')),
    text: s.lines[s.key],
    snippet,
    why: s.why,
    origin: s.origin,
  };
}

// The whole fixture: the files of the base commit, the files of the change commit, and the cases
// in the order of FILES.
export function buildFixture() {
  const base = {};
  const change = {};
  const cases = [];
  for (const f of FILES) {
    if (base[f.path] !== undefined || change[f.path] !== undefined) throw new Error(`${f.path} twice`);
    if (f.raw) {
      base[f.path] = f.raw.base;
      change[f.path] = f.raw.change;
      continue;
    }
    const files = layout(f);
    if (!f.newFile) base[f.path] = files.base;
    change[f.path] = files.change;
    for (const placed of files.placed) cases.push(entry(f.format, f.path, placed));
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
  const text = lines.map((l) => l.replace(/\t/g, '  ').trim()).filter((l) => l.length > 0).join(' ⏎ ');
  return text.includes('`') ? `\`\` ${cell(text)} \`\`` : `\`${cell(text)}\``;
}

const yesNo = (value) => (value ? 'yes' : 'no');

// The table of cases the README carries, generated from the matrix.
export function casesTable() {
  const rows = [
    '| Id | Kind | Rule | Ext. listed | Term listed | Line | Lines | Why |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const c of expandCases()) {
    const kind = c.kind === 'decoy' ? `decoy (${c.decoyKind})` : c.kind;
    rows.push(`| ${c.id} | ${kind} | ${c.rule} | ${yesNo(c.extensionListed)} | ${yesNo(c.tokenListed)} | ${c.side === 'removed' ? `${c.line} (base)` : c.line} | ${code(c.snippet)} | ${cell(c.why)} |`);
  }
  rows.push('');
  rows.push('| Rule | Quadrant | Not covered because |');
  rows.push('|---|---|---|');
  const gaps = Object.entries(QUADRANT_GAPS).flatMap(([id, quadrants]) => Object.entries(quadrants).map(([q, reason]) => `| ${id} | ${q} | ${cell(reason)} |`));
  if (gaps.length === 0) rows.push('| none | | every rule covers the three quadrants |');
  else rows.push(...gaps);
  return `${rows.join('\n')}\n`;
}
