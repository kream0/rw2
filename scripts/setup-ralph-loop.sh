#!/bin/bash

# Ralph Loop Setup Script (Enhanced)
# Creates state file and initializes memory for in-session Ralph loop

set -euo pipefail

# Get script directory for accessing TS scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
PROMPT_PARTS=()
MAX_ITERATIONS=0
COMPLETION_PROMISE="null"
CHECKPOINT_INTERVAL=0
CHECKPOINT_MODE="notify"

# Parse options and positional arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << 'HELP_EOF'
Ralph Loop - Interactive self-referential development loop (Enhanced)

USAGE:
  /ralph-loop [PROMPT...] [OPTIONS]

ARGUMENTS:
  PROMPT...    Initial prompt to start the loop (can be multiple words without quotes)

OPTIONS:
  --max-iterations <n>           Maximum iterations before auto-stop (default: unlimited)
  --completion-promise '<text>'  Promise phrase (USE QUOTES for multi-word)
  --checkpoint <n>               Pause for review every N iterations (default: off)
  --checkpoint-mode <mode>       "pause" (stop for input) or "notify" (just alert)
  -h, --help                     Show this help message

DESCRIPTION:
  Starts a Ralph Wiggum loop in your CURRENT session. The stop hook prevents
  exit and feeds your output back as input until completion or iteration limit.

  NEW in v2: Context management via RALPH_MEMORY.md, adaptive strategies,
  and status dashboard at RALPH_STATUS.md.

  To signal completion, you must output: <promise>YOUR_PHRASE</promise>

  Use this for:
  - Interactive iteration where you want to see progress
  - Tasks requiring self-correction and refinement
  - Complex multi-phase implementations

EXAMPLES:
  /ralph-loop Build a todo API --completion-promise 'DONE' --max-iterations 20
  /ralph-loop --max-iterations 50 --checkpoint 10 Build auth system
  /ralph-loop Fix bugs until all tests pass --completion-promise 'ALL TESTS PASS'

MONITORING:
  # View current status dashboard:
  cat .claude/RALPH_STATUS.md

  # View session memory:
  cat .claude/RALPH_MEMORY.md

  # View current iteration:
  grep '^iteration:' .claude/ralph-loop.local.md

INTERVENTION:
  # Send a one-time instruction to the loop:
  /ralph-nudge "Focus on the authentication module first"

  # Cancel the loop:
  /cancel-ralph
HELP_EOF
      exit 0
      ;;
    --max-iterations)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --max-iterations requires a number argument" >&2
        exit 1
      fi
      if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "❌ Error: --max-iterations must be a positive integer or 0, got: $2" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --completion-promise)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --completion-promise requires a text argument" >&2
        exit 1
      fi
      COMPLETION_PROMISE="$2"
      shift 2
      ;;
    --checkpoint)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --checkpoint requires a number argument" >&2
        exit 1
      fi
      if ! [[ "$2" =~ ^[0-9]+$ ]]; then
        echo "❌ Error: --checkpoint must be a positive integer, got: $2" >&2
        exit 1
      fi
      CHECKPOINT_INTERVAL="$2"
      shift 2
      ;;
    --checkpoint-mode)
      if [[ -z "${2:-}" ]]; then
        echo "❌ Error: --checkpoint-mode requires 'pause' or 'notify'" >&2
        exit 1
      fi
      if [[ "$2" != "pause" ]] && [[ "$2" != "notify" ]]; then
        echo "❌ Error: --checkpoint-mode must be 'pause' or 'notify', got: $2" >&2
        exit 1
      fi
      CHECKPOINT_MODE="$2"
      shift 2
      ;;
    *)
      # Non-option argument - collect all as prompt parts
      PROMPT_PARTS+=("$1")
      shift
      ;;
  esac
done

# Join all prompt parts with spaces
PROMPT="${PROMPT_PARTS[*]}"

