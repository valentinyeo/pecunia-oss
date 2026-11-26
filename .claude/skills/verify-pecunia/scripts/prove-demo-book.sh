#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
VERDICT="$SCRIPT_DIR/verdict.mjs"
TABLE="$SCRIPT_DIR/step-table.json"
FEATURES_DIR="$SCRIPT_DIR/../features"
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../../../.." && pwd)
EVIDENCE_ROOT="$REPO_ROOT/.claude/skills/verify-pecunia/evidence"
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
PARITY_LOG="$SCRATCH/parity.log"
DRIVE_JSON="$SCRATCH/bank-import-drive.json"
BUILD_COMMAND="pnpm turbo run build --filter=@pecunia/bank-import..."
BUILD_LINES_COMMAND="pnpm turbo run build --filter=@pecunia/bank-lines..."
SEED_COMMAND="pnpm --filter @pecunia/database db:seed:demo $DATABASE"
WEB_LOG="$SCRATCH/web-server.log"
WEB_PID=
WEB_PORT=
WEB_BASE_URL=
cleanup() {
  stop_web_server
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
  steps_run_command build-ai-tools pnpm turbo run build --filter=@pecunia/ai-tools... >> "$BUILD_LOG" 2>&1
  if [ "$(steps_command_exit build-import)" != 0 ] || [ "$(steps_command_exit build-lines)" != 0 ] || [ "$(steps_command_exit build-ai-tools)" != 0 ]; then
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
  problems=$(printf '%s\n' "$map_line" | sed -E 's/^SUMMARY .* problems=([0-9]+).*/\1/')
  exit_status=$(steps_command_exit map)
  steps_observe feature-map-matches-capabilities "unnamed=${unnamed:-missing} unexported=${unexported:-missing} planned=${planned:-missing} status=${mismatched:-missing} problems=${problems:-missing} exit=${exit_status:-missing}"
}

step_parity() {
  local parity_line problems exit_status
  parity_line=$(steps_run_command parity node "$SCRIPT_DIR/check-parity.mjs" 2> "$PARITY_LOG")
  if [ -s "$PARITY_LOG" ]; then
    cat "$PARITY_LOG" >&2
  fi
  problems=$(printf '%s\n' "$parity_line" | sed -E 's/^SUMMARY .* problems=([0-9]+).*/\1/')
  exit_status=$(steps_command_exit parity)
  steps_observe parity-matches-old-behaviours "problems=${problems:-missing} exit=${exit_status:-missing}"
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

  steps_observe money-is-integer-minor-units "wrongDeclarations=$wrong_declarations wrongRows=$wrong_storage columns=$money_columns"

  while IFS= read -r table; do
    while IFS= read -r name; do
      currency_columns=$((currency_columns + 1))
      rows=$(value "SELECT COUNT(*) AS total FROM \"$table\" WHERE \"$name\" IS NOT NULL AND (typeof(\"$name\") <> 'text' OR \"$name\" NOT GLOB '[A-Z][A-Z][A-Z]')")
      [ "$rows" = 0 ] || wrong_currency=$((wrong_currency + 1))
    done < <(sql "SELECT name FROM pragma_table_info('$table') WHERE name = 'currency' OR name LIKE '%\\_currency' ESCAPE '\\'" | jq -r '.[].name')
  done < <(sql "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name" | jq -r '.[].name')

  steps_observe currency-is-an-iso-code "wrongCurrencies=$wrong_currency columns=$currency_columns"

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

  steps_observe every-row-belongs-to-a-profile "integrity=$integrity foreignKeyViolations=$foreign_keys tablesWithOrphans=${missing_profile:-0} scopedTables=$scoped_tables"

  local emails names
  emails=$(value "SELECT COUNT(*) AS total FROM members WHERE email NOT LIKE '%@example.com'")
  names=$(value "SELECT group_concat(name, ',') AS names FROM (SELECT name FROM profiles ORDER BY name)")
  steps_observe demo-book-holds-made-up-identities "nonPlaceholderEmails=$emails profiles=$names"
}

