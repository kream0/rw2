#!/bin/bash

# Ralph Wiggum Pre-Compact Hook (Memorai Edition)
# Preserves session ID for context restoration after /compact
# Session memory persists in memorai - no need to copy data

set -euo pipefail

RALPH_STATE_FILE=".claude/ralph-loop.local.md"
COMPACT_PRESERVE_FILE=".claude/RALPH_COMPACT_PRESERVE.md"

# Only act if ralph-loop is active
if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  exit 0
fi

# Parse session_id from state file
parse_frontmatter() {
  sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$1"
}

get_yaml_value() {
  echo "$1" | grep "^$2:" | sed "s/$2: *//" | sed 's/^"\(.*\)"$/\1/'
}

FRONTMATTER=$(parse_frontmatter "$RALPH_STATE_FILE")
SESSION_ID=$(get_yaml_value "$FRONTMATTER" "session_id")
ITERATION=$(get_yaml_value "$FRONTMATTER" "iteration")

# Create minimal preserve file with session ID
{
  echo "# Ralph Context (Preserved for Compaction)"
  echo ""
  echo "_This file was auto-generated before /compact to preserve session reference._"
  echo ""
  echo "**Session ID:** $SESSION_ID"
  echo "**Iteration:** $ITERATION"
  echo ""
  echo "Session memory is stored in Memorai and will be restored automatically."
  echo ""
  echo "---"
  echo "_After compact, context will be restored from memorai._"
} > "$COMPACT_PRESERVE_FILE"

echo "📋 Ralph: Preserved session ID for compaction (memorai data persists)"

exit 0
