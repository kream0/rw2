#!/bin/bash

# Ralph Wiggum Pre-Compact Hook
# Preserves goals and critical context before /compact is run
# This ensures the original objective survives context reduction

set -euo pipefail

RALPH_STATE_FILE=".claude/ralph-loop.local.md"
RALPH_MEMORY_FILE=".claude/RALPH_MEMORY.md"
COMPACT_PRESERVE_FILE=".claude/RALPH_COMPACT_PRESERVE.md"

# Only act if ralph-loop is active
if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  exit 0
fi

# Check if memory file exists
if [[ ! -f "$RALPH_MEMORY_FILE" ]]; then
  exit 0
fi

# Extract critical sections from memory to preserve
{
  echo "# Ralph Context (Preserved for Compaction)"
  echo ""
  echo "_This file was auto-generated before /compact to preserve critical context._"
  echo ""

  # Extract Original Objective
  echo "## Original Objective"
  sed -n '/^## Original Objective$/,/^## /{ /^## Original Objective$/d; /^## /d; p; }' "$RALPH_MEMORY_FILE"
  echo ""

  # Extract Current Status
  echo "## Current Status"
  sed -n '/^## Current Status$/,/^## /{ /^## Current Status$/d; /^## /d; p; }' "$RALPH_MEMORY_FILE"
  echo ""

  # Extract Next Actions
  echo "## Next Actions"
  sed -n '/^## Next Actions$/,/^## /{ /^## Next Actions$/d; /^## /d; p; }' "$RALPH_MEMORY_FILE"
  echo ""

  # Extract Key Learnings (important to avoid repeating mistakes)
  echo "## Key Learnings"
  sed -n '/^## Key Learnings$/,/^## /{ /^## Key Learnings$/d; /^## /d; p; }' "$RALPH_MEMORY_FILE"
  echo ""

  echo "---"
  echo "_After compact, refer to .claude/RALPH_MEMORY.md for full history._"
} > "$COMPACT_PRESERVE_FILE"

echo "📋 Ralph: Preserved context for compaction in $COMPACT_PRESERVE_FILE"

exit 0
