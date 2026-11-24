# gate-tech fixture

Measures what the audit's Critical Gate (step 4 of `plugins/vibeflow/skills/audit/SKILL.md`)
flags in its four technology domains: Database, Infrastructure (IaC), Kubernetes and Config, 25
rules. Each rule is planted as the behaviour it names, in several formats, next to decoys that
carry its trigger word without being the behaviour and controls that are legitimate lines next to
the behaviour; the regression cases measured by hand in part 2a of the language-agnostic work sit
in a format of their own. A model runs the step elsewhere; the scripts here build the input, and
the meter and the request printer of `gate-languages/` read and write the rest. Nothing here
calls a model or the network.

## Files

* `matrix.mjs`: the formats, the 25 rules, the planted cases, the decoys, the controls, the
  regression cases and `CATALOG_TECH_1_20`, a frozen copy of what the 1.20.0 catalog writes in
  the four domains (the `files:` line of each domain and the id, severity, scope and trigger of
  each rule). The labels of each case are computed from it by `extensionListed` and
  `tokenListed`, never written by hand. `QUADRANT_GAPS` says why a rule cannot have a case in a
  quadrant: DS103 has none without its trigger word (the reason is at the end of the table of
  cases); every other rule covers the three the fixture asks for.
* `make.mjs <dest>`: builds `<dest>/repo`, a git repository with two commits (the base and the
  change), and `<dest>/manifest.json`, the list of cases, with the builder of
  `gate-languages/make.mjs`. `<dest>` must be missing or empty. Author, committer and date are
  fixed, so two runs build the same commits.

The manifest has the fields of the gate-languages one. `language` holds the id of the format,
`kind` is `planted`, `decoy` or `control`, and `origin` names the measured case a regression case
comes from (`null` elsewhere). Every file sits under a top folder named after its format, with a
realistic path inside it (`django-migration/billing/migrations/0008_delete_invoice.py`,
`rails-migration/db/migrate/...`), so the diff of one format is the diff of that folder.

A run on one format, with the scratch directory of your choice:

```
node test/fixtures/gate-tech/make.mjs <scratch>/gt
git -C <scratch>/gt/repo diff HEAD~1 HEAD -- terraform/ > <scratch>/terraform.diff
node test/fixtures/gate-languages/gate-prompt.mjs --skill plugins/vibeflow/skills/audit/SKILL.md --diff <scratch>/terraform.diff > <scratch>/terraform-prompt.md
# run a model on terraform-prompt.md and save its answer as <scratch>/terraform.md
node test/fixtures/gate-languages/measure.mjs --manifest <scratch>/gt/manifest.json --language terraform --report <scratch>/terraform.md
```

`--language` takes a format id here. Without it, the whole diff and the whole manifest; several
reports passed together are measured one by one and summed, as in gate-languages.

## What it measures

* **Quadrants.** The meter splits detection by two labels, under the names it has in
  gate-languages. Here "extension listed" (`extensionListed`) says that the path of the case
  matches the `files:` line of its rule's domain in 1.20.0: `*.sql` and `**/migrations/*` for
  Database, `*.tf` and `*.hcl` for Infrastructure, `*.yml` and `*.yaml` for Kubernetes, and for
  Config `*.yml`, `*.yaml`, `*.json`, `*.toml`, Dockerfiles and any source-code file (the
  `SOURCE_CODE` list of the matrix). A glob without a slash names a file anywhere in the tree;
  `**/migrations/*` is read against the whole path. "Term listed" (`tokenListed`) says that the
  case lines hold a trigger word of the rule in 1.20.0, as a word, in any case: the backticked
  terms of the trigger, or the words it names when it has none (IAC104, CFG104, CFG105). A
  `name = value` term takes `=` or `:` and a quoted value, but not a quote between the name and
  the separator, so `"privileged": true` in JSON is another spelling; the words of a term are
  separated by white space only, so `drop_table` and `dropTable` do not hold `DROP TABLE`.
* **Three quadrants per rule.** Every rule has at least three planted cases in three formats:
  at least one on its file line with its trigger word, one in a format off the file line and one
  without the trigger word (the behaviour as another tool writes it: `drop_table :orders`,
  `DeletionPolicy: Delete`, `"privileged": true` in a task definition,
  `add_header Access-Control-Allow-Origin *`), or the reason in `QUADRANT_GAPS`. Removed-line
  rules (IAC104, CFG105) plant the
  protection in the base and take it out in the change; IAC103, whose scope is both sides, has an
  added and a removed case.
* **Decoys.** In each domain, for each format with a planted case of that domain, three lines
  that hold the trigger word of a rule of the domain without the behaviour: in a comment, in a
  string shown to a person (an error, a help text, a description) and in a test, function, job or
  resource name. `tokenListed` is true for every decoy. JSON has no comments: its comment decoy is
  a `"//"` key.
* **Controls.** At least one per rule: a legitimate line next to the behaviour that is not it
  (`privileged: false`, `runAsUser: 1000`, `drop: ["ALL"]`, `prevent_destroy = true`,
  `cidr_blocks = ["10.0.0.0/16"]`, `ADD COLUMN`, `DELETE FROM ... WHERE id = %s`, CORS for a named
  origin, log level `INFO`, port 8080, a timeout added). A finding there is a false positive; the
  meter counts controls flagged apart from the decoys.
* **Regression cases.** The lines measured by hand in part 2a, under `regression/<origin>/`, each
  with the expected kind: `planted` when the rule has to fire, `control` when it must not. Their
  labels come from `CATALOG_TECH_1_20` for DS102 and from the gate-languages `CATALOG_1_20` for
  the Security and Data rules. The migration of `generated-migration` is marked as generated
  by the `.gitattributes` of its folder, as in the measured case. `Rails.cache.clear`,
  `cache.clear()`, `flush_all` and the test factory with a CPF are left out: their expected kind is
  still open.
* **Row deletes in the matrix.** A Django data migration that deletes every row through the ORM
  (`.objects.all().delete()`) and a SQL `DELETE` of every expired row are planted under DAT101,
  the rule the regression table gives a mass delete, and not under DS103, whose behaviour is
  `TRUNCATE`. They are labelled by the gate-languages `CATALOG_1_20` and ask for no decoy.

## What it does not measure

