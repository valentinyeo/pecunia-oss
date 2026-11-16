#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
VERDICT="$SCRIPT_DIR/verdict.mjs"
TABLE="$SCRIPT_DIR/step-table.json"
FEATURES_DIR="$SCRIPT_DIR/../features"
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
EVIDENCE_ROOT="$REPO_ROOT/skills/verify-pecunia/evidence"
source "$SCRIPT_DIR/lib/steps.sh"

mapfile -t FEATURES < <(node "$VERDICT" features)
FEATURE=all
LABEL_ARG=
LIST_STEPS=0

fence_failure() {
  printf '%s. Fix: %s.\n' "$1" "$2" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --feature)
      [ "$#" -ge 2 ] || fence_failure "The flag --feature needs a value" "pass one of ${FEATURES[*]}"
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
    --list-steps)
      LIST_STEPS=1
      shift
      ;;
    --help)
      printf 'Usage: %s [--feature <%s>] [--label <name>] [--evidence-root <dir>] [--list-steps]\n' "$0" "$(printf '%s|' "${FEATURES[@]}" | sed 's/|$//')"
      exit 0
      ;;
    *)
      fence_failure "The argument $1 is not a flag this script knows" "run with \`--help\` for the accepted flags"
      ;;
  esac
done

known=0
for candidate in "${FEATURES[@]}"; do
  [ "$candidate" = "$FEATURE" ] && known=1
done
[ "$known" -eq 1 ] || fence_failure "The feature $FEATURE has no page in the feature map" "pass one of ${FEATURES[*]}"

if [ "$LIST_STEPS" -eq 1 ]; then
  node "$VERDICT" list --feature "$FEATURE"
  exit 0
fi

LABEL=${LABEL_ARG:-$FEATURE}
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
SEED_LOG="$SCRATCH/seed.log"
BUILD_LOG="$SCRATCH/build.log"
MAP_LOG="$SCRATCH/feature-map.log"
DRIVE_JSON="$SCRATCH/bank-import-drive.json"
BUILD_COMMAND="pnpm turbo run build --filter=@pecunia/bank-import..."
BUILD_LINES_COMMAND="pnpm turbo run build --filter=@pecunia/bank-lines..."
SEED_COMMAND="pnpm --filter @pecunia/database db:seed:demo $DATABASE"
cleanup() {
  rm -rf "$SCRATCH"
}
trap cleanup EXIT

steps_init "$SCRATCH/steps" "$FEATURE"
steps_meta branch "$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
steps_meta commit "$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
steps_meta node "$(node --version)"
steps_meta seedCommand "$SEED_COMMAND"
steps_meta buildCommand "$BUILD_COMMAND"
steps_meta buildLinesCommand "$BUILD_LINES_COMMAND"

sql() {
  sqlite3 -json "$DATABASE" "$1"
}

value() {
  sql "$1" | jq -r '(.[0] // {}) | to_entries[0].value // ""'
}

step_seed() {
  printf 'Seeding the demo book into %s\n' "$DATABASE"
  steps_run_command seed pnpm --filter @pecunia/database db:seed:demo "$DATABASE" > "$SEED_LOG" 2>&1
  if [ "$(steps_command_exit seed)" != 0 ]; then
    cat "$SEED_LOG" >&2
  fi
  steps_require_file seed-log "$SEED_LOG"
  steps_require_file demo-book "$DATABASE"
}

step_build() {
  steps_run_command build-import pnpm turbo run build --filter=@pecunia/bank-import... > "$BUILD_LOG" 2>&1
  steps_run_command build-lines pnpm turbo run build --filter=@pecunia/bank-lines... >> "$BUILD_LOG" 2>&1
  if [ "$(steps_command_exit build-import)" != 0 ] || [ "$(steps_command_exit build-lines)" != 0 ]; then
    cat "$BUILD_LOG" >&2
  fi
  steps_require_file build-log "$BUILD_LOG"
}

step_feature_map() {
  local map_line unnamed unexported planned mismatched problems exit_status
  map_line=$(steps_run_command map node "$SCRIPT_DIR/check-feature-map.mjs" 2> "$MAP_LOG")
  if [ -s "$MAP_LOG" ]; then
    cat "$MAP_LOG" >&2
  fi
  read -r unnamed unexported planned mismatched <<< "$(printf '%s\n' "$map_line" | sed -E 's/^SUMMARY unnamed=([0-9]+) unexported=([0-9]+) planned=([0-9]+) status=([0-9]+).*/\1 \2 \3 \4/')"
  check feature-map-matches-capabilities "Every capability is on a feature page or declared not money" "0 unnamed, 0 unexported, 0 planned with a capability, 0 status mismatches" "${unnamed:-missing} unnamed, ${unexported:-missing} unexported, ${planned:-missing} planned with a capability, ${mismatched:-missing} status mismatches"
  problems=$(printf '%s\n' "$map_line" | sed -E 's/^SUMMARY .* problems=([0-9]+).*/\1/')
  exit_status=$(steps_command_exit map)
  check feature-map-reports-no-problems "The map check counts every problem it prints and exits non-zero for each" "problems=0 exit=0" "problems=${problems:-missing} exit=${exit_status:-missing}"
}

step_generic() {
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
}