step_accounts_and_bank_lines() {
  local cross_profile duplicates labels runs written failed_tag rejects
  cross_profile=$(value "SELECT COUNT(*) AS total FROM transactions t JOIN provider_accounts a ON a.id = t.provider_account_id WHERE a.profile_id <> t.profile_id")
  duplicates=$(value "SELECT COUNT(*) AS total FROM (SELECT provider_account_id, external_id FROM transactions GROUP BY provider_account_id, external_id HAVING COUNT(*) > 1)")
  labels=$(value "SELECT group_concat(label || ' (' || kind || ')', ',') AS labels FROM (SELECT label, kind FROM provider_accounts ORDER BY label)")
  runs=$(value "SELECT COUNT(*) AS total FROM sync_runs")
  written=$(value "SELECT CASE WHEN s.imported = COUNT(t.id) THEN 'true' ELSE 'false' END AS ok FROM sync_runs s LEFT JOIN transactions t ON t.import_run_id = s.id WHERE s.state = 'succeeded' GROUP BY s.id")
  failed_tag=$(value "SELECT COUNT(*) AS total FROM sync_runs WHERE state = 'failed' AND (failure_tag IS NULL OR failure_tag = '')")
  rejects=$(value "SELECT CASE WHEN s.rejected = COUNT(r.id) THEN 'true' ELSE 'false' END AS ok FROM sync_runs s LEFT JOIN sync_run_rejections r ON r.run_id = s.id WHERE s.state = 'failed' GROUP BY s.id")

  steps_observe bank-lines-stay-in-their-account "$cross_profile"
  steps_observe bank-lines-never-repeat "$duplicates"
  steps_observe demo-accounts "$labels"
  steps_observe demo-sync-runs "$runs"
  steps_observe sync-import-count-matches-lines "$written"
  steps_observe sync-failure-names-itself "$failed_tag"
  steps_observe sync-rejections-match-count "$rejects"

  steps_run_command bank-import node "$SCRIPT_DIR/drive-bank-import.mjs" --database "$DATABASE" > "$DRIVE_JSON"
  steps_keep_artifact bank-import-drive.json "$DRIVE_JSON"
  steps_count_mutations "$(jq -r '.mutatingCalls // 0' "$DRIVE_JSON" 2>/dev/null || printf '0')"
  steps_observe_json "$DRIVE_JSON"
}

step_bank_line_list() {
  local drive=$SCRATCH/bank-line-list-drive.json
  steps_run_command bank-line-list node "$SCRIPT_DIR/drive-bank-lines.mjs" --capability list > "$drive"
  steps_keep_artifact bank-line-list-drive.json "$drive"
  steps_observe_json "$drive"
}

step_bank_line_edit() {
  local drive=$SCRATCH/bank-line-edit-drive.json
  steps_run_command bank-line-edit node "$SCRIPT_DIR/drive-bank-lines.mjs" --capability edit > "$drive"
  steps_keep_artifact bank-line-edit-drive.json "$drive"
  steps_count_mutations "$(jq -r '.mutatingCalls // 0' "$drive" 2>/dev/null || printf '0')"
  steps_observe_json "$drive"
}

step_bank_line_review() {
  local drive=$SCRATCH/bank-line-review-drive.json
  steps_run_command bank-line-review node "$SCRIPT_DIR/drive-bank-lines.mjs" --capability review > "$drive"
  steps_keep_artifact bank-line-review-drive.json "$drive"
  steps_count_mutations "$(jq -r '.mutatingCalls // 0' "$drive" 2>/dev/null || printf '0')"
  steps_observe_json "$drive"
}

step_ai_tools() {
  local drive=$SCRATCH/ai-tools-drive.json
  steps_run_command ai-tools node "$SCRIPT_DIR/drive-ai-tools.mjs" > "$drive"
  steps_keep_artifact ai-tools-drive.json "$drive"
  steps_count_mutations "$(jq -r '.mutatingCalls // 0' "$drive" 2>/dev/null || printf '0')"
  steps_observe_json "$drive"
}

stop_web_server() {
  if [ -n "$WEB_PID" ]; then
    kill -TERM "-$WEB_PID" 2>/dev/null || kill -TERM "$WEB_PID" 2>/dev/null || true
    WEB_PID=
  fi
}

