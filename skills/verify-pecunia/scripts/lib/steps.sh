STEPS_STATE_DIR=
STEPS_FEATURE=
STEPS_RECORDS=
STEPS_META_FILE=
STEPS_COMMANDS_FILE=
STEPS_OUTPUTS_FILE=
STEPS_ARTIFACTS_FILE=
STEPS_OBSERVATIONS_FILE=
STEPS_MUTATIONS_FILE=
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
  STEPS_OBSERVATIONS_FILE=$STEPS_STATE_DIR/observations.tsv
  STEPS_MUTATIONS_FILE=$STEPS_STATE_DIR/mutations.tsv
  : > "$STEPS_COMMANDS_FILE"
  : > "$STEPS_OUTPUTS_FILE"
  : > "$STEPS_ARTIFACTS_FILE"
  : > "$STEPS_OBSERVATIONS_FILE"
  : > "$STEPS_MUTATIONS_FILE"
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

steps_observe() {
  local id=$1 value=$2 operation=${3:-}
  printf '%s\t%s\t%s\n' "$id" "$operation" "$(printf '%s' "$value" | tr '\t\n' '  ')" >> "$STEPS_OBSERVATIONS_FILE"
  printf 'observation %s=%s\n' "$id" "$value"
  return 0
}

steps_observe_json() {
  local path=$1 id value operation
  while IFS=$'\x1f' read -r id operation value; do
    [ -n "$id" ] || continue
    steps_observe "$id" "$value" "$operation"
  done < <(jq -r '(.observations // [])[] | [.id, (.operation // ""), .value] | join("\u001f")' "$path" 2>/dev/null || true)
  return 0
}

steps_count_mutations() {
  printf '%s\t%s\n' "$(date +%s%N)" "$1" >> "$STEPS_MUTATIONS_FILE"
  printf 'mutating calls %s\n' "$1"
  return 0
}

steps_mutating_calls() {
  awk -F'\t' '{ total += $2 } END { print total + 0 }' "$STEPS_MUTATIONS_FILE" 2>/dev/null || printf '0\n'
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
    --rawfile observations "$STEPS_OBSERVATIONS_FILE" \
    --rawfile mutations "$STEPS_MUTATIONS_FILE" \
    --slurpfile meta "$STEPS_META_FILE" \
    '{
      step: $step,
      exit: $exit,
      feature: $feature,
      mutatingCalls: ([$mutations | split("\n")[] | select(length > 0) | split("\t") | .[1] | tonumber] | add // 0),
      commands: [$commands | split("\n")[] | select(length > 0) | split("\t") | {id: .[0], exit: (.[1] | tonumber)}],
      outputs: [$outputs | split("\n")[] | select(length > 0) | split("\t") | {name: .[0], found: (.[1] == "yes")}],
      artifacts: [$artifacts | split("\n")[] | select(length > 0) | split("\t") | {name: .[0], found: (.[1] == "yes"), path: .[2]}],
      observations: [$observations | split("\n")[] | select(length > 0) | split("\t") | {id: .[0], operation: .[1], value: (.[2:] | join("\t"))}],
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
  [ "$status" -eq 0 ] || printf 'step %s exited %s\n' "$id" >&2
  return 0
}
