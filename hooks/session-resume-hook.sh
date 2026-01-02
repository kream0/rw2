#!/bin/bash

# Ralph Wiggum Session Resume Hook
# Reinjects context when a session resumes (e.g., after /compact or reconnect)
# Ensures Claude remembers the task and current state

set -euo pipefail

RALPH_STATE_FILE=".claude/ralph-loop.local.md"
RALPH_MEMORY_FILE=".claude/RALPH_MEMORY.md"
COMPACT_PRESERVE_FILE=".claude/RALPH_COMPACT_PRESERVE.md"

# Only act if ralph-loop is active
if [[ ! -f "$RALPH_STATE_FILE" ]]; then
  exit 0
fi

# Parse current iteration from state
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$RALPH_STATE_FILE")
ITERATION=$(echo "$FRONTMATTER" | grep '^iteration:' | sed 's/iteration: *//')

# Build context injection message
{
  echo "# Ralph Session Context"
  echo ""
  echo "**You are in an active Ralph loop at iteration $ITERATION.**"
  echo ""

  # Use preserved compact file if available
  if [[ -f "$COMPACT_PRESERVE_FILE" ]]; then
    echo "_Context restored from pre-compact preservation:_"
    echo ""
    cat "$COMPACT_PRESERVE_FILE"
  elif [[ -f "$RALPH_MEMORY_FILE" ]]; then
    # Fall back to memory file
    echo "_Context restored from memory file:_"
    echo ""

    # Extract key sections
    echo "## Original Objective"
    sed -n '/^## Original Objective$/,/^## /{ /^## Original Objective$/d; /^## /d; p; }' "$RALPH_MEMORY_FILE"
    echo ""

    echo "## Current Status"
    sed -n '/^## Current Status$/,/^## /{ /^## Current Status$/d; /^## /d; p; }' "$RALPH_MEMORY_FILE"
    echo ""

    echo "## Next Actions"
    sed -n '/^## Next Actions$/,/^## /{ /^## Next Actions$/d; /^## /d; p; }' "$RALPH_MEMORY_FILE"
    echo ""
  fi

  echo ""
  echo "---"
  echo "Continue working on the task. When complete, output: \`<promise>COMPLETION_PHRASE</promise>\`"
}

# Clean up compact preserve file after use
if [[ -f "$COMPACT_PRESERVE_FILE" ]]; then
  rm "$COMPACT_PRESERVE_FILE"
fi

exit 0
