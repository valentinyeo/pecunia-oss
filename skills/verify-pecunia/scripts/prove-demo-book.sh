#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
EVIDENCE_ROOT="$REPO_ROOT/skills/verify-pecunia/evidence"
FEATURES=(accounts-and-bank-lines categories-and-rules dashboard-sums subscriptions investments fx-conversion tax invoices)
FEATURE=all
LABEL_ARG=
IMPORT_FEATURES=" all accounts-and-bank-lines "

fence_failure() {
  printf '%s. Fix: %s.\n' "$1" "$2" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --feature)
      [ "$#" -ge 2 ] || fence_failure "The flag --feature needs a value" "pass one of all ${FEATURES[*]}"
      FEATURE=$2
      shift 2
      ;;
    --label)
      [ "$#" -ge 2 ] || fence_failure "The flag --label needs a value" "pass a short name for this run, for example \`--label all-after-fx-fix\`"
      LABEL_ARG=$2
      shift 2
      ;;
    --evidence-root)
      [ "$#" -ge 2 ] || fence_failure "The flag --evidence-root needs a value" "pass a directory the run may write into"
      EVIDENCE_ROOT=$2
      shift 2
      ;;
    --help)
      printf 'Usage: %s [--feature <%s|all>] [--label <name>] [--evidence-root <dir>]\n' "$0" "${FEATURES[*]}"
      exit 0
      ;;
    *)
      fence_failure "The argument $1 is not a flag this script knows" "run with \`--help\` for the accepted flags"
      ;;
  esac
done

if [ "$FEATURE" != all ]; then
  known=0
  for candidate in "${FEATURES[@]}"; do
    [ "$candidate" = "$FEATURE" ] && known=1
  done
  [ "$known" -eq 1 ] || fence_failure "The feature $FEATURE has no page in the feature map" "pass one of all ${FEATURES[*]}"
fi

LABEL=${LABEL_ARG:-$FEATURE}
if [ -n "$LABEL_ARG" ]; then
  LABEL_FLAG=" --label $LABEL_ARG"
else
  LABEL_FLAG=" --label $LABEL"
fi
RUN_DATE=$(date -u +%Y-%m-%d)
EVIDENCE_DIR="$EVIDENCE_ROOT/$RUN_DATE-$LABEL"
PROOF_PATH="$EVIDENCE_DIR/PROOF.md"

if [ -e "$PROOF_PATH" ]; then
  fence_failure "$PROOF_PATH already holds a proof" "pass \`--label <new-name>\` so this run does not overwrite evidence"
fi

command -v sqlite3 >/dev/null || fence_failure "sqlite3 is not on PATH" "install the sqlite3 command line tool and retry"
command -v jq >/dev/null || fence_failure "jq is not on PATH" "install jq and retry"
command -v pnpm >/dev/null || fence_failure "pnpm is not on PATH" "install Node 24.18.0 and pnpm 11.3.0, then run \`pnpm install --frozen-lockfile\`"

SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/pecunia-verify-XXXXXX")
DATABASE="$SCRATCH/demo.sqlite"
RESULTS="$SCRATCH/results.jsonl"
SEED_LOG="$SCRATCH/seed.log"
BUILD_LOG="$SCRATCH/build.log"
MAP_LOG="$SCRATCH/feature-map.log"
DRIVE_JSON="$SCRATCH/bank-import-drive.json"
BUILD_COMMAND="pnpm turbo run build --filter=@pecunia/bank-import..."
CHECKS=0
FAILURES=0
ACTIVE_FEATURE=all