* The files are snippets in the idiom of each format, not configurations that apply: resources,
  stanzas and declarations are left out where they would only add lines.
* One run of a model is one sample. Comparing two versions of the step takes several runs of each,
  passed together to `measure.mjs`.
* It does not judge the catalog: the expected kind of every case is the behaviour the 1.20.0
  trigger describes, read as behaviour, and some behaviours sit under two rules (a table emptied
  with no condition is DS103 and DS106; a column dropped with `ALTER TABLE ... DROP COLUMN` is DS104
  and DS105). A finding of the other rule on a planted line counts as "other rule".
* No line holds a credential, real or fake.
* A finding on a removed line is matched by its line number in the base commit.

## Cases

Generated from `matrix.mjs` by `casesTable()`; a test fails when this table and the matrix
disagree. Line numbers are in the change, except for removed lines, in the base. `⏎` joins the
lines of a block.

<!-- cases:start -->
| Id | Kind | Rule | Ext. listed | Term listed | Line | Lines | Why |
|---|---|---|---|---|---|---|---|
| sql-DS101-drop-database | planted | DS101 | yes | yes | 2 | `DROP DATABASE IF EXISTS analytics;` | Drops the whole analytics database. |
| sql-DS101-control-create-database | control | DS101 | yes | no | 7 | `CREATE DATABASE analytics_archive;` | Creates a database; nothing is lost. |
| sql-DS102-drop-table | planted | DS102 | yes | yes | 2 | `DROP TABLE orders_archive;` | Drops a table with its rows. |
| sql-DS102-control-drop-view | control | DS102 | yes | no | 7 | `DROP VIEW IF EXISTS monthly_totals;` | Drops a view: no row is stored in it. |
| sql-DS103-truncate | planted | DS103 | yes | yes | 2 | `TRUNCATE TABLE sessions;` | Empties the sessions table. |
| sql-DAT101-expired-rows | planted | DAT101 | no | no | 7 | `DELETE FROM sessions WHERE expires_at < now();` | Deletes every expired session at once: a mass delete with a filter, as the DELETE ... WHERE created_at < $1 the regression table expects flagged. |
| sql-DS103-control-delete-by-key | control | DS103 | yes | no | 12 | `DELETE FROM sessions WHERE id = $1;` | Deletes one session by its key; the table keeps every other row. |
| sql-DS104-drop-column | planted | DS104 | yes | yes | 2 | `ALTER TABLE users DROP COLUMN legacy_email;` | Drops a column with its values. |
| sql-DS104-control-add-column | control | DS104 | yes | no | 7 | `ALTER TABLE users ADD COLUMN phone text;` | Adds a column; nothing is lost. |
| sql-DS105-drop-partition | planted | DS105 | yes | yes | 2 | `ALTER TABLE events DROP PARTITION p2025_q1;` | Drops a partition of the table with every row in it. |
| sql-DS105-control-add-partition | control | DS105 | yes | no | 7 | `ALTER TABLE events ADD PARTITION (PARTITION p2026_q2 VALUES LESS THAN ('2026-07-01'));` | Adds a partition; nothing is lost. |
| sql-DS106-delete-all-rows | planted | DS106 | yes | yes | 2 | `DELETE FROM carts;` | Deletes every row of the table: no WHERE. |
| sql-DS108-rename-table | planted | DS108 | yes | yes | 2 | `ALTER TABLE orders RENAME TO purchases;` | Renames a table that running code still reads by its old name. |
| sql-DS108-control-rename-index | control | DS108 | yes | no | 7 | `ALTER INDEX idx_orders_created RENAME TO idx_orders_created_at;` | Renames an index: no query names it. |
| sql-DS110-modify | planted | DS110 | yes | yes | 2 | `ALTER TABLE invoices MODIFY amount INT;` | Changes the column type from decimal to integer: the cents are cut. |
| sql-DS110-alter-type | planted | DS110 | yes | no | 7 | `ALTER TABLE invoices ALTER COLUMN amount TYPE integer;` | The same type change in PostgreSQL, without the word MODIFY. |
| sql-DS110-control-set-default | control | DS110 | yes | no | 12 | `ALTER TABLE invoices ALTER COLUMN note SET DEFAULT '';` | Sets a default; the type stays. |
| sql-DS102-decoy-comment | decoy (comment) | DS102 | yes | yes | 2 | `-- never DROP TABLE on an archive: the auditors read them for seven years` | DROP TABLE is in a comment. |
| sql-DS103-decoy-string | decoy (string) | DS103 | yes | yes | 7 | `COMMENT ON TABLE ledger IS 'Append only: do not TRUNCATE, every row is audited';` | TRUNCATE is in the table comment people read in the catalog. |
| sql-DS103-decoy-name | decoy (name) | DS103 | yes | yes | 12 | `CREATE FUNCTION test_truncate_is_refused() RETURNS SETOF text AS $$` | truncate is in a test name. |
| app-sql-DS101-drop-database | planted | DS101 | no | yes | 2 | `cursor.execute("DROP DATABASE IF EXISTS analytics_staging")` | Application code drops a database. |
| app-sql-DS102-drop-table | planted | DS102 | no | yes | 2 | `cursor.execute("DROP TABLE IF EXISTS import_batches")` | Application code drops a table. |
| app-sql-DS103-truncate | planted | DS103 | no | yes | 2 | `cursor.execute("TRUNCATE audit_events")` | Application code empties the audit table. |
| app-sql-DS105-drop-partition | planted | DS105 | no | yes | 2 | `cursor.execute("ALTER TABLE events DROP PARTITION p2024")` | Application code drops a partition with its rows. |
| app-sql-DS106-delete-all-rows | planted | DS106 | no | yes | 2 | `cursor.execute("DELETE FROM carts")` | Application code deletes every row: no WHERE. |
| app-sql-DS106-control-delete-by-id | control | DS106 | no | yes | 7 | `cursor.execute("DELETE FROM carts WHERE id = %s", (cart_id,))` | Deletes one row by its key. |
| app-sql-DS108-rename-table | planted | DS108 | no | yes | 2 | `cursor.execute("RENAME TABLE orders TO purchases")` | Application code renames a table. |
| app-sql-DS103-decoy-comment | decoy (comment) | DS103 | no | yes | 2 | `# TRUNCATE would lock the table; old rows go in batches instead` | TRUNCATE is in a comment. |
| app-sql-DS102-decoy-string | decoy (string) | DS102 | no | yes | 8 | `raise PermissionError("DROP TABLE is not allowed from the application")` | DROP TABLE is in an error message. |
| app-sql-DS103-decoy-name | decoy (name) | DS103 | no | yes | 13 | `def test_truncate_needs_the_admin_role(cursor):` | truncate is in a test name. |
| django-migration-DS102-delete-model | planted | DS102 | yes | no | 2 | `migrations.DeleteModel(name="Invoice"),` | Django deletes the model and drops its table, with no SQL word. |
| django-migration-DAT101-run-python-delete-all | planted | DAT101 | yes | no | 2 | `migrations.RunPython(lambda apps, schema_editor: apps.get_model("shop", "Cart").objects.all().delete()),` | A data migration deletes every cart through the ORM: a mass delete (a DELETE with no WHERE), not a TRUNCATE. |
| django-migration-DS103-run-sql-truncate | planted | DS103 | yes | yes | 2 | `migrations.RunSQL("TRUNCATE TABLE shop_cartitem;"),` | A migration empties the cart items table with TRUNCATE. |
| django-migration-DS104-remove-field | planted | DS104 | yes | no | 2 | `migrations.RemoveField(model_name="user", name="legacy_email"),` | Django drops the column, with no SQL word. |
| django-migration-DS108-alter-model-table | planted | DS108 | yes | no | 2 | `migrations.AlterModelTable(name="order", table="purchases"),` | Django renames the table of the model. |
| django-migration-DS110-alter-field | planted | DS110 | yes | no | 2 | `migrations.AlterField(model_name="invoice", name="amount", field=models.IntegerField()),` | Django changes the column type from decimal to integer. |
| django-migration-DS103-decoy-name | decoy (name) | DS103 | yes | yes | 2 | `def forwards_truncate_check(apps, schema_editor):` | truncate is in a function name. |
| django-migration-DS102-decoy-comment | decoy (comment) | DS102 | yes | yes | 7 | `# DROP TABLE of the old ledger is left to the DBA runbook` | DROP TABLE is in a comment. |
| django-migration-DS103-decoy-string | decoy (string) | DS103 | yes | yes | 13 | `model_name="ledger", name="note", field=models.TextField(help_text="Append only: never TRUNCATE this table"),` | TRUNCATE is in a help text. |
| rails-migration-DS102-drop-table | planted | DS102 | no | no | 3 | `drop_table :legacy_orders` | Rails drops the table, with no SQL word. |
| rails-migration-DS104-remove-column | planted | DS104 | no | no | 3 | `remove_column :users, :legacy_email` | Rails drops the column, with no SQL word. |
| rails-migration-DS104-remove-reference | planted | DS104 | no | no | 3 | `remove_reference :orders, :customer, foreign_key: true, index: true` | Rails drops the customer_id column with its values, and its index and foreign key with it. |
| rails-migration-DS105-remove-foreign-key | planted | DS105 | no | no | 3 | `remove_foreign_key :invoices, :customers` | Rails drops the foreign key constraint of the table (ALTER TABLE ... DROP CONSTRAINT): a part of the table, no column, with no SQL word. |
| rails-migration-DS108-rename-table | planted | DS108 | no | no | 3 | `rename_table :orders, :purchases` | Rails renames the table. |
| rails-migration-DS110-change-column | planted | DS110 | no | no | 3 | `change_column :invoices, :amount, :integer` | Rails changes the column type from decimal to integer. |
| rails-migration-DS102-decoy-comment | decoy (comment) | DS102 | no | yes | 2 | `# DROP TABLE of the ledger never happens here: it is append only` | DROP TABLE is in a comment. |
| rails-migration-DS103-decoy-string | decoy (string) | DS103 | no | yes | 9 | `raise ActiveRecord::IrreversibleMigration, "Cannot TRUNCATE the ledger to roll back"` | TRUNCATE is in an error message. |
| rails-migration-DS103-decoy-name | decoy (name) | DS103 | no | yes | 14 | `def truncate_guard!` | truncate is in a method name. |
| liquibase-DS101-drop-schema | planted | DS101 | no | no | 4 | `<sql>DROP SCHEMA analytics</sql>` | Drops the analytics database: the changeSet runs only on MySQL, where DROP SCHEMA is DROP DATABASE. |
| liquibase-DS102-drop-table | planted | DS102 | no | no | 4 | `<dropTable tableName="legacy_orders" cascadeConstraints="true"/>` | Liquibase drops the table, with no SQL word. |
| liquibase-DS104-drop-column | planted | DS104 | no | no | 4 | `<dropColumn tableName="users" columnName="legacy_email"/>` | Liquibase drops the column, with no SQL word. |
| liquibase-DS106-delete-all-rows | planted | DS106 | no | no | 4 | `<delete tableName="carts"/>` | Liquibase deletes every row of the table: the change has no where. |
| liquibase-DS102-decoy-comment | decoy (comment) | DS102 | no | yes | 4 | `<!-- DROP TABLE of the ledger needs a ticket from finance -->` | DROP TABLE is in a comment. |
| liquibase-DS103-decoy-string | decoy (string) | DS103 | no | yes | 11 | `<comment>Replaces the nightly TRUNCATE job with a batched delete</comment>` | TRUNCATE is in the change description people read. |
| liquibase-DS103-decoy-name | decoy (name) | DS103 | no | yes | 17 | `<changeSet id="truncate-guard-001" author="data-team">` | truncate is in the change id. |
| terraform-IAC101-force-destroy | planted | IAC101 | yes | yes | 3 | `force_destroy = true` | Lets terraform destroy the bucket with every invoice in it. |
| terraform-IAC101-control-force-destroy-off | control | IAC101 | yes | no | 9 | `force_destroy = false` | Keeps the bucket from being destroyed while it holds objects. |
| terraform-IAC101-skip-final-snapshot | planted | IAC101 | yes | no | 3 | `skip_final_snapshot = true` | Destroying the database takes no final snapshot, so its data goes with it. |
| terraform-IAC102-prevent-destroy-off | planted | IAC102 | yes | yes | 3 | `prevent_destroy = false` | Takes the lock against destruction off the ledger database. |
| terraform-IAC102-deletion-protection-off | planted | IAC102 | yes | no | 10 | `deletion_protection = false` | Takes the deletion protection off the cluster. |
| terraform-IAC102-control-prevent-destroy-on | control | IAC102 | yes | no | 16 | `prevent_destroy = true` | Puts the lock against destruction on. |
| terraform-IAC103-admin-attachment | planted | IAC103 | yes | yes | 7 | `resource "aws_iam_role_policy_attachment" "ci_admin" { ⏎ role       = aws_iam_role.ci.name ⏎ policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess" ⏎ }` | Grants the CI role full administrator access. |
| terraform-IAC103-control-role-output | control | IAC103 | yes | yes | 2 | `value = aws_iam_role.ci.arn` | Reads the ARN of a role to print it; no permission changes. |
| terraform-IAC103-user-attachment-removed | planted | IAC103 | yes | yes | 4 (base) | `resource "aws_iam_user_policy_attachment" "auditor_read_only" { ⏎ user       = aws_iam_user.auditor.name ⏎ policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess" ⏎ }` | An IAM policy attachment taken out: an IAM change on a removed line. |
| terraform-IAC103-project-owner | planted | IAC103 | yes | no | 3 | `resource "google_project_iam_member" "ci_owner" { ⏎ role   = "roles/owner" ⏎ member = "serviceAccount:ci@acme-prod.iam.gserviceaccount.com" ⏎ }` | Makes the CI service account owner of the whole project. |
| terraform-IAC104-firewall-rule-removed | planted | IAC104 | yes | yes | 4 (base) | `resource "google_compute_firewall" "deny_ssh_from_internet" { ⏎ network = google_compute_network.main.name ⏎ deny { protocol = "tcp" } ⏎ }` | A deny rule of the firewall taken out: it outranked the allow rule beside it (the default priority 1000 against 1100), so SSH from the whole internet now gets in. |
| terraform-IAC104-acl-association-removed | planted | IAC104 | yes | no | 5 (base) | `resource "aws_network_acl_association" "db_private" { ⏎ network_acl_id = aws_network_acl.db_private.id ⏎ subnet_id      = aws_subnet.db_private.id ⏎ }` | The database subnet loses its network ACL and goes back to the default ACL of the VPC, which allows all traffic in and out. |
| terraform-IAC104-control-security-group-attached | control | IAC104 | yes | no | 3 | `vpc_security_group_ids = [aws_security_group.reports_private.id]` | Attaches a private security group: added, and it narrows access. |
| terraform-IAC105-world-ipv4 | planted | IAC105 | yes | yes | 5 | `cidr_blocks = ["0.0.0.0/0"]` | Opens the admin port to every IPv4 address. |
| terraform-IAC105-world-ipv6 | planted | IAC105 | yes | no | 14 | `ipv6_cidr_blocks = ["::/0"]` | Opens the metrics port to every IPv6 address. |
| terraform-IAC105-control-vpc-only | control | IAC105 | yes | no | 23 | `cidr_blocks = ["10.0.0.0/16"]` | Opens a port to the private network only. |
| terraform-IAC106-publicly-accessible | planted | IAC106 | yes | yes | 3 | `publicly_accessible = true` | Gives the database a public address. |
| terraform-IAC106-control-not-public | control | IAC106 | yes | yes | 9 | `publicly_accessible = false` | Keeps the database private. |
| terraform-IAC106-public-read-acl | planted | IAC106 | yes | no | 3 | `acl    = "public-read"` | Lets anyone on the internet read every object of the exports bucket. |
| terraform-IAC103-decoy-comment | decoy (comment) | IAC103 | yes | yes | 2 | `# IAM roles live in the iam module: no aws_iam resource is created here` | aws_iam is in a comment. |
| terraform-IAC104-decoy-string | decoy (string) | IAC104 | yes | yes | 10 | `description = "Office ranges; firewall rules are managed by the network team"` | firewall is in a description. |
| terraform-IAC106-decoy-name | decoy (name) | IAC106 | yes | yes | 15 | `variable "publicly_accessible_buckets" {` | publicly_accessible is in a variable name. |
| cloudformation-IAC101-deletion-policy-delete | planted | IAC101 | no | no | 4 | `DeletionPolicy: Delete` | Deleting the stack deletes the database with no snapshot. |
| cloudformation-IAC102-deletion-protection-off | planted | IAC102 | no | no | 5 | `DeletionProtection: false` | Takes the deletion protection off the cluster. |
| cloudformation-IAC103-admin-policy | planted | IAC103 | no | no | 6 | `- arn:aws:iam::aws:policy/AdministratorAccess` | Grants the CI role full administrator access. |
| cloudformation-IAC104-deny-entry-removed | planted | IAC104 | no | no | 5 (base) | `DenyRdpFromInternet: ⏎ Type: AWS::EC2::NetworkAclEntry ⏎ Properties: { NetworkAclId: !Ref PublicAcl, RuleNumber: 90, RuleAction: deny, ⏎ Protocol: 6, CidrBlock: 0.0.0.0/0, PortRange: { From: 3389, To: 3389 } }` | A deny entry of the network ACL taken out: entry 90 came before the allow entry 100 beside it, so RDP from the whole internet now gets in. |
| cloudformation-IAC105-world-ipv4 | planted | IAC105 | no | no | 6 | `CidrIp: 0.0.0.0/0` | Opens the admin port to every address. |
| cloudformation-IAC106-publicly-accessible | planted | IAC106 | no | no | 5 | `PubliclyAccessible: true` | Gives the database a public address. |
| cloudformation-IAC103-decoy-comment | decoy (comment) | IAC103 | no | yes | 2 | `# no iam_role here: roles come from the shared IAM stack` | iam_role is in a comment. |
| cloudformation-IAC104-decoy-string | decoy (string) | IAC104 | no | yes | 10 | `Description: "Office range; firewall rules are managed by the network stack"` | firewall is in a description. |
| cloudformation-IAC104-decoy-name | decoy (name) | IAC104 | no | yes | 15 | `FirewallAuditFunction:` | Firewall is in a function name. |
| pulumi-IAC101-force-destroy | planted | IAC101 | no | yes | 3 | `forceDestroy: true,` | Lets Pulumi delete the bucket with every object in it. |
| pulumi-IAC102-protect-off | planted | IAC102 | no | no | 3 | `}, { protect: false });` | Takes the Pulumi protect option off, so a destroy goes through. |
| pulumi-IAC103-admin-attachment | planted | IAC103 | no | no | 4 | `new aws.iam.RolePolicyAttachment("ci-admin", { ⏎ role: ciRole.name, ⏎ policyArn: "arn:aws:iam::aws:policy/AdministratorAccess", ⏎ });` | Grants the CI role full administrator access. |
| pulumi-IAC104-deny-rule-removed | planted | IAC104 | no | no | 2 (base) | `new aws.ec2.NetworkAclRule("deny-rdp-from-internet", { ⏎ networkAclId: publicAcl.id, ruleNumber: 90, egress: false, protocol: "tcp", ⏎ ruleAction: "deny", cidrBlock: "0.0.0.0/0", fromPort: 3389, toPort: 3389, ⏎ });` | A deny rule of the network ACL taken out: rule 90 came before the allow rule 100 beside it, so RDP from the whole internet now gets in. |
| pulumi-IAC105-world-ipv4 | planted | IAC105 | no | no | 3 | `ingress: [{ protocol: "tcp", fromPort: 8443, toPort: 8443, cidrBlocks: ["0.0.0.0/0"] }],` | Opens the admin port to every address. |
| pulumi-IAC106-publicly-accessible | planted | IAC106 | no | no | 3 | `publiclyAccessible: true,` | Gives the database a public address. |
| pulumi-IAC103-decoy-comment | decoy (comment) | IAC103 | no | yes | 2 | `// iam_policy documents come from ./policy-docs; this file creates none` | iam_policy is in a comment. |
| pulumi-IAC104-decoy-string | decoy (string) | IAC104 | no | yes | 7 | `throw new Error("firewall rules are managed by the network stack: " + change);` | firewall is in an error message. |
| pulumi-IAC104-decoy-name | decoy (name) | IAC104 | no | yes | 12 | `export function auditFirewallRules(): string[] {` | Firewall is in a function name. |
| k8s-manifest-K8S101-privileged | planted | K8S101 | yes | yes | 5 | `privileged: true` | The container runs privileged, with every device of the node. |
| k8s-manifest-K8S101-control-not-privileged | control | K8S101 | yes | no | 13 | `privileged: false` | Says the container is not privileged. |
| k8s-manifest-K8S102-host-path | planted | K8S102 | yes | yes | 3 | `- name: docker-socket ⏎ hostPath: ⏎ path: /var/run/docker.sock` | Mounts the Docker socket of the node into the pod. |
| k8s-manifest-K8S102-control-empty-dir | control | K8S102 | yes | no | 11 | `- name: scratch ⏎ emptyDir: {}` | A scratch volume of the pod; nothing of the node. |
| k8s-manifest-K8S103-run-as-root | planted | K8S103 | yes | yes | 3 | `runAsUser: 0` | The pod runs as root. |
| k8s-manifest-K8S103-control-run-as-user | control | K8S103 | yes | no | 10 | `runAsUser: 1000` | The pod runs as an ordinary user. |
| k8s-manifest-K8S104-non-root-off | planted | K8S104 | yes | yes | 3 | `runAsNonRoot: false` | Lets the pod run as root. |
| k8s-manifest-K8S104-control-non-root-on | control | K8S104 | yes | no | 10 | `runAsNonRoot: true` | Requires a user other than root. |
| k8s-manifest-K8S104-scc-run-as-any | planted | K8S104 | yes | no | 6 | `type: RunAsAny` | OpenShift constraint that lets the pods run as any user, root included. |
| k8s-manifest-K8S105-sys-admin | planted | K8S105 | yes | yes | 3 | `add: ["NET_ADMIN", "SYS_ADMIN"]` | Gives the container the admin capabilities of the kernel. |
| k8s-manifest-K8S105-sys-module | planted | K8S105 | yes | no | 9 | `add: ["SYS_MODULE"]` | Lets the container load kernel modules on the node. |
| k8s-manifest-K8S105-control-drop-all | control | K8S105 | yes | yes | 15 | `drop: ["ALL"]` | Drops every capability. |
| k8s-manifest-K8S106-host-network | planted | K8S106 | yes | yes | 3 | `hostNetwork: true` | The pod shares the network of the node. |
| k8s-manifest-K8S106-control-pod-network | control | K8S106 | yes | no | 10 | `hostNetwork: false` | The pod keeps its own network. |
| k8s-manifest-K8S101-decoy-comment | decoy (comment) | K8S101 | yes | yes | 3 | `# privileged: true is rejected here by the admission policy` | privileged: true is in a comment. |
| k8s-manifest-K8S106-decoy-string | decoy (string) | K8S106 | yes | yes | 10 | `help: "Pods in this namespace may not set hostNetwork: true"` | hostNetwork: true is in a help text. |
| k8s-manifest-K8S102-decoy-name | decoy (name) | K8S102 | yes | yes | 16 | `name: hostpath-audit` | hostpath is in a job name. |
| helm-K8S102-host-path | planted | K8S102 | yes | yes | 3 | `- name: host-root ⏎ hostPath: ⏎ path: /` | Mounts the whole file system of the node. |
| helm-K8S104-non-root-off | planted | K8S104 | yes | yes | 3 | `runAsNonRoot: false` | The chart default lets the pods run as root. |
| helm-K8S104-decoy-comment | decoy (comment) | K8S104 | yes | yes | 2 | `{{- /* runAsNonRoot: false is refused by values.schema.json */}}` | runAsNonRoot: false is in a template comment. |
| helm-K8S101-decoy-string | decoy (string) | K8S101 | yes | yes | 7 | `{{- fail "privileged: true is not allowed in this chart" }}` | privileged: true is in an error message. |
| helm-K8S102-decoy-name | decoy (name) | K8S102 | yes | yes | 12 | `{{- define "agent.hostPathVolumes" -}}` | hostPath is in a template name. |
| compose-K8S101-privileged | planted | K8S101 | yes | yes | 4 | `privileged: true` | The container runs privileged. |
| compose-K8S102-docker-socket | planted | K8S102 | yes | no | 11 | `- /var/run/docker.sock:/var/run/docker.sock` | Mounts the Docker socket of the host. |
| compose-K8S103-user-root | planted | K8S103 | yes | no | 17 | `user: root` | The container runs as root. |
| compose-K8S105-net-admin | planted | K8S105 | yes | yes | 23 | `cap_add: [NET_ADMIN]` | Gives the container the network admin capability. |
| compose-K8S106-host-network | planted | K8S106 | yes | no | 29 | `network_mode: host` | The container shares the network of the host. |
| compose-K8S101-decoy-comment | decoy (comment) | K8S101 | yes | yes | 3 | `# privileged: true was taken out after the security review` | privileged: true is in a comment. |
| compose-K8S101-decoy-string | decoy (string) | K8S101 | yes | yes | 9 | `com.acme.help: "Do not run this stack with privileged: true"` | privileged: true is in a help label. |
| compose-K8S102-decoy-name | decoy (name) | K8S102 | yes | yes | 14 | `hostpath-cleaner:` | hostpath is in a service name. |
| ecs-task-K8S101-privileged | planted | K8S101 | no | no | 6 | `"privileged": true,` | The container runs privileged. |
| ecs-task-K8S102-host-volume | planted | K8S102 | no | no | 4 | `{ "name": "docker-socket", "host": { "sourcePath": "/var/run/docker.sock" } }` | Mounts the Docker socket of the host into the shipper container. |
| ecs-task-K8S103-user-root | planted | K8S103 | no | no | 6 | `"user": "0",` | The container runs as root. |
| ecs-task-K8S105-sys-ptrace | planted | K8S105 | no | no | 6 | `"linuxParameters": { "capabilities": { "add": ["SYS_PTRACE"] } },` | Lets the container trace other processes and read their memory. |
| ecs-task-K8S106-host-network | planted | K8S106 | no | no | 3 | `"networkMode": "host",` | The task shares the network of the host. |
| ecs-task-K8S101-decoy-comment | decoy (comment) | K8S101 | no | yes | 2 | `"//": "privileged: true is blocked by the cluster policy",` | privileged: true is in a comment key. |
| ecs-task-K8S103-decoy-string | decoy (string) | K8S103 | no | yes | 8 | `"dockerLabels": { "help": "runAsUser: 0 is not supported here" },` | runAsUser: 0 is in a help label. |
| ecs-task-K8S102-decoy-name | decoy (name) | K8S102 | no | yes | 14 | `"family": "hostpath-audit"` | hostpath is in the task family name. |
| docker-run-K8S101-privileged | planted | K8S101 | no | no | 4 | `docker run -d --name ci-runner --privileged acme/ci-runner:3` | The container runs privileged. |
| docker-run-K8S102-host-root | planted | K8S102 | no | no | 9 | `docker run -d --name inspector -v /:/host:ro acme/inspector:1` | Mounts the whole file system of the host. |
| docker-run-K8S103-user-root | planted | K8S103 | no | no | 14 | `docker run --rm --user 0 -v backups:/backups acme/backup:1` | The container runs as root. |
| docker-run-K8S105-sys-ptrace | planted | K8S105 | no | no | 19 | `docker run --rm --cap-add SYS_PTRACE acme/profiler:1` | Lets the container trace other processes and read their memory. |
| docker-run-K8S106-host-network | planted | K8S106 | no | no | 24 | `docker run -d --name metrics --network host prom/node-exporter` | The container shares the network of the host. |
| docker-run-K8S101-decoy-comment | decoy (comment) | K8S101 | no | yes | 2 | `# no --privileged here: privileged: true is not allowed on these hosts` | privileged: true is in a comment. |
| docker-run-K8S106-decoy-string | decoy (string) | K8S106 | no | yes | 7 | `echo "Refusing to start: hostNetwork: true is not allowed" >&2` | hostNetwork: true is in an error message. |
| docker-run-K8S102-decoy-name | decoy (name) | K8S102 | no | yes | 13 | `test_hostpath_is_never_mounted() {` | hostpath is in a test name. |
| pulumi-K8S104-non-root-off | planted | K8S104 | no | yes | 5 | `securityContext: { runAsNonRoot: false },` | Lets the worker run as root, through the Kubernetes provider of Pulumi. |
| pulumi-K8S101-decoy-comment | decoy (comment) | K8S101 | no | yes | 2 | `// privileged: true stays off: the namespace enforces the restricted level` | privileged: true is in a comment. |
| pulumi-K8S103-decoy-string | decoy (string) | K8S103 | no | yes | 7 | `if (uid === 0) throw new Error("runAsUser: 0 is not allowed in this cluster");` | runAsUser: 0 is in an error message. |
| pulumi-K8S102-decoy-name | decoy (name) | K8S102 | no | yes | 12 | `export function hostPathVolumes(): string[] {` | hostPath is in a function name. |
| config-yaml-CFG101-wildcard-header | planted | CFG101 | yes | yes | 6 | `Access-Control-Allow-Origin: "*"` | Every origin may read the API responses. |
| config-yaml-CFG102-debug-on | planted | CFG102 | yes | yes | 3 | `debug: true` | Turns debug mode on. |
| config-yaml-CFG102-control-debug-off | control | CFG102 | yes | no | 9 | `debug: false` | Debug mode stays off. |
| config-yaml-CFG103-root-debug | planted | CFG103 | yes | yes | 3 | `root: DEBUG` | Sets the root logger to DEBUG. |
| config-yaml-CFG103-control-root-info | control | CFG103 | yes | no | 3 | `root: INFO` | The root logger at INFO. |
| config-yaml-CFG105-statement-timeout-removed | planted | CFG105 | yes | yes | 4 (base) | `statement_timeout: 5000` | Takes the statement timeout of the Rails connection out: the PostgreSQL default is 0, no limit, so a stuck query holds its connection forever. |
| config-yaml-CFG105-control-pool-timeout-added | control | CFG105 | yes | yes | 4 | `connection-timeout: 30000` | Adds a connection timeout. |
| config-yaml-CFG102-decoy-comment | decoy (comment) | CFG102 | yes | yes | 2 | `# debug = true only in config/dev.yml, never here` | debug = true is in a comment. |
| config-yaml-CFG105-decoy-string | decoy (string) | CFG105 | yes | yes | 8 | `gateway: "The request hit a timeout, please retry"` | timeout is in a message shown to the user. |
| config-yaml-CFG103-decoy-name | decoy (name) | CFG103 | yes | yes | 13 | `- name: test-debug-endpoint-is-disabled` | debug is in a test name. |
| config-json-CFG102-debug-on | planted | CFG102 | yes | no | 3 | `"debug": true,` | Turns debug mode on. |
| config-json-CFG103-level-silly | planted | CFG103 | yes | no | 3 | `"level": "silly",` | winston level silly, more verbose than debug: every payload goes to the log. |
| config-json-CFG104-docker-api | planted | CFG104 | yes | no | 3 | `"hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2375"],` | The Docker daemon API on TCP 2375, with no TLS, on every interface. |
| config-json-CFG102-decoy-comment | decoy (comment) | CFG102 | yes | yes | 2 | `"//": "debug = true is set only in development.json",` | debug = true is in a comment key. |
| config-json-CFG105-decoy-string | decoy (string) | CFG105 | yes | yes | 7 | `"gateway": "Gateway timeout, try again later",` | timeout is in a message shown to the user. |
| config-json-CFG103-decoy-name | decoy (name) | CFG103 | yes | yes | 13 | `"test:debug-flag-off": "node --test test/flags.test.js",` | debug is in a test script name. |
| config-code-CFG101-cors-any-origin | planted | CFG101 | yes | no | 2 | `app.use(cors({ origin: "*" }));` | Every origin may read the API responses. |
| config-code-CFG101-control-cors-named-origin | control | CFG101 | yes | no | 7 | `admin.use(cors({ origin: "https://app.acme.example" }));` | CORS for one named origin. |
| config-code-CFG103-decoy-comment | decoy (comment) | CFG103 | yes | yes | 2 | `// trace sampling is set in otel.js, not here` | trace is in a comment. |
| config-code-CFG105-decoy-string | decoy (string) | CFG105 | yes | yes | 7 | `return res.status(504).send("Upstream timeout, please retry");` | timeout is in a message shown to the user. |
| config-code-CFG103-decoy-name | decoy (name) | CFG103 | yes | yes | 12 | `function debugRoutesDisabled(env) {` | debug is in a function name. |
| dotenv-CFG102-app-debug | planted | CFG102 | no | yes | 2 | `APP_DEBUG=true` | Turns debug mode on. |
| dotenv-CFG103-log-trace | planted | CFG103 | no | yes | 7 | `LOG_LEVEL=trace` | Sets the log level to trace. |
| dotenv-CFG102-decoy-comment | decoy (comment) | CFG102 | no | yes | 2 | `# APP_DEBUG=true goes only in .env.development` | DEBUG=true is in a comment. |
| dotenv-CFG105-decoy-string | decoy (string) | CFG105 | no | yes | 7 | `MAINTENANCE_MESSAGE="Requests may timeout during the upgrade"` | timeout is in a message shown to the user. |
| dotenv-CFG103-decoy-name | decoy (name) | CFG103 | no | yes | 12 | `CRON_JOB_NAME=purge-debug-logs` | debug is in a job name. |
| ini-CFG102-display-errors | planted | CFG102 | no | no | 2 | `display_errors = On` | PHP prints errors and stack traces in the page: debug mode by another name. |
| ini-CFG105-harakiri-removed | planted | CFG105 | no | no | 4 (base) | `harakiri = 30` | Takes the uWSGI request timeout (harakiri) out: it is off by default, so a stuck request holds its worker forever. |
| ini-CFG102-decoy-comment | decoy (comment) | CFG102 | no | yes | 2 | `; display_errors stays Off: debug = true is never set in production` | debug = true is in a comment. |
| ini-CFG105-decoy-string | decoy (string) | CFG105 | no | yes | 7 | `message = "Requests may timeout during the upgrade"` | timeout is in a message shown to the user. |
| ini-CFG103-decoy-name | decoy (name) | CFG103 | no | yes | 12 | `[program:debug-log-rotator]` | debug is in a program name. |
| nginx-CFG101-add-header-any-origin | planted | CFG101 | no | no | 2 | `add_header Access-Control-Allow-Origin * always;` | Every origin may read the API responses. |
| nginx-CFG103-error-log-debug | planted | CFG103 | no | yes | 2 | `error_log /var/log/nginx/error.log debug;` | Sets the error log to debug. |
| nginx-CFG104-listen-redis | planted | CFG104 | no | yes | 3 | `listen 6379;` | Puts the Redis port on the edge proxy. |
| nginx-CFG105-read-timeout-removed | planted | CFG105 | no | yes | 3 (base) | `proxy_read_timeout 30s;` | Takes the read timeout of the proxy out. |
| nginx-CFG103-decoy-comment | decoy (comment) | CFG103 | no | yes | 2 | `# no debug log here: error_log stays at warn` | debug is in a comment. |
| nginx-CFG105-decoy-string | decoy (string) | CFG105 | no | yes | 7 | `return 504 "Upstream timeout, please retry";` | timeout is in a message shown to the user. |
| nginx-CFG103-decoy-name | decoy (name) | CFG103 | no | yes | 12 | `upstream debug_tools {` | debug is in an upstream name. |
| dockerfile-CFG104-expose-postgres | planted | CFG104 | yes | yes | 3 | `EXPOSE 5432` | Exposes the PostgreSQL port of the image. |
| dockerfile-CFG104-control-expose-http | control | CFG104 | yes | no | 3 | `EXPOSE 8080` | Exposes the HTTP port of the API. |
| dockerfile-CFG102-decoy-comment | decoy (comment) | CFG102 | yes | yes | 2 | `# debug = true is set only in the dev image` | debug = true is in a comment. |
| dockerfile-CFG103-decoy-string | decoy (string) | CFG103 | yes | yes | 7 | `LABEL description="API image; the debug endpoints are off"` | debug is in an image description. |
| dockerfile-CFG103-decoy-name | decoy (name) | CFG103 | yes | yes | 12 | `FROM node:22 AS debug-tools` | debug is in a stage name. |
| regression-bulk-delete-narrowing-session-where-delete-all | planted | DAT101 | yes | yes | 3 | `Session.where("expires_at < ?", cutoff).delete_all` | Deletes every expired session in one statement: a mass delete with a filter. |
| regression-bulk-delete-narrowing-account-where-destroy-all | planted | DAT101 | yes | yes | 3 | `Account.where(plan: "trial").destroy_all` | Destroys every trial account: a mass delete with a filter. |
| regression-bulk-delete-narrowing-invoice-filter-delete | planted | DAT101 | yes | no | 6 | `Invoice.objects.filter(status="void").delete()` | Deletes every void invoice: a mass delete with a filter. |
| regression-bulk-delete-narrowing-event-delete-many-where | planted | DAT101 | yes | no | 4 | `await prisma.event.deleteMany({ where: { tenantId } });` | Deletes every event of a tenant: a mass delete with a filter. |
| regression-bulk-delete-narrowing-audit-log-execute-delete | planted | DAT101 | no | no | 5 | `await db.AuditLogs.Where(l => l.CreatedAt < cutoff).ExecuteDeleteAsync();` | Deletes every old audit log row in one statement. |
| regression-bulk-delete-narrowing-find-delete | planted | DAT101 | no | no | 4 | `find "$CACHE_DIR" -type f -mtime +30 -delete` | Deletes every file older than 30 days. |
| regression-bulk-delete-narrowing-user-find-destroy | control | DAT101 | yes | no | 3 | `User.find(params[:id]).destroy` | Deletes one record by its key. |
| regression-bulk-delete-narrowing-user-delete-by-id | control | DAT101 | yes | no | 4 | `await prisma.user.delete({ where: { id } });` | Deletes one record by its key. |
| regression-bulk-delete-narrowing-subprocess-call-list | control | SEC108 | yes | yes | 6 | `subprocess.call(["git", "fetch", "--all"])` | A fixed command as a list: nothing is built at run time. |
| regression-bulk-delete-narrowing-os-system-fixed | control | SEC108 | yes | yes | 11 | `os.system("make build")` | A fixed command string: nothing is built at run time. |
| regression-bulk-delete-narrowing-crm-post-cpf | planted | DAT102 | yes | yes | 4 | `await crm.post("/contacts", { name: user.name, cpf: user.cpf });` | Sends the full CPF to a third party. |
| regression-delete-controls-list-remove-all | control | DAT101 | yes | yes | 3 | `cart.getItems().removeAll(expiredItems);` | removeAll on a list in memory: no stored data. |
| regression-delete-controls-map-clear | control | DAT101 | yes | no | 4 | `sessionCache.clear();` | Clears a map in memory: no stored data. |
| regression-delete-controls-list-clear | control | DAT101 | yes | no | 5 | `pending_jobs.clear()` | Clears a list in memory: no stored data. |
| regression-delete-controls-delete-by-id | control | DAT101 | yes | no | 4 | `_, err := s.db.ExecContext(ctx, "DELETE FROM users WHERE id = $1", id)` | Deletes one row by its key. |
| regression-delete-controls-delete-older-than | planted | DAT101 | yes | no | 4 | `_, err := s.db.ExecContext(ctx, "DELETE FROM messages WHERE created_at < $1", cutoff)` | Deletes every message older than a date: a mass delete with a filter. |
| regression-delete-controls-soft-delete | control | DAT101 | yes | no | 3 | `Order.where(id: ids).update_all(deleted_at: Time.current)` | Marks rows as deleted: nothing is removed. |
| regression-delete-controls-s3-delete-objects | planted | DAT101 | yes | no | 5 | `s3.delete_objects(Bucket=bucket, Delete={"Objects": stale})` | Deletes many stored objects at once. |
| regression-delete-controls-redis-delete-one-key | control | DAT101 | yes | no | 10 | `redis_client.delete(f"upload:{bucket}:lock")` | Deletes one key; in the measured diff this line sat right after the delete_objects one. |
| regression-delete-controls-redis-flushdb | planted | DAT101 | yes | no | 5 | `redis_client.flushdb()` | Deletes every key of the Redis database. |
| regression-shared-cache-es-delete-by-query | planted | DAT101 | yes | no | 4 | `await es.deleteByQuery({ index: "orders", query: { range: { updatedAt: { lt: before } } } });` | Deletes every stale document of a search index. |
| regression-generated-migration-run-sql-drop-table | planted | DS102 | yes | yes | 13 | `migrations.RunSQL("DROP TABLE billing_invoice_archive"),` | DROP TABLE in a migration the project marks as generated in its .gitattributes. |
| regression-literal-personal-data-json-cpf-and-card | planted | DAT102 | no | yes | 3 | `{ "name": "Marcos Vieira", "email": "marcos.vieira@example.org", "cpf": "286.455.970-14", "card_number": "4111 1111 1111 1111" },` | A CPF and a card number written into a committed file. |
| regression-literal-personal-data-csv-cpf | planted | DAT102 | no | no | 3 | `Rui Antunes,rui.antunes@example.net,905.317.482-06` | A CPF written into a committed data file. |
| regression-literal-personal-data-cpf-regex | control | DAT102 | yes | yes | 2 | `CPF_FORMAT = /\A\d{3}\.\d{3}\.\d{3}-\d{2}\z/` | The format of a CPF, not a CPF. |
| regression-literal-personal-data-readme-sentence | control | DAT102 | no | yes | 5 | `` The `cpf` column takes the 11 digits with or without punctuation, for example `123.456.789-09`. `` | A sentence of documentation with a made-up example. |

| Rule | Quadrant | Not covered because |
|---|---|---|
| DS103 | wordOff | Emptying a whole table by a database command without writing truncate has no real form in the tools of this fixture: raw SQL, Rails (`truncate_tables`), Laravel (`truncate()`) and Sequelize (`truncate: true`) all carry the word; Liquibase has no change for it; the `flush` of Django empties every table of the database rather than one, and is a management command rather than a migration operation, so it sits between DS101, DS103 and DAT101 and is no idiomatic DS103 case; the `repository.clear()` of TypeORM empties one table without the word, but no format of this fixture is TypeORM; and a row delete with no condition (`.objects.all().delete()`, `<delete>`) is DS106 and DAT101, not DS103. |
<!-- cases:end -->
