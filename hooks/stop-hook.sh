#!/bin/bash

# Ralph Wiggum Stop Hook (Enhanced v2)
# Prevents session exit when a ralph-loop is active
# Integrates TypeScript scripts for context management

set -euo pipefail

# Get plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Paths
RALPH_STATE_FILE=".claude/ralph-loop.local.md"
RALPH_MEMORY_FILE=".claude/RALPH_MEMORY.md"
RALPH_STATUS_FILE=".claude/RALPH_STATUS.md"
RALPH_NUDGE_FILE=".claude/RALPH_NUDGE.md"

# Check if ralph-loop is active
if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  exit 0
fi

# Parse markdown frontmatter (YAML between ---)
parse_frontmatter() {
  sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$1"
}

get_yaml_value() {
  echo "$1" | grep "^$2:" | sed "s/$2: *//" | sed 's/^"\(.*\)"$/\1/'
}

get_yaml_nested_value() {
  echo "$1" | grep "^  $2:" | sed "s/  $2: *//" | sed 's/^"\(.*\)"$/\1/'
}

FRONTMATTER=$(parse_frontmatter "$RALPH_STATE_FILE")
ITERATION=$(get_yaml_value "$FRONTMATTER" "iteration")
MAX_ITERATIONS=$(get_yaml_value "$FRONTMATTER" "max_iterations")
COMPLETION_PROMISE=$(get_yaml_value "$FRONTMATTER" "completion_promise")
STARTED_AT=$(get_yaml_value "$FRONTMATTER" "started_at")
CHECKPOINT_INTERVAL=$(get_yaml_value "$FRONTMATTER" "checkpoint_interval")
CHECKPOINT_MODE=$(get_yaml_value "$FRONTMATTER" "checkpoint_mode")
CURRENT_STRATEGY=$(get_yaml_nested_value "$FRONTMATTER" "current")
STUCK_COUNT=$(get_yaml_nested_value "$FRONTMATTER" "stuck_count")

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Ralph loop: State file corrupted (iteration: '$ITERATION')" >&2
  rm "$RALPH_STATE_FILE"
  exit 0
fi