cleanup() {
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

sql() {
  sqlite3 -json "$DATABASE" "$1"
}

value() {
  sql "$1" | jq -r '(.[0] // {}) | to_entries[0].value // ""'
}

check() {
  id=$1
  title=$2
  expected=$3
  actual=$4
  if [ "$actual" = "$expected" ]; then
    status=PASS
  else
    status=FAIL
    FAILURES=$((FAILURES + 1))
  fi
  CHECKS=$((CHECKS + 1))
  jq -n --arg id "$id" --arg title "$title" --arg feature "$ACTIVE_FEATURE" --arg status "$status" --arg expected "$expected" --arg actual "$actual" '{id: $id, title: $title, feature: $feature, passed: ($status == "PASS"), expected: $expected, actual: $actual}' >> "$RESULTS"
  printf '%s %s\n' "$status" "$id"
}

check_generic() {
  ACTIVE_FEATURE=all
  local wrong_declarations=0 wrong_storage=0 money_columns=0 currency_columns=0 wrong_currency=0
  local table name declaration rows

  while IFS= read -r table; do
    while IFS=$'\t' read -r name declaration; do
      money_columns=$((money_columns + 1))
      [ "$declaration" = INTEGER ] || wrong_declarations=$((wrong_declarations + 1))
      rows=$(value "SELECT COUNT(*) AS total FROM \"$table\" WHERE \"$name\" IS NOT NULL AND typeof(\"$name\") <> 'integer'")
      [ "$rows" = 0 ] || wrong_storage=$((wrong_storage + 1))
    done < <(sql "SELECT name, type FROM pragma_table_info('$table') WHERE name LIKE '%\\_minor' ESCAPE '\\'" | jq -r '.[] | [.name, .type] | @tsv')
  done < <(sql "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name" | jq -r '.[].name')

  check money-is-integer-minor-units "Money is an integer of minor units" "0 wrong declarations, 0 wrong rows, $money_columns columns" "$wrong_declarations wrong declarations, $wrong_storage wrong rows, $money_columns columns"

  while IFS= read -r table; do
    while IFS= read -r name; do
      currency_columns=$((currency_columns + 1))
      rows=$(value "SELECT COUNT(*) AS total FROM \"$table\" WHERE \"$name\" IS NOT NULL AND (typeof(\"$name\") <> 'text' OR \"$name\" NOT GLOB '[A-Z][A-Z][A-Z]')")
      [ "$rows" = 0 ] || wrong_currency=$((wrong_currency + 1))
    done < <(sql "SELECT name FROM pragma_table_info('$table') WHERE name = 'currency' OR name LIKE '%\\_currency' ESCAPE '\\'" | jq -r '.[].name')
  done < <(sql "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name" | jq -r '.[].name')

  check currency-is-an-iso-code "Every amount carries an ISO currency code" "0 wrong currencies, $currency_columns columns" "$wrong_currency wrong currencies, $currency_columns columns"

  local integrity foreign_keys missing_profile scoped_tables=0
  integrity=$(value "PRAGMA integrity_check")
  foreign_keys=$(value "SELECT COUNT(*) AS total FROM pragma_foreign_key_check")
  while IFS= read -r table; do
    has_profile=$(value "SELECT COUNT(*) AS total FROM pragma_table_info('$table') WHERE name = 'profile_id'")
    [ "$has_profile" = 1 ] || continue
    scoped_tables=$((scoped_tables + 1))
    rows=$(value "SELECT COUNT(*) AS total FROM \"$table\" WHERE profile_id NOT IN (SELECT id FROM profiles)")
    [ "$rows" = 0 ] || missing_profile=$((missing_profile + 1))
  done < <(sql "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name" | jq -r '.[].name')

  check every-row-belongs-to-a-profile "Every row belongs to a profile and every reference resolves" "ok, 0 foreign key violations, 0 tables with orphan rows, $scoped_tables scoped tables" "$integrity, $foreign_keys foreign key violations, ${missing_profile:-0} tables with orphan rows, $scoped_tables scoped tables"

  local emails names
  emails=$(value "SELECT COUNT(*) AS total FROM members WHERE email NOT LIKE '%@example.com'")
  names=$(value "SELECT group_concat(name, ',') AS names FROM (SELECT name FROM profiles ORDER BY name)")
  check demo-book-holds-made-up-identities "The demo book holds made-up identities only" "0 non-placeholder emails, Demo Person,Example Ltd" "$emails non-placeholder emails, $names"

  local map_line unnamed unexported planned mismatched
  if ! map_line=$(node "$SCRIPT_DIR/check-feature-map.mjs" 2> "$MAP_LOG"); then
    cat "$MAP_LOG" >&2
  fi
  read -r unnamed unexported planned mismatched <<< "$(printf '%s\n' "$map_line" | sed -E 's/^SUMMARY unnamed=([0-9]+) unexported=([0-9]+) planned=([0-9]+) status=([0-9]+).*/\1 \2 \3 \4/')"
  check feature-map-matches-capabilities "Every capability is on a feature page or declared not money" "0 unnamed, 0 unexported, 0 planned with a capability, 0 status mismatches" "${unnamed:-missing} unnamed, ${unexported:-missing} unexported, ${planned:-missing} planned with a capability, ${mismatched:-missing} status mismatches"
}

check_accounts_and_bank_lines() {
  ACTIVE_FEATURE=accounts-and-bank-lines
  local cross_profile duplicates labels runs written failed_tag rejects
  cross_profile=$(value "SELECT COUNT(*) AS total FROM transactions t JOIN provider_accounts a ON a.id = t.provider_account_id WHERE a.profile_id <> t.profile_id")
  duplicates=$(value "SELECT COUNT(*) AS total FROM (SELECT provider_account_id, external_id FROM transactions GROUP BY provider_account_id, external_id HAVING COUNT(*) > 1)")
  labels=$(value "SELECT group_concat(label || ' (' || kind || ')', ',') AS labels FROM (SELECT label, kind FROM provider_accounts ORDER BY label)")
  runs=$(value "SELECT COUNT(*) AS total FROM sync_runs")
  written=$(value "SELECT s.imported = COUNT(t.id) AS total FROM sync_runs s LEFT JOIN transactions t ON t.import_run_id = s.id WHERE s.state = 'succeeded' GROUP BY s.id")
  failed_tag=$(value "SELECT COUNT(*) AS total FROM sync_runs WHERE state = 'failed' AND (failure_tag IS NULL OR failure_tag = '')")
  rejects=$(value "SELECT s.rejected = COUNT(r.id) AS total FROM sync_runs s LEFT JOIN sync_run_rejections r ON r.run_id = s.id WHERE s.state = 'failed' GROUP BY s.id")

  check bank-lines-stay-in-their-account "Every bank line belongs to its account's profile" 0 "$cross_profile"
  check bank-lines-never-repeat "No bank line repeats inside one account" 0 "$duplicates"
  check demo-accounts "The demo book has a bank account and a broker account" "Demo Bank (bank),Demo Broker (investment)" "$labels"
  check demo-sync-runs "The demo book has one sync that succeeded and one that failed" 2 "$runs"
  check sync-import-count-matches-lines "The succeeded sync wrote the number of lines it reports" 1 "$written"
  check sync-failure-names-itself "The failed sync names its failure" 0 "$failed_tag"
  check sync-rejections-match-count "The failed sync quarantines the number of lines it reports" 1 "$rejects"

  local listed imported replayed broken unknown
  if ! node "$SCRIPT_DIR/drive-bank-import.mjs" --database "$DATABASE" > "$DRIVE_JSON"; then
    fence_failure "The bank import capability drive failed" "run `node skills/verify-pecunia/scripts/drive-bank-import.mjs --database <demo.sqlite>` and fix the failure it prints"
  fi
  listed=$(jq -r '[.listed[] | "\(.label) kind=\(.kind) base=\(.baseCurrency) provider=\(.providerLabel)"] | join("; ")' "$DRIVE_JSON")
  imported=$(jq -r '"imported=\(.imported.imported) alreadyImported=\(.imported.alreadyImported) rejected=\(.imported.rejected | length)"' "$DRIVE_JSON")
  replayed=$(jq -r '"imported=\(.replayed.imported) alreadyImported=\(.replayed.alreadyImported)"' "$DRIVE_JSON")
  broken=$(jq -r '"imported=\(.broken.imported) rejected=\(.broken.rejected | length) reason=\(.broken.rejected[0].reason)"' "$DRIVE_JSON")
  unknown=$(jq -r '.unknownAccount' "$DRIVE_JSON")

  check import-targets-listed "The demo book lists its bank account as an import target" "Demo Bank kind=bank base=EUR provider=Wise" "$listed"
  check import-writes-every-line "An import writes every line in the demo file" "imported=5 alreadyImported=0 rejected=0" "$imported"
  check import-replay-adds-nothing "A replay of the same file adds no rows" "imported=0 alreadyImported=5" "$replayed"
  check import-names-a-rejected-line "A broken line is rejected by name and kept out" "imported=1 rejected=1 reason=bad-date" "$broken"
  check import-refuses-unknown-account "An import refuses an account the profile does not hold" ImportAccountNotFound "$unknown"
}

check_categories_and_rules() {
  ACTIVE_FEATURE=categories-and-rules
  local wrong_category wrong_classification wrong_target wrong_alias swept
  wrong_category=$(value "SELECT COUNT(*) AS total FROM transactions t JOIN rules r ON r.id = t.applied_rule_id WHERE r.kind <> 'categorize' OR r.category_id IS NOT t.category_id")
  wrong_classification=$(value "SELECT COUNT(*) AS total FROM transactions t JOIN rules r ON r.id = t.classification_rule_id WHERE (CASE r.kind WHEN 'exclude' THEN 'excluded' WHEN 'income_client' THEN 'income' ELSE r.kind END) <> t.classification")
  wrong_target=$(value "SELECT COUNT(*) AS total FROM rules r LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN payees p ON p.id = r.client_payee_id WHERE (r.category_id IS NOT NULL AND c.profile_id <> r.profile_id) OR (r.client_payee_id IS NOT NULL AND p.profile_id <> r.profile_id)")
  wrong_alias=$(value "SELECT COUNT(*) AS total FROM merchant_aliases a JOIN payees p ON p.id = a.payee_id WHERE p.profile_id <> a.profile_id")
  swept=$(value "SELECT r.id || ' category-match=' || (t.category_id = r.category_id) || ' priority=' || r.priority || ' enabled=' || r.enabled AS swept FROM transactions t JOIN rules r ON r.id = t.applied_rule_id WHERE t.external_id = 'transaction-demo-02'")

  check applied-rule-sets-category "An applied rule set the line's category" 0 "$wrong_category"
  check classification-rule-sets-classification "A classification rule set the line's classification" 0 "$wrong_classification"
  check rule-targets-stay-in-profile "Rule targets stay inside their profile" 0 "$wrong_target"
  check merchant-aliases-stay-in-profile "Merchant aliases stay inside their profile" 0 "$wrong_alias"
  check demo-rule-sweeps-its-line "The demo Cloud rule swept the demo Cloud line" "0192f0c1-0015-727a-8b92-b929ac9448a7 category-match=1 priority=10 enabled=1" "$swept"
}

check_dashboard_sums() {
  ACTIVE_FEATURE=dashboard-sums
  local business spend income transfers excluded pending cloud software lines
  business=$(value "SELECT id AS id FROM profiles WHERE kind = 'business'")
  spend=$(value "SELECT COALESCE(SUM(base_minor), 0) AS total FROM transactions WHERE profile_id = '$business' AND status = 'posted' AND direction = 'out' AND classification = 'none'")
  income=$(value "SELECT COALESCE(SUM(base_minor), 0) AS total FROM transactions WHERE status = 'posted' AND classification = 'income'")
  transfers=$(value "SELECT COALESCE(SUM(base_minor), 0) AS total FROM transactions WHERE classification IN ('internal_transfer', 'self_transfer')")
  excluded=$(value "SELECT COALESCE(SUM(base_minor), 0) AS total FROM transactions WHERE classification = 'excluded'")
  pending=$(value "SELECT external_id AS pending FROM transactions WHERE status = 'pending'")
  cloud=$(value "SELECT COALESCE(SUM(t.base_minor), 0) AS total FROM transactions t JOIN categories c ON c.id = t.category_id WHERE c.name = 'Cloud' AND t.status = 'posted'")
  software=$(value "SELECT COALESCE(SUM(t.base_minor), 0) AS total FROM transactions t JOIN categories c ON c.id = t.category_id LEFT JOIN categories parent ON parent.id = c.parent_id WHERE (c.name = 'Software' OR parent.name = 'Software') AND t.status = 'posted' AND t.direction = 'out'")
  lines=$(value "SELECT group_concat(external_id, ',') AS lines FROM (SELECT external_id FROM transactions WHERE profile_id = '$business' AND status = 'posted' AND direction = 'out' AND classification = 'none' ORDER BY occurred_at)")

  check dashboard-spend "Posted spend over the demo business book" 328955 "$spend"
  check dashboard-spend-lines "Posted spend comes from the five promised lines" "transaction-demo-02,transaction-demo-03,transaction-demo-04,transaction-demo-05,transaction-demo-11" "$lines"
  check dashboard-income "Posted income is counted once" 480000 "$income"
  check dashboard-transfers "Internal and self transfers never count as spend" 160000 "$transfers"
  check dashboard-excluded "Excluded lines never count as spend" 1500 "$excluded"
  check dashboard-pending "A pending line is not posted spend" transaction-demo-12 "$pending"
  check dashboard-category "Posted Cloud total" 299000 "$cloud"
  check dashboard-parent-category "Software includes its Cloud child" 299000 "$software"
}

check_subscriptions() {
  ACTIVE_FEATURE=subscriptions
  local active missing cancelled annual
  active=$(value "SELECT COUNT(*) AS total FROM subscriptions WHERE status IN ('confirmed', 'detected')")
  missing=$(value "SELECT COUNT(*) AS total FROM subscriptions WHERE status IN ('confirmed', 'detected') AND frequency NOT IN ('weekly', 'monthly', 'quarterly', 'annual')")
  cancelled=$(value "SELECT COUNT(*) AS total FROM subscriptions WHERE status = 'cancelled'")
  annual=$(value "SELECT COALESCE(SUM(typical_base_minor * CASE frequency WHEN 'weekly' THEN 52 WHEN 'monthly' THEN 12 WHEN 'quarterly' THEN 4 WHEN 'annual' THEN 1 END), 0) AS total FROM subscriptions WHERE status IN ('confirmed', 'detected')")

  check subscriptions-have-a-frequency-rule "Every counted subscription has a frequency rule" 0 "$missing"
  check subscriptions-active "The demo book has one active subscription" 1 "$active"
  check subscriptions-annual-cost "The active subscription costs 358800 EUR minor units a year" 358800 "$annual"
  check subscriptions-cancelled "The cancelled demo subscription stays out" 1 "$cancelled"
}

check_investments() {
  ACTIVE_FEATURE=investments
  local priced pending known exact platforms
  priced=$(value "SELECT group_concat(name || ' value=' || (quantity_micros * last_price_minor / 1000000) || ' gain=' || (quantity_micros * last_price_minor / 1000000 - cost_basis_minor), '; ') AS priced FROM (SELECT * FROM holdings WHERE last_price_minor IS NOT NULL ORDER BY name)")
  pending=$(value "SELECT COUNT(*) AS total FROM holdings WHERE state = 'pending' AND last_price_minor IS NULL")
  known=$(value "SELECT COALESCE(SUM(quantity_micros * last_price_minor / 1000000), 0) AS total FROM holdings WHERE last_price_minor IS NOT NULL")
  exact=$(value "SELECT COALESCE(SUM((quantity_micros * last_price_minor) % 1000000), 0) AS total FROM holdings WHERE last_price_minor IS NOT NULL")
  platforms=$(value "SELECT COUNT(*) AS total FROM holdings h LEFT JOIN investment_platforms p ON p.id = h.platform_id WHERE p.id IS NULL")

  check holdings-value-math "Holding values come from integer quantity and price" "Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000" "$priced"
  check holdings-stay-whole-cents "Every priced holding value lands on a whole minor unit" 0 "$exact"
  check holdings-pending-unknown "A pending holding carries no price" 1 "$pending"
  check holdings-known-value "Known portfolio value leaves the pending holding out" 788640000 "$known"
  check holdings-platforms "Every holding's platform exists" 0 "$platforms"
}

check_fx_conversion() {
  ACTIVE_FEATURE=fx-conversion
  local conversions rounding same_currency months
  conversions=$(value "SELECT group_concat(external_id || ' ' || source_minor || ' ' || source_currency || ' -> ' || base_minor || ' ' || base_currency || ' at ' || rate, '; ') AS conversions FROM (SELECT * FROM transactions WHERE source_currency <> base_currency ORDER BY occurred_at)")
  rounding=$(value "SELECT COUNT(*) AS total FROM transactions WHERE source_currency <> base_currency AND abs(base_minor - round(source_minor * rate)) > 0")
  same_currency=$(value "SELECT COUNT(*) AS total FROM transactions WHERE source_currency = base_currency AND (source_minor <> base_minor OR rate IS NOT NULL)")
  months=$(value "SELECT COUNT(*) AS total FROM transactions t WHERE t.source_currency <> t.base_currency AND NOT EXISTS (SELECT 1 FROM exchange_rates e WHERE e.as_of = substr(t.rate_as_of, 1, 7) || '-01' AND ((e.base_currency = t.source_currency AND e.quote_currency = t.base_currency) OR (e.base_currency = t.base_currency AND e.quote_currency = t.source_currency)))")

  check conversion-rounds-exactly "Base amounts round from source times rate" 0 "$rounding"
  check conversion-keeps-same-currency "Same-currency lines keep their amount and carry no rate" 0 "$same_currency"
  check conversion-has-a-monthly-rate "Every foreign line has a monthly rate row" 0 "$months"
  check conversion-recorded-lines "The demo book records both foreign lines" "transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17" "$conversions"
}

check_tax() {
  ACTIVE_FEATURE=tax
  local settlement orphans paid unpaid tax_year
  settlement=$(value "SELECT COUNT(*) AS total FROM tax_obligations o JOIN transactions t ON t.id = o.settled_transaction_id WHERE o.status = 'paid' AND (o.amount_minor <> t.base_minor OR o.amount_currency <> t.base_currency OR t.classification <> 'tax_payment')")
  orphans=$(value "SELECT COUNT(*) AS total FROM tax_obligations WHERE status <> 'paid' AND settled_transaction_id IS NOT NULL")
  paid=$(value "SELECT COALESCE(SUM(amount_minor), 0) AS total FROM tax_obligations WHERE status = 'paid'")
  unpaid=$(value "SELECT COALESCE(SUM(amount_minor), 0) AS total FROM tax_obligations WHERE status <> 'paid'")
  tax_year=$(value "SELECT jurisdiction || ' ' || year_start_month || '-' || year_start_day AS tax_year FROM tax_profiles")

  check tax-settles-once "A paid obligation is settled by a tax payment of the same amount" 0 "$settlement"
  check tax-unpaid-has-no-settlement "An unpaid obligation carries no settlement" 0 "$orphans"
  check tax-paid-total "Paid tax total" 250000 "$paid"
  check tax-unpaid-total "Unpaid tax total" 312500 "$unpaid"
  check tax-year "The demo tax year starts on 6 April" "GB 4-6" "$tax_year"
}

check_invoices() {
  ACTIVE_FEATURE=invoices
  local wrong_amount exception unarchived archived vendors
  wrong_amount=$(value "SELECT COUNT(*) AS total FROM invoice_documents d JOIN transactions t ON t.id = d.transaction_id WHERE d.amount_minor <> t.base_minor OR d.amount_currency <> t.base_currency")
  exception=$(value "SELECT t.base_minor || ' documents=' || (SELECT COUNT(*) FROM invoice_documents d WHERE d.transaction_id = e.transaction_id) AS detail FROM invoice_exceptions e JOIN transactions t ON t.id = e.transaction_id")
  unarchived=$(value "SELECT COUNT(*) AS total FROM invoice_documents WHERE archive_state = 'unarchived' AND (archive_target_id IS NOT NULL OR archive_file_id IS NOT NULL OR archived_at IS NOT NULL)")
  archived=$(value "SELECT COUNT(*) AS total FROM invoice_documents WHERE archive_state = 'archived' AND (archive_target_id IS NULL OR archive_file_id IS NULL OR archived_at IS NULL)")
  vendors=$(value "SELECT COUNT(*) AS total FROM invoice_documents d JOIN payees p ON p.id = d.vendor_payee_id WHERE p.profile_id <> d.profile_id")
  archive_states=$(value "SELECT COUNT(*) AS total FROM invoice_documents WHERE archive_state NOT IN ('unarchived', 'reserved', 'archived', 'failed') OR (archive_state = 'unarchived' AND (archive_file_id IS NOT NULL OR archive_target_id IS NOT NULL OR archived_at IS NOT NULL OR archive_failure_reason IS NOT NULL)) OR (archive_state = 'reserved' AND (archive_file_id IS NULL OR archive_target_id IS NULL OR archived_at IS NOT NULL OR archive_failure_reason IS NOT NULL)) OR (archive_state = 'archived' AND (archive_file_id IS NULL OR archive_target_id IS NULL OR archived_at IS NULL OR archive_failure_reason IS NOT NULL)) OR (archive_state = 'failed' AND (archive_failure_reason IS NULL OR archive_failure_reason = '' OR archive_file_id IS NOT NULL OR archive_target_id IS NOT NULL OR archived_at IS NOT NULL))")

  check invoice-matches-its-line "A linked invoice matches its transaction exactly" 0 "$wrong_amount"
  check invoice-exception-has-no-document "An exception names a transaction with no document" "4250 documents=0" "$exception"
  check invoice-unarchived "An unarchived document names no archive" 0 "$unarchived"
  check invoice-archived "An archived document names a target" 0 "$archived"
  check invoice-vendors "Every invoice vendor belongs to the profile" 0 "$vendors"
  check invoice-archive-states "Every archive state carries the columns it promises" 0 "$archive_states"
}

printf 'Seeding the demo book into %s\n' "$DATABASE"
if ! pnpm --filter @pecunia/database db:seed:demo "$DATABASE" > "$SEED_LOG" 2>&1; then
  cat "$SEED_LOG" >&2
  fence_failure "The demo seed failed" "run \`pnpm --filter @pecunia/database db:seed:demo /tmp/demo.sqlite\` and fix the failure it prints"
fi

SEED_COMMAND="pnpm --filter @pecunia/database db:seed:demo $DATABASE"
SEED_ROWS=$(grep -E ': [0-9]+ rows$' "$SEED_LOG" | sed -E 's/^.*INFO \([^)]*\): //' || true)
DEMO_SHA=$(sha256sum "$DATABASE" | cut -d' ' -f1)
BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
COMMIT=$(git -C "$REPO_ROOT" rev-parse --short HEAD)

case "$IMPORT_FEATURES" in
  *" $FEATURE "*)
    if ! pnpm turbo run build --filter=@pecunia/bank-import... > "$BUILD_LOG" 2>&1; then
      cat "$BUILD_LOG" >&2
      fence_failure "The bank import packages did not build" "run `$BUILD_COMMAND` and fix the failure it prints"
    fi
    ;;