# Validate prompt is non-empty
if [[ -z "$PROMPT" ]]; then
  echo "❌ Error: No prompt provided" >&2
  echo "" >&2
  echo "   Ralph needs a task description to work on." >&2
  echo "" >&2
  echo "   Examples:" >&2
  echo "     /ralph-loop Build a REST API for todos" >&2
  echo "     /ralph-loop Fix the auth bug --max-iterations 20" >&2
  echo "     /ralph-loop --completion-promise 'DONE' Refactor code" >&2
  echo "" >&2
  echo "   For all options: /ralph-loop --help" >&2
  exit 1
fi

# Create .claude directory
mkdir -p .claude

# Quote completion promise for YAML if it contains special chars or is not null
if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]]; then
  COMPLETION_PROMISE_YAML="\"$COMPLETION_PROMISE\""
else
  COMPLETION_PROMISE_YAML="null"
fi

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Create enhanced state file with new fields
cat > .claude/ralph-loop.local.md <<EOF
---
active: true
iteration: 1
max_iterations: $MAX_ITERATIONS
completion_promise: $COMPLETION_PROMISE_YAML
started_at: "$STARTED_AT"
checkpoint_interval: $CHECKPOINT_INTERVAL
checkpoint_mode: "$CHECKPOINT_MODE"
strategy:
  current: "explore"
  changed_at: 0
progress:
  stuck_count: 0
  velocity: "normal"
  last_meaningful_change: 0
phases: []
---

$PROMPT
EOF

# Generate session ID
SESSION_ID="ralph-$(date +%Y%m%d%H%M%S)-$(head -c 4 /dev/urandom | xxd -p)"

# Initialize RALPH_MEMORY.md
cat > .claude/RALPH_MEMORY.md <<EOF
---
session_id: "$SESSION_ID"
started_at: "$STARTED_AT"
last_updated: "$STARTED_AT"
---

# Ralph Session Memory

## Original Objective
$PROMPT

## Current Status
Session started - beginning exploration phase

## Accomplished
_Nothing yet_

## Failed Attempts
_None yet_

## Next Actions
1. Understand the task requirements
2. Explore the codebase for relevant files
3. Begin implementation

## Key Learnings
_None yet_

EOF

# Initialize RALPH_STATUS.md
cat > .claude/RALPH_STATUS.md <<EOF
# Ralph Status 🔄

_Last updated: $STARTED_AT

## Overview

| Metric | Value |
|--------|-------|
| Status | **RUNNING** |
| Iteration | 1$(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo " / $MAX_ITERATIONS"; fi) |
| Phase | explore |
| Runtime | 0s |
$(if [[ $CHECKPOINT_INTERVAL -gt 0 ]]; then echo "| Next Checkpoint | Iteration $CHECKPOINT_INTERVAL |"; fi)
| Errors | 0 |

## Recent Activity

| Iter | Time | Action | Status |
|------|------|--------|--------|
| 1 | $(date +%H:%M:%S) | Session started | ✅ |

---

**Commands:**
- \`/ralph-status\` - Refresh this view
- \`/ralph-nudge <instruction>\` - Send guidance
- \`/cancel-ralph\` - Stop the loop

EOF

# Output setup message
cat <<EOF
🔄 Ralph loop activated! (Enhanced v2)

Session ID: $SESSION_ID
Iteration: 1
Max iterations: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo "unlimited"; fi)
Completion promise: $(if [[ "$COMPLETION_PROMISE" != "null" ]]; then echo "${COMPLETION_PROMISE//\"/} (ONLY output when TRUE!)"; else echo "none"; fi)
$(if [[ $CHECKPOINT_INTERVAL -gt 0 ]]; then echo "Checkpoint: Every $CHECKPOINT_INTERVAL iterations ($CHECKPOINT_MODE mode)"; fi)

📊 Monitor: cat .claude/RALPH_STATUS.md
📝 Memory:  cat .claude/RALPH_MEMORY.md
🛑 Cancel:  /cancel-ralph

The stop hook is now active. Context will be managed across iterations
with goal recitation and adaptive strategies.

⚠️  WARNING: This loop cannot be stopped manually unless you set
    --max-iterations or --completion-promise.

🔄
EOF

# Output the initial prompt
if [[ -n "$PROMPT" ]]; then
  echo ""
  echo "$PROMPT"
fi
