STEP_NAMES=()
STEP_KINDS=()
STEP_COMMANDS=()
STEP_STATE_DIR=
STEP_LEDGER=
STEP_RESULTS=
CURRENT_STEP=
STEP_STATUS=0
STEP_FAILURES=()
CHECK_TOTAL=0
CHECK_FAILED=0

steps_init() {
  STEP_STATE_DIR=$1
  STEP_LEDGER=$STEP_STATE_DIR/ledger.tsv
  STEP_RESULTS=$STEP_STATE_DIR/results.jsonl
  mkdir -p "$STEP_STATE_DIR/output"
  : > "$STEP_LEDGER"
  : > "$STEP_RESULTS"
}

steps_declare() {
  STEP_NAMES+=("$1")
  STEP_KINDS+=("$2")
  STEP_COMMANDS+=("${3:-}")
}

steps_append() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "${4:-}" >> "$STEP_LEDGER"
}

steps_list() {
  local index
  for index in "${!STEP_NAMES[@]}"; do
    printf '%s\t%s\t%s\n' "${STEP_NAMES[$index]}" "${STEP_KINDS[$index]}" "${STEP_COMMANDS[$index]}"
  done
}

steps_declared_step() {
  local wanted=$1 index
  for index in "${!STEP_NAMES[@]}"; do
    if [ "${STEP_NAMES[$index]}" = "$wanted" ]; then
      return 0
    fi
  done
  return 1
}

steps_command_owner() {
  local wanted=$1 index
  for index in "${!STEP_COMMANDS[@]}"; do
    if [ "${STEP_COMMANDS[$index]}" = "$wanted" ]; then
      printf '%s\n' "${STEP_NAMES[$index]}"
      return 0
    fi
  done
  return 1
}

steps_command_status() {
  awk -F'\t' -v wanted="$1" '$1 == "command" && $2 == wanted { print $3; exit }' "$STEP_LEDGER"
}

steps_run_step() {
  local name=$1 status=0
  STEP_STATUS=0
  if ! steps_declared_step "$name"; then
    steps_append step "$name" 127 undeclared
    STEP_STATUS=127
    return 0
  fi
  CURRENT_STEP=$name
  : > "$STEP_STATE_DIR/output/$name.out"
  "step_${name//-/_}" || status=$?
  steps_append step "$name" "$status" ""
  STEP_STATUS=$status
  if [ "$status" -ne 0 ]; then
    printf 'FAIL step %s exited %s\n' "$name" "$status" >&2
  fi
  return 0
}

steps_run_command() {
  local name=$1 status=0 owner
  shift
  if ! owner=$(steps_command_owner "$name"); then
    steps_append command "$name" 127 undeclared
    printf 'FAIL command %s is not in the step table\n' "$name" >&2
    return 0
  fi
  "$@" || status=$?
  steps_append command "$name" "$status" "$owner"
  if [ "$status" -ne 0 ]; then
    printf 'FAIL command %s exited %s\n' "$name" "$status" >&2
  fi
  return 0
}

steps_require_file() {
  local path=$1
  if [ -s "$path" ]; then
    printf 'file %s %s bytes\n' "$path" "$(wc -c < "$path")" >> "$STEP_STATE_DIR/output/$CURRENT_STEP.out"
    return 0
  fi
  steps_append output "$CURRENT_STEP" 1 "missing:$path"
  printf 'FAIL step %s wrote no output to %s\n' "$CURRENT_STEP" "$path" >&2
  return 0
}

check() {
  local id=$1 title=$2 expected=$3 actual=$4 status=FAIL passed=false
  if [ "$actual" = "$expected" ]; then
    status=PASS
    passed=true
  fi
  jq -n --arg id "$id" --arg title "$title" --arg feature "$ACTIVE_FEATURE" --arg step "$CURRENT_STEP" --arg status "$status" --arg expected "$expected" --arg actual "$actual" --argjson passed "$passed" '{id: $id, title: $title, feature: $feature, step: $step, passed: $passed, expected: $expected, actual: $actual}' >> "$STEP_RESULTS"
  printf '%s %s\n' "$status" "$id" >> "$STEP_STATE_DIR/output/$CURRENT_STEP.out"
  printf '%s %s\n' "$status" "$id"
}

steps_finish() {
  local index name command status rows kind row_name
  STEP_FAILURES=()
  for index in "${!STEP_NAMES[@]}"; do
    name=${STEP_NAMES[$index]}
    rows=$(awk -F'\t' -v wanted="$name" '$1 == "step" && $2 == wanted' "$STEP_LEDGER" | wc -l)
    if [ "$rows" -eq 0 ]; then
      STEP_FAILURES+=("step $name did not run")
      continue
    fi
    if [ "$rows" -gt 1 ]; then
      STEP_FAILURES+=("step $name ran $rows times")
    fi
    status=$(awk -F'\t' -v wanted="$name" '$1 == "step" && $2 == wanted { print $3; exit }' "$STEP_LEDGER")
    if [ "$status" != 0 ]; then
      STEP_FAILURES+=("step $name exited $status")
    fi
    if [ ! -s "$STEP_STATE_DIR/output/$name.out" ]; then
      STEP_FAILURES+=("step $name wrote no output")
    fi
    command=${STEP_COMMANDS[$index]}
    if [ -n "$command" ]; then
      rows=$(awk -F'\t' -v wanted="$command" '$1 == "command" && $2 == wanted' "$STEP_LEDGER" | wc -l)
      if [ "$rows" -eq 0 ]; then
        STEP_FAILURES+=("command $command did not run")
        continue
      fi
      status=$(steps_command_status "$command")
      if [ "$status" != 0 ]; then
        STEP_FAILURES+=("command $command exited $status")
      fi
    fi
  done
  while IFS=$'\t' read -r kind row_name status _; do
    if [ "$kind" = step ] && ! steps_declared_step "$row_name"; then
      STEP_FAILURES+=("step $row_name is not in the step table")
    fi
  done < "$STEP_LEDGER"
  CHECK_TOTAL=$(jq -s 'length' "$STEP_RESULTS")
  CHECK_FAILED=$(jq -s '[.[] | select(.passed | not)] | length' "$STEP_RESULTS")
  if [ "$CHECK_FAILED" -ne 0 ]; then
    STEP_FAILURES+=("$CHECK_FAILED checks failed")
  fi
  for name in "${STEP_FAILURES[@]}"; do
    printf 'FAIL %s\n' "$name" >&2
  done
  [ "${#STEP_FAILURES[@]}" -eq 0 ]
}

steps_verdict() {
  if [ "${#STEP_FAILURES[@]}" -eq 0 ]; then
    printf 'PASS %s steps, %s checks, 0 failed.\n' "${#STEP_NAMES[@]}" "$CHECK_TOTAL"
    return 0
  fi
  printf 'FAIL %s problems, %s of %s checks failed.\n' "${#STEP_FAILURES[@]}" "$CHECK_FAILED" "$CHECK_TOTAL"
  return 1
}