esac

check_generic
if [ "$FEATURE" = all ]; then
  check_accounts_and_bank_lines
  check_categories_and_rules
  check_dashboard_sums
  check_subscriptions
  check_investments
  check_fx_conversion
  check_tax
  check_invoices
else
  "check_${FEATURE//-/_}"
fi

mkdir -p "$EVIDENCE_DIR"
if [ -s "$DRIVE_JSON" ]; then
  cp "$DRIVE_JSON" "$EVIDENCE_DIR/bank-import-drive.json"
fi

{
  printf '# Verification proof: %s\n\n' "$FEATURE"
  printf -- '- Run label: `%s`\n' "$LABEL"
  printf -- '- Run at: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf -- '- Branch: `%s` at `%s`\n' "$BRANCH" "$COMMIT"
  printf -- '- Node: `%s`\n' "$(node --version)"
  printf -- '- Demo seed: `%s`\n' "$SEED_COMMAND"
  printf -- '- Demo book SHA-256: `%s`\n' "$DEMO_SHA"
  printf -- '- The scratch database is deleted after the run; `proof.json` holds every observation.\n\n' "$DEMO_SHA"
  printf '## Commands\n\n```sh\n'
  case "$IMPORT_FEATURES" in
    *" $FEATURE "*) printf '%s\n' "$BUILD_COMMAND" ;;
  esac
  printf '%s\n' "$SEED_COMMAND"
  printf 'bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature %s%s\n' "$FEATURE" "$LABEL_FLAG"
  printf '```\n\n'
  printf '## Seeded tables\n\n```text\n%s\n```\n\n' "$SEED_ROWS"