free_web_port() {
  node -e 'const { createServer } = require("node:net"); const server = createServer(); server.listen(0, "127.0.0.1", () => { process.stdout.write(String(server.address().port)); server.close(); });'
}

ensure_web_server() {
  WEB_PORT=$(free_web_port)
  WEB_BASE_URL="http://127.0.0.1:$WEB_PORT"
  printf 'Serving the web app on %s\n' "$WEB_BASE_URL" >> "$WEB_LOG"
  (
    cd "$REPO_ROOT/apps/web" || exit 1
    setsid pnpm exec vite dev --host 127.0.0.1 --port "$WEB_PORT" --strictPort >> "$WEB_LOG" 2>&1 < /dev/null &
    printf '%s\n' "$!" > "$SCRATCH/web.pid"
  )
  WEB_PID=$(cat "$SCRATCH/web.pid" 2>/dev/null || true)
  local attempt=0
  while [ "$attempt" -lt 90 ]; do
    if curl -fsS -o /dev/null "$WEB_BASE_URL/app" 2>/dev/null; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  return 1
}

run_web_screen() {
  local screen=$1 drive=$SCRATCH/web-$1.json shot=$SCRATCH/web-$1.png
  steps_run_command "web-$screen" node "$SCRIPT_DIR/drive-web-screen.mjs" --screen "$screen" --base-url "$WEB_BASE_URL" --screenshot "$shot" > "$drive"
  steps_keep_artifact "web-$screen.png" "$shot"
  steps_observe_json "$drive"
}

step_web_server() {
  steps_run_command web-build pnpm turbo run build --filter=@pecunia/web... >> "$WEB_LOG" 2>&1
  if [ "$(steps_command_exit web-build)" != 0 ]; then
    cat "$WEB_LOG" >&2
  fi
  steps_run_command web-serve ensure_web_server
  if [ "$(steps_command_exit web-serve)" != 0 ]; then
    cat "$WEB_LOG" >&2
  fi
  steps_require_file web-server-log "$WEB_LOG"
}

step_web_dashboard() {
  run_web_screen dashboard
}

step_web_transactions() {
  run_web_screen transactions
}

step_web_categories() {
  run_web_screen categories
}

step_web_rules() {
  run_web_screen rules
}

step_web_aliases() {
  run_web_screen aliases
}

step_web_merchants() {
  run_web_screen merchants
}

step_web_review() {
  run_web_screen review
}

step_web_search() {
  run_web_screen search
}

step_web_budgets() {
  run_web_screen budgets
}

step_web_subscriptions() {
  run_web_screen subscriptions
}

step_web_investments() {
  run_web_screen investments
}

step_web_settings() {
  run_web_screen settings
}

step_categories_and_rules() {
  local wrong_category wrong_classification wrong_target wrong_alias swept
  wrong_category=$(value "SELECT COUNT(*) AS total FROM transactions t JOIN rules r ON r.id = t.applied_rule_id WHERE r.kind <> 'categorize' OR r.category_id IS NOT t.category_id")
  wrong_classification=$(value "SELECT COUNT(*) AS total FROM transactions t JOIN rules r ON r.id = t.classification_rule_id WHERE (CASE r.kind WHEN 'exclude' THEN 'excluded' WHEN 'income_client' THEN 'income' ELSE r.kind END) <> t.classification")
  wrong_target=$(value "SELECT COUNT(*) AS total FROM rules r LEFT JOIN categories c ON c.id = r.category_id LEFT JOIN payees p ON p.id = r.client_payee_id WHERE (r.category_id IS NOT NULL AND c.profile_id <> r.profile_id) OR (r.client_payee_id IS NOT NULL AND p.profile_id <> r.profile_id)")
  wrong_alias=$(value "SELECT COUNT(*) AS total FROM merchant_aliases a JOIN payees p ON p.id = a.payee_id WHERE p.profile_id <> a.profile_id")
  swept=$(value "SELECT r.id || ' category-match=' || (t.category_id = r.category_id) || ' priority=' || r.priority || ' enabled=' || r.enabled AS swept FROM transactions t JOIN rules r ON r.id = t.applied_rule_id WHERE t.external_id = 'transaction-demo-02'")

  steps_observe applied-rule-sets-category "$wrong_category"
  steps_observe classification-rule-sets-classification "$wrong_classification"
  steps_observe rule-targets-stay-in-profile "$wrong_target"
  steps_observe merchant-aliases-stay-in-profile "$wrong_alias"
  steps_observe demo-rule-sweeps-its-line "$swept"
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

  steps_observe dashboard-spend "$spend"
  steps_observe dashboard-spend-lines "$lines"
  steps_observe dashboard-income "$income"
  steps_observe dashboard-transfers "$transfers"
  steps_observe dashboard-excluded "$excluded"
  steps_observe dashboard-pending "$pending"
  steps_observe dashboard-category "$cloud"
  steps_observe dashboard-parent-category "$software"
}