if [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Ralph loop: State file corrupted (max_iterations: '$MAX_ITERATIONS')" >&2
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Check if max iterations reached
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Ralph loop: Max iterations ($MAX_ITERATIONS) reached."

  # Generate final summary
  echo '{"completion_reason":"max_iterations","final_iteration":'$ITERATION'}' | \
    bun run "${PLUGIN_ROOT}/scripts/generate-summary.ts" "$RALPH_MEMORY_FILE" ".claude/RALPH_SUMMARY.md" 2>/dev/null || true

  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Get transcript path from hook input
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')

if [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "⚠️  Ralph loop: Transcript file not found: $TRANSCRIPT_PATH" >&2
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Check for assistant messages
if ! grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  echo "⚠️  Ralph loop: No assistant messages in transcript" >&2
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Extract last assistant message
LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '
  .message.content |
  map(select(.type == "text")) |
  map(.text) |
  join("\n")
' 2>/dev/null || echo "")

if [[ -z "$LAST_OUTPUT" ]]; then
  echo "⚠️  Ralph loop: Empty assistant message" >&2
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Check for completion promise
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    echo "✅ Ralph loop: Detected <promise>$COMPLETION_PROMISE</promise>"

    # Generate final summary
    echo '{"completion_reason":"promise","final_iteration":'$ITERATION'}' | \
      bun run "${PLUGIN_ROOT}/scripts/generate-summary.ts" "$RALPH_MEMORY_FILE" ".claude/RALPH_SUMMARY.md" 2>/dev/null || true

    rm "$RALPH_STATE_FILE"
    exit 0
  fi
fi

# === ENHANCED PROCESSING ===

# 1. Analyze transcript
ANALYSIS=$(bun run "${PLUGIN_ROOT}/scripts/analyze-transcript.ts" "$TRANSCRIPT_PATH" 2>/dev/null || echo '{"errors":[],"repeated_errors":[],"files_modified":[],"tests_run":false,"tests_passed":false,"tests_failed":false,"phase_completions":[],"meaningful_changes":false}')

# 2. Build state JSON for scripts
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$RALPH_STATE_FILE")

STATE_JSON=$(jq -n \
  --arg active "true" \
  --argjson iteration "$ITERATION" \
  --argjson max_iterations "$MAX_ITERATIONS" \
  --arg completion_promise "$COMPLETION_PROMISE" \
  --arg started_at "${STARTED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}" \
  --argjson checkpoint_interval "${CHECKPOINT_INTERVAL:-0}" \
  --arg checkpoint_mode "${CHECKPOINT_MODE:-notify}" \
  --arg current_strategy "${CURRENT_STRATEGY:-explore}" \
  --argjson stuck_count "${STUCK_COUNT:-0}" \
  --arg prompt_text "$PROMPT_TEXT" \
  '{
    active: true,
    iteration: $iteration,
    max_iterations: $max_iterations,
    completion_promise: $completion_promise,
    started_at: $started_at,
    checkpoint_interval: $checkpoint_interval,
    checkpoint_mode: $checkpoint_mode,
    strategy: {
      current: $current_strategy,
      changed_at: 0
    },
    progress: {
      stuck_count: $stuck_count,
      velocity: "normal",
      last_meaningful_change: 0
    },
    phases: [],
    prompt_text: $prompt_text
  }')

# 3. Determine strategy
STRATEGY_INPUT=$(jq -n \
  --argjson state "$STATE_JSON" \
  --argjson analysis "$ANALYSIS" \
  '{state: $state, analysis: $analysis}')

STRATEGY=$(echo "$STRATEGY_INPUT" | bun run "${PLUGIN_ROOT}/scripts/strategy-engine.ts" 2>/dev/null || echo '{"strategy":"explore","reason":"Default","action":"continue","guidance":["Continue working"]}')

NEW_STRATEGY=$(echo "$STRATEGY" | jq -r '.strategy')

# 4. Update memory file
MEMORY_INPUT=$(jq -n \
  --argjson state "$STATE_JSON" \
  --argjson analysis "$ANALYSIS" \
  '{state: $state, analysis: $analysis}')

echo "$MEMORY_INPUT" | bun run "${PLUGIN_ROOT}/scripts/update-memory.ts" "$RALPH_MEMORY_FILE" 2>/dev/null || true

# 5. Update status dashboard
STATUS_INPUT=$(jq -n \
  --argjson state "$STATE_JSON" \
  --argjson analysis "$ANALYSIS" \
  --argjson strategy "$STRATEGY" \
  '{state: $state, analysis: $analysis, strategy: $strategy}')

echo "$STATUS_INPUT" | bun run "${PLUGIN_ROOT}/scripts/update-status.ts" "$RALPH_STATUS_FILE" 2>/dev/null || true

# 6. Check for nudge file (one-time instruction)
NUDGE_CONTENT=""
if [[ -f "$RALPH_NUDGE_FILE" ]]; then
  NUDGE_CONTENT=$(cat "$RALPH_NUDGE_FILE")
  rm "$RALPH_NUDGE_FILE"
fi

# 7. Check for checkpoint
NEXT_ITERATION=$((ITERATION + 1))
IS_CHECKPOINT=false

if [[ "${CHECKPOINT_INTERVAL:-0}" -gt 0 ]]; then
  if (( NEXT_ITERATION % CHECKPOINT_INTERVAL == 0 )); then
    IS_CHECKPOINT=true
  fi
fi

# 8. Build enhanced context
CONTEXT_INPUT=$(jq -n \
  --argjson state "$STATE_JSON" \
  --argjson strategy "$STRATEGY" \
  --argjson analysis "$ANALYSIS" \
  --arg memory_path "$RALPH_MEMORY_FILE" \
  --arg nudge_content "$NUDGE_CONTENT" \
  '{
    state: $state,
    strategy: $strategy,
    analysis: $analysis,
    memory_path: $memory_path,
    nudge_content: $nudge_content
  }')

ENHANCED_PROMPT=$(echo "$CONTEXT_INPUT" | bun run "${PLUGIN_ROOT}/scripts/build-context.ts" 2>/dev/null || echo "$PROMPT_TEXT")

# 9. Update iteration and strategy in state file
TEMP_FILE="${RALPH_STATE_FILE}.tmp.$$"
sed -e "s/^iteration: .*/iteration: $NEXT_ITERATION/" \
    -e "s/^  current: .*/  current: \"$NEW_STRATEGY\"/" \
    "$RALPH_STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$RALPH_STATE_FILE"

# 10. Handle checkpoint (pause mode)
if [[ "$IS_CHECKPOINT" == "true" ]] && [[ "${CHECKPOINT_MODE:-notify}" == "pause" ]]; then
  # Create checkpoint file
  cat > ".claude/RALPH_CHECKPOINT.md" <<EOF
# Checkpoint at Iteration $NEXT_ITERATION

Ralph has paused for your review.

## How to Continue

1. Review the status: \`cat .claude/RALPH_STATUS.md\`
2. Review the memory: \`cat .claude/RALPH_MEMORY.md\`
3. Optionally send guidance: \`/ralph-nudge "your instruction"\`
4. Resume: \`/ralph-checkpoint continue\`

Or to stop: \`/cancel-ralph\`
EOF

  echo "⏸️  Ralph checkpoint at iteration $NEXT_ITERATION - awaiting /ralph-checkpoint continue"

  # Block until checkpoint file is removed
  jq -n \
    --arg msg "⏸️ Checkpoint at iteration $NEXT_ITERATION. Run /ralph-checkpoint continue to resume." \
    '{
      "decision": "block",
      "reason": "Checkpoint reached. Review .claude/RALPH_CHECKPOINT.md and run /ralph-checkpoint continue when ready.",
      "systemMessage": $msg
    }'
  exit 0
fi

# 11. Build system message
ERRORS_COUNT=$(echo "$ANALYSIS" | jq '.errors | length')
if [[ "$ERRORS_COUNT" -gt 0 ]]; then
  ERROR_INFO=" | ⚠️ $ERRORS_COUNT error(s)"
else
  ERROR_INFO=""
fi

if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  SYSTEM_MSG="🔄 Ralph #$NEXT_ITERATION [$NEW_STRATEGY]$ERROR_INFO | Done? <promise>$COMPLETION_PROMISE</promise>"
else
  SYSTEM_MSG="🔄 Ralph #$NEXT_ITERATION [$NEW_STRATEGY]$ERROR_INFO"
fi

# Add nudge notification if present
if [[ -n "$NUDGE_CONTENT" ]]; then
  SYSTEM_MSG="$SYSTEM_MSG | 📬 Nudge received"
fi

# Add checkpoint notification
if [[ "$IS_CHECKPOINT" == "true" ]] && [[ "${CHECKPOINT_MODE:-notify}" == "notify" ]]; then
  SYSTEM_MSG="$SYSTEM_MSG | 📍 Checkpoint"
fi

# Output JSON to block the stop and feed enhanced prompt back
jq -n \
  --arg prompt "$ENHANCED_PROMPT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
