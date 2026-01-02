---
description: "Explain Ralph Wiggum technique and available commands"
---

# Ralph Wiggum Plugin Help (v2)

Please explain the following to the user:

## What is the Ralph Wiggum Technique?

The Ralph Wiggum technique is an iterative development methodology based on continuous AI loops, pioneered by Geoffrey Huntley.

**Core concept:**
```bash
while :; do
  cat PROMPT.md | claude-code --continue
done
```

The same prompt is fed to Claude repeatedly. The "self-referential" aspect comes from Claude seeing its own previous work in the files and git history, not from feeding output back as input.

**Each iteration:**
1. Claude receives the SAME prompt
2. Works on the task, modifying files
3. Tries to exit
4. Stop hook intercepts and feeds the same prompt again
5. Claude sees its previous work in the files
6. Iteratively improves until completion

The technique is described as "deterministically bad in an undeterministic world" - failures are predictable, enabling systematic improvement through prompt tuning.

## v2 Enhancements: Context Management

The enhanced plugin implements **deliberate malloc** - careful management of context across iterations:

### RALPH_MEMORY.md
Persistent memory file that survives /compact. Tracks:
- Original objective (never changes)
- Current status
- Accomplished items
- Failed attempts
- Next actions
- Key learnings

### RALPH_STATUS.md
Real-time dashboard showing:
- Current iteration and phase
- Recent activity
- Error patterns
- Files changed

### Adaptive Strategies
The loop automatically adjusts its approach:
- **Explore** (iterations 1-10): Try different approaches
- **Focused** (iterations 11-35): Commit to best approach
- **Cleanup** (iterations 36+): Finish incomplete work
- **Recovery**: Triggered by repeated errors

### Goal Recitation
Each iteration receives a formatted context block with:
- Original mission
- Current status from memory
- Next actions
- Strategy guidance
- Key learnings (to avoid repeating mistakes)

---

## Available Commands

### /ralph-loop <PROMPT> [OPTIONS]

Start a Ralph loop in your current session.

**Usage:**
```
/ralph-loop "Refactor the cache layer" --max-iterations 20
/ralph-loop "Add tests" --completion-promise "TESTS COMPLETE"
/ralph-loop "Build auth" --checkpoint 10 --max-iterations 50
```

**Options:**
- `--max-iterations <n>` - Max iterations before auto-stop
- `--completion-promise <text>` - Promise phrase to signal completion
- `--checkpoint <n>` - Pause for review every N iterations
- `--checkpoint-mode <pause|notify>` - Checkpoint behavior

**How it works:**
1. Creates state file and initializes memory
2. You work on the task
3. When you try to exit, stop hook intercepts
4. Analyzes transcript for errors and progress
5. Updates memory and status dashboard
6. Determines strategy based on iteration/errors
7. Builds enhanced context with goal recitation
8. Continues until promise detected or max iterations

---

### /cancel-ralph

Cancel an active Ralph loop.

**Usage:**
```
/cancel-ralph
```

---

### /ralph-status

View the status dashboard.

**Usage:**
```
/ralph-status
```

Shows iteration, phase, recent activity, errors, and files changed.

---

### /ralph-nudge <instruction>

Send a one-time instruction to the loop.

**Usage:**
```
/ralph-nudge "Focus on the authentication module first"
/ralph-nudge "Skip the tests for now, prioritize core functionality"
```

The instruction is injected as a priority message in the next iteration, then removed.

---

### /ralph-checkpoint <action>

Manage checkpoint pauses.

**Usage:**
```
/ralph-checkpoint status    # View checkpoint info
/ralph-checkpoint continue  # Resume after checkpoint
```

---

## Key Concepts

### Completion Promises

To signal completion, Claude must output a `<promise>` tag:

```
<promise>TASK COMPLETE</promise>
```

The stop hook looks for this specific tag. Without it (or `--max-iterations`), Ralph runs infinitely.

### Context Files

| File | Purpose |
|------|---------|
| `.claude/ralph-loop.local.md` | Active loop state (iteration, config) |
| `.claude/RALPH_MEMORY.md` | Persistent session memory |
| `.claude/RALPH_STATUS.md` | Real-time dashboard |
| `.claude/RALPH_NUDGE.md` | One-time instruction (auto-deleted) |
| `.claude/RALPH_SUMMARY.md` | Post-loop summary |

### Self-Reference Mechanism

The "loop" doesn't mean Claude talks to itself. It means:
- Same prompt repeated
- Claude's work persists in files
- Each iteration sees previous attempts
- Memory file tracks progress across /compact

## Example

### Interactive Bug Fix with Monitoring

```
/ralph-loop "Fix the token refresh logic in auth.ts. Output <promise>FIXED</promise> when all tests pass." --completion-promise "FIXED" --max-iterations 20 --checkpoint 5
```

Monitor progress:
```
/ralph-status
```

Send guidance if stuck:
```
/ralph-nudge "Try using the refresh token stored in localStorage"
```

## When to Use Ralph

**Good for:**
- Well-defined tasks with clear success criteria
- Tasks requiring iteration and refinement
- Iterative development with self-correction
- Greenfield projects

**Not good for:**
- Tasks requiring human judgment or design decisions
- One-shot operations
- Tasks with unclear success criteria
- Debugging production issues (use targeted debugging instead)

## Learn More

- Original technique: https://ghuntley.com/ralph/
- Ralph Orchestrator: https://github.com/mikeyobrien/ralph-orchestrator