step_subscriptions() {
  local active missing cancelled annual
  active=$(value "SELECT COUNT(*) AS total FROM subscriptions WHERE status IN ('confirmed', 'detected')")
  missing=$(value "SELECT COUNT(*) AS total FROM subscriptions WHERE status IN ('confirmed', 'detected') AND frequency NOT IN ('weekly', 'monthly', 'quarterly', 'annual')")
  cancelled=$(value "SELECT COUNT(*) AS total FROM subscriptions WHERE status = 'cancelled'")
  annual=$(value "SELECT COALESCE(SUM(typical_base_minor * CASE frequency WHEN 'weekly' THEN 52 WHEN 'monthly' THEN 12 WHEN 'quarterly' THEN 4 WHEN 'annual' THEN 1 END), 0) AS total FROM subscriptions WHERE status IN ('confirmed', 'detected')")

  steps_observe subscriptions-have-a-frequency-rule "$missing"
  steps_observe subscriptions-active "$active"
  steps_observe subscriptions-annual-cost "$annual"
  steps_observe subscriptions-cancelled "$cancelled"
}

step_investments() {
  local priced pending known exact platforms
  priced=$(value "SELECT group_concat(name || ' value=' || (quantity_micros * last_price_minor / 1000000) || ' gain=' || (quantity_micros * last_price_minor / 1000000 - cost_basis_minor), '; ') AS priced FROM (SELECT * FROM holdings WHERE last_price_minor IS NOT NULL ORDER BY name)")
  pending=$(value "SELECT COUNT(*) AS total FROM holdings WHERE state = 'pending' AND last_price_minor IS NULL")
  known=$(value "SELECT COALESCE(SUM(quantity_micros * last_price_minor / 1000000), 0) AS total FROM holdings WHERE last_price_minor IS NOT NULL")
  exact=$(value "SELECT COALESCE(SUM((quantity_micros * last_price_minor) % 1000000), 0) AS total FROM holdings WHERE last_price_minor IS NOT NULL")
  platforms=$(value "SELECT COUNT(*) AS total FROM holdings h LEFT JOIN investment_platforms p ON p.id = h.platform_id WHERE p.id IS NULL")

  steps_observe holdings-value-math "$priced"
  steps_observe holdings-stay-whole-cents "$exact"
  steps_observe holdings-pending-unknown "$pending"
  steps_observe holdings-known-value "$known"
  steps_observe holdings-platforms "$platforms"
}

step_fx_conversion() {
  local conversions rounding same_currency months
  conversions=$(value "SELECT group_concat(external_id || ' ' || source_minor || ' ' || source_currency || ' -> ' || base_minor || ' ' || base_currency || ' at ' || rate, '; ') AS conversions FROM (SELECT * FROM transactions WHERE source_currency <> base_currency ORDER BY occurred_at)")
  rounding=$(value "SELECT COUNT(*) AS total FROM transactions WHERE source_currency <> base_currency AND abs(base_minor - round(source_minor * rate)) > 0")
  same_currency=$(value "SELECT COUNT(*) AS total FROM transactions WHERE source_currency = base_currency AND (source_minor <> base_minor OR rate IS NOT NULL)")
  months=$(value "SELECT COUNT(*) AS total FROM transactions t WHERE t.source_currency <> t.base_currency AND NOT EXISTS (SELECT 1 FROM exchange_rates e WHERE e.as_of = substr(t.rate_as_of, 1, 7) || '-01' AND ((e.base_currency = t.source_currency AND e.quote_currency = t.base_currency) OR (e.base_currency = t.base_currency AND e.quote_currency = t.source_currency)))")

  steps_observe conversion-rounds-exactly "$rounding"
  steps_observe conversion-keeps-same-currency "$same_currency"
  steps_observe conversion-has-a-monthly-rate "$months"
  steps_observe conversion-recorded-lines "$conversions"
}

