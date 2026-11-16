STEPS_STATE_DIR=
STEPS_FEATURE=
STEPS_RECORDS=
STEPS_META_FILE=
STEPS_COMMANDS_FILE=
STEPS_OUTPUTS_FILE=
STEPS_ARTIFACTS_FILE=
STEPS_CHECKS_FILE=
STEPS_CURRENT=

steps_init() {
  STEPS_STATE_DIR=$1
  STEPS_FEATURE=$2
  STEPS_RECORDS=$STEPS_STATE_DIR/records.jsonl
  STEPS_META_FILE=$STEPS_STATE_DIR/meta.jsonl
  mkdir -p "$STEPS_STATE_DIR"
  : > "$STEPS_RECORDS"
  : > "$STEPS_META_FILE"
  STEPS_CURRENT=
}

steps_meta() {
  jq -cn --arg key "$1" --arg value "$2" '{key: $key, value: $value}' >> "$STEPS_META_FILE"
}

steps_reset_step() {
  STEPS_COMMANDS_FILE=$STEPS_STATE_DIR/commands.tsv
  STEPS_OUTPUTS_FILE=$STEPS_STATE_DIR/outputs.tsv
  STEPS_ARTIFACTS_FILE=$STEPS_STATE_DIR/artifacts.tsv
  STEPS_CHECKS_FILE=$STEPS_STATE_DIR/checks.jsonl
  : > "$STEPS_COMMANDS_FILE"
  : > "$STEPS_OUTPUTS_FILE"
  : > "$STEPS_ARTIFACTS_FILE"
  : > "$STEPS_CHECKS_FILE"
}

steps_run_command() {
  local id=$1 status=0
  shift
  "$@" || status=$?
  printf '%s\t%s\n' "$id" "$status" >> "$STEPS_COMMANDS_FILE"
  [ "$status" -eq 0 ] || printf 'command %s exited %s\n' "$id" "$status" >&2
  return 0
}

steps_command_exit() {
  awk -F'\t' -v wanted="$1" '$1 == wanted { status = $2 } END { print status }' "$STEPS_COMMANDS_FILE"
}

steps_require_file() {
  local name=$1 path=$2 found=no
  [ -s "$path" ] && found=yes
  printf '%s\t%s\n' "$name" "$found" >> "$STEPS_OUTPUTS_FILE"
  [ "$found" = yes ] || printf 'output %s was not written to %s\n' "$name" "$path" >&2
  return 0
}

steps_keep_artifact() {
  local name=$1 path=$2 found=no
  [ -s "$path" ] && found=yes
  printf '%s\t%s\t%s\n' "$name" "$found" "$path" >> "$STEPS_ARTIFACTS_FILE"
  [ "$found" = yes ] || printf 'artifact %s was not written to %s\n' "$name" "$path" >&2
  return 0
}

check() {
  local id=$1 title=$2 expected=$3 actual=$4
  jq -cn --arg id "$id" --arg title "$title" --arg expected "$expected" --arg actual "$actual" '{id: $id, title: $title, expected: $expected, actual: $actual}' >> "$STEPS_CHECKS_FILE"
  printf 'check %s expected=%s observed=%s\n' "$id" "$expected" "$actual"
  return 0
}

steps_write_record() {
  local id=$1 status=$2
  jq -cn \
    --arg step "$id" \
    --argjson exit "$status" \
    --arg feature "$STEPS_FEATURE" \
    --rawfile commands "$STEPS_COMMANDS_FILE" \
    --rawfile outputs "$STEPS_OUTPUTS_FILE" \
    --rawfile artifacts "$STEPS_ARTIFACTS_FILE" \
    --slurpfile checks "$STEPS_CHECKS_FILE" \
    --slurpfile meta "$STEPS_META_FILE" \
    '{
      step: $step,
      exit: $exit,
      feature: $feature,
      commands: [$commands | split("\n")[] | select(length > 0) | split("\t") | {id: .[0], exit: (.[1] | tonumber)}],
      outputs: [$outputs | split("\n")[] | select(length > 0) | split("\t") | {name: .[0], found: (.[1] == "yes")}],
      artifacts: [$artifacts | split("\n")[] | select(length > 0) | split("\t") | {name: .[0], found: (.[1] == "yes"), path: .[2]}],
      checks: $checks,
      data: ($meta | from_entries)
    }' >> "$STEPS_RECORDS"
}

steps_run_step() {
  local id=$1 status=0
  steps_reset_step
  STEPS_CURRENT=$id
  "step_${id//-/_}" || status=$?
  if ! steps_write_record "$id" "$status"; then
    printf 'step %s was not recorded\n' "$id" >&2
    return 0
  fi
  [ "$status" -eq 0 ] || printf 'step %s exited %s\n' "$id" "$status" >&2
  return 0
}