printf '## Checks\n\n| Check | Result | Expected | Observed |\n| --- | --- | --- | --- |\n'
  jq -r '"| `\(.id)` \(.title) | \(if .passed then "PASS" else "FAIL" end) | `\(.expected)` | `\(.actual)` |"' "$RESULTS"
  if [ -s "$DRIVE_JSON" ]; then
    printf '\n## Bank import drive\n\n`bank-import-drive.json` holds the capability drive: the listed import targets, the first import, the replay, the rejected line, and the refusal for an unknown account.\n'
  fi
  printf '\n## Verdict\n\n'
  if [ "$FAILURES" -eq 0 ]; then
    printf 'PASS: %s checks held against the seeded demo book.\n' "$CHECKS"
  else
    printf 'FAIL: %s of %s checks failed.\n' "$FAILURES" "$CHECKS"
  fi
  printf '\n## What this proves\n\n'
  printf -- '- The migrations and the demo seed fill a real SQLite database with the demo book.\n'
  printf -- '- Every money value read back is an integer of minor units with an ISO currency code.\n'
  printf -- '- The money promises named by the checks hold for the demo data, each asserted against a stated expected value.\n'
  if [ -s "$DRIVE_JSON" ]; then
    printf -- '- `listImportTargets` lists the demo bank account and `importBankFile` writes five lines, writes none on a replay, names a rejected line, and refuses an unknown account.\n'
  fi
  printf -- '- Every capability implemented in the packages and apps is on a feature page or in the not-money table, and no page marks a feature planned while its capability exists.\n\n'
  printf '## What this does not prove\n\n'
  if [ -s "$DRIVE_JSON" ]; then
    printf -- '- The import capability runs on the package memory ledger against the seeded demo book; a persistent import store and the RPC, MCP, and CLI projections are not exercised.\n'
    printf -- '- The other money features still have no user surface, so their checks read the demo book at the data layer.\n'
  else
    printf -- '- No finance screen, capability, CLI command, or MCP tool reaches this feature, so this run drives the demo book at the data layer.\n'
    printf -- '- A green run does not prove a new capability reads the same rows the same way; the pull request that adds the surface still needs its own proof.\n'
  fi
} > "$PROOF_PATH"

jq -n --arg feature "$FEATURE" --arg branch "$BRANCH" --arg commit "$COMMIT" --arg node_version "$(node --version)" --arg demo_sha "$DEMO_SHA" --arg seed_command "$SEED_COMMAND" --arg ran_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson failures "$FAILURES" --argjson checks_count "$CHECKS" --slurpfile checks "$RESULTS" '{feature: $feature, branch: $branch, commit: $commit, node: $node_version, ranAt: $ran_at, seed: {command: $seed_command}, demoBookSha256: $demo_sha, passed: ($failures == 0), failed: $failures, total: $checks_count, checks: $checks}' > "$EVIDENCE_DIR/proof.json"

printf '\n%s checks, %s failed.\nProof: %s\n' "$CHECKS" "$FAILURES" "$PROOF_PATH"

[ "$FAILURES" -eq 0 ]
