### Critical Gate
Left out of the package: none
- 🔴 CRITICAL [SEC101] python/admin_routes.py:2 — `@login_required` removed from `/admin/users` (blocks; line is in the old file)
- 🔴 CRITICAL [SEC101] python/admin_routes.py:8 — `@jwt_required()` removed from `/api/admin/export` (blocks; line is in the old file)
- 🔴 CRITICAL [SEC104] python/settings.py:2 — hardcoded `DATABASE_PASSWORD` literal (blocks)
- 🔴 CRITICAL [SEC104] python/settings.py:7 — hardcoded `SMTP_PASS` literal, a password under another name (blocks)
- 🔴 CRITICAL [DAT101] python/maintenance.py:2 — `Order.objects.all().delete()` deletes every order, the Django form of `delete_all` (blocks)
- 🟠 HIGH [DAT102] python/customers.py:3 — `card_number` returned in a JSON response (blocks)
- 🟠 HIGH [SEC106] python/http_client.py:2 — `requests.get(url, verify=False)` turns off certificate verification (blocks)
- 🟠 HIGH [SEC106] python/http_client.py:7 — `ssl._create_unverified_context()` turns off certificate verification (blocks)
- 🟡 WARNING [SEC108] python/jobs.py:2 — `subprocess.call` with `shell=True` and an f-string built from `name`
- 🟡 WARNING [SEC108] python/jobs.py:7 — `subprocess.run` with `shell=True` and an f-string built from `path`
- 🟡 WARNING [DAT104] python/sessions.py:2 — `logger.info` logs the `password` value
- 🟡 WARNING [DAT104] python/sessions.py:7 — `logging.debug` logs the `token` value