step_accounts_and_bank_lines() {
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
  steps_run_command bank-import node "$SCRIPT_DIR/drive-bank-import.mjs" --database "$DATABASE" > "$DRIVE_JSON"
  steps_keep_artifact bank-import-drive.json "$DRIVE_JSON"
  if [ ! -s "$DRIVE_JSON" ]; then
    check import-drive-writes-observations "The bank import drive writes its observations" "observations" "none"
    return 0
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

step_bank_line_list() {
  local drive=$SCRATCH/bank-line-list-drive.json
  steps_run_command bank-line-list node "$SCRIPT_DIR/drive-bank-lines.mjs" --capability list > "$drive"
  steps_keep_artifact bank-line-list-drive.json "$drive"
  if [ ! -s "$drive" ]; then
    check bank-line-list-drive-writes-observations "The listing drive writes its observations" "observations" "none"
    return 0
  fi

  local total demo awaiting ordered filtered filtered_out page_one page_two overlap
  total=$(jq -r '.total' "$drive")
  demo=$(jq -r '.demoLines' "$drive")
  awaiting=$(jq -r '.awaiting' "$drive")
  ordered=$(jq -r '.ordered' "$drive")
  filtered=$(jq -r '.filtered.count' "$drive")
  filtered_out=$(jq -r '.filtered.allOut' "$drive")
  page_one=$(jq -r '.pages.first' "$drive")
  page_two=$(jq -r '.pages.second' "$drive")
  overlap=$(jq -r '.pages.overlap' "$drive")

  check bank-line-list-returns-the-demo-book "The listing capability returns every demo line" "$demo lines from $demo demo lines, 2 awaiting review" "$total lines from $demo demo lines, $awaiting awaiting review"
  check bank-line-list-orders-newest-first "The listing capability orders lines newest first" "newest first" "$ordered"
  check bank-line-list-filters-by-direction "A direction filter returns only lines in that direction" "out only, every filtered line is out, 8 lines" "out only, every filtered line is out, $filtered lines"
  check bank-line-list-pages-without-repeats "Keyset paging never repeats a line" "5 + 5 lines, 0 repeats" "$page_one + $page_two lines, $overlap repeats"
}

step_bank_line_edit() {
  local drive=$SCRATCH/bank-line-edit-drive.json
  steps_run_command bank-line-edit node "$SCRIPT_DIR/drive-bank-lines.mjs" --capability edit > "$drive"
  steps_keep_artifact bank-line-edit-drive.json "$drive"
  if [ ! -s "$drive" ]; then
    check bank-line-edit-drive-writes-observations "The edit drive writes its observations" "observations" "none"
    return 0
  fi

  local category note kept unknown_line unknown_category
  category=$(jq -r '.edited.category' "$drive")
  note=$(jq -r '.edited.note' "$drive")
  kept=$(jq -r '.edited.profileKept' "$drive")
  unknown_line=$(jq -r '.unknownLine' "$drive")
  unknown_category=$(jq -r '.unknownCategory' "$drive")

  check bank-line-edit-sets-category-and-note "The edit capability writes the category and the note" "category set, note set" "$category, $note"
  check bank-line-edit-keeps-the-line-in-its-profile "The edit returns the same line in the same profile" "true" "$kept"
  check bank-line-edit-refuses-an-unknown-line "An edit of a missing line is refused by name" UnknownBankLine "$unknown_line"
  check bank-line-edit-refuses-a-foreign-category "An edit to a category outside the profile is refused by name" UnknownCategory "$unknown_category"
}

step_bank_line_review() {
  local drive=$SCRATCH/bank-line-review-drive.json
  steps_run_command bank-line-review node "$SCRIPT_DIR/drive-bank-lines.mjs" --capability review > "$drive"
  steps_keep_artifact bank-line-review-drive.json "$drive"
  if [ ! -s "$drive" ]; then
    check bank-line-review-drive-writes-observations "The review drive writes its observations" "observations" "none"
    return 0
  fi

  local tag at listed viewer
  tag=$(jq -r '.reviewed.tag' "$drive")
  at=$(jq -r '.reviewed.at' "$drive")
  listed=$(jq -r '.reviewed.listed' "$drive")
  viewer=$(jq -r '.viewer' "$drive")

  check bank-line-review-marks-the-line "The review capability marks the line reviewed" "Reviewed at a recorded time" "$tag at $at"
  check bank-line-review-shows-in-the-list "The reviewed line reads back from the listing capability" Reviewed "$listed"
  check bank-line-review-refuses-a-viewer "A read-only member cannot review a line" Forbidden "$viewer"
}

step_categories_and_rules() {
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

step_dashboard_sums() {
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

step_subscriptions() {
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

step_investments() {
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

step_fx_conversion() {
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

step_tax() {
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

step_invoices() {
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

mapfile -t PLANNED < <(node "$VERDICT" plan --feature "$FEATURE")

for planned_step in "${PLANNED[@]}"; do
  steps_run_step "$planned_step"
  if [ "$planned_step" = seed ]; then
    steps_meta demoBookSha256 "$(sha256sum "$DATABASE" 2>/dev/null | cut -d' ' -f1 || true)"
    steps_meta seedRows "$(grep -E ': [0-9]+ rows$' "$SEED_LOG" | sed -E 's/^.*INFO \([^)]*\): //' || true)"
  fi
done

VERDICT_STATUS=0
node "$VERDICT" check --feature "$FEATURE" --label "$LABEL" --records "$STEPS_RECORDS" --evidence "$EVIDENCE_DIR" --table "$TABLE" --features "$FEATURES_DIR" --ran-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" || VERDICT_STATUS=$?
exit "$VERDICT_STATUS"