step_tax() {
  local settlement orphans paid unpaid tax_year
  settlement=$(value "SELECT COUNT(*) AS total FROM tax_obligations o JOIN transactions t ON t.id = o.settled_transaction_id WHERE o.status = 'paid' AND (o.amount_minor <> t.base_minor OR o.amount_currency <> t.base_currency OR t.classification <> 'tax_payment')")
  orphans=$(value "SELECT COUNT(*) AS total FROM tax_obligations WHERE status <> 'paid' AND settled_transaction_id IS NOT NULL")
  paid=$(value "SELECT COALESCE(SUM(amount_minor), 0) AS total FROM tax_obligations WHERE status = 'paid'")
  unpaid=$(value "SELECT COALESCE(SUM(amount_minor), 0) AS total FROM tax_obligations WHERE status <> 'paid'")
  tax_year=$(value "SELECT jurisdiction || ' ' || year_start_month || '-' || year_start_day AS tax_year FROM tax_profiles")

  steps_observe tax-settles-once "$settlement"
  steps_observe tax-unpaid-has-no-settlement "$orphans"
  steps_observe tax-paid-total "$paid"
  steps_observe tax-unpaid-total "$unpaid"
  steps_observe tax-year "$tax_year"
}

step_invoices() {
  local wrong_amount exception unarchived archived vendors
  wrong_amount=$(value "SELECT COUNT(*) AS total FROM invoice_documents d JOIN transactions t ON t.id = d.transaction_id WHERE d.amount_minor <> t.base_minor OR d.amount_currency <> t.base_currency")
  exception=$(value "SELECT t.base_minor || ' documents=' || (SELECT COUNT(*) FROM invoice_documents d WHERE d.transaction_id = e.transaction_id) AS detail FROM invoice_exceptions e JOIN transactions t ON t.id = e.transaction_id")
  unarchived=$(value "SELECT COUNT(*) AS total FROM invoice_documents WHERE archive_state = 'unarchived' AND (archive_target_id IS NOT NULL OR archive_file_id IS NOT NULL OR archived_at IS NOT NULL)")
  archived=$(value "SELECT COUNT(*) AS total FROM invoice_documents WHERE archive_state = 'archived' AND (archive_target_id IS NULL OR archive_file_id IS NULL OR archived_at IS NULL)")
  vendors=$(value "SELECT COUNT(*) AS total FROM invoice_documents d JOIN payees p ON p.id = d.vendor_payee_id WHERE p.profile_id <> d.profile_id")
  archive_states=$(value "SELECT COUNT(*) AS total FROM invoice_documents WHERE archive_state NOT IN ('unarchived', 'reserved', 'archived', 'failed') OR (archive_state = 'unarchived' AND (archive_file_id IS NOT NULL OR archive_target_id IS NOT NULL OR archived_at IS NOT NULL OR archive_failure_reason IS NOT NULL)) OR (archive_state = 'reserved' AND (archive_file_id IS NULL OR archive_target_id IS NULL OR archived_at IS NOT NULL OR archive_failure_reason IS NOT NULL)) OR (archive_state = 'archived' AND (archive_file_id IS NULL OR archive_target_id IS NULL OR archived_at IS NULL OR archive_failure_reason IS NOT NULL)) OR (archive_state = 'failed' AND (archive_failure_reason IS NULL OR archive_failure_reason = '' OR archive_file_id IS NOT NULL OR archive_target_id IS NOT NULL OR archived_at IS NOT NULL))")

  steps_observe invoice-matches-its-line "$wrong_amount"
  steps_observe invoice-exception-has-no-document "$exception"
  steps_observe invoice-unarchived "$unarchived"
  steps_observe invoice-archived "$archived"
  steps_observe invoice-vendors "$vendors"
  steps_observe invoice-archive-states "$archive_states"
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
