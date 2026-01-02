#!/usr/bin/env bun
/**
 * Ralph Wiggum - Memory Manager
 *
 * Updates RALPH_MEMORY.md with iteration summaries.
 * This file persists across iterations and survives /compact.
 *
 * Usage: echo '<input_json>' | bun run update-memory.ts [memory_path]
 * Input: JSON with state, analysis, and optional iteration summary
 * Output: Updated RALPH_MEMORY.md path and summary stats
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import type { RalphMemory, RalphState, TranscriptAnalysis } from "./types";

interface MemoryInput {
  state: RalphState;
  analysis: TranscriptAnalysis;
  iteration_summary?: string;
  next_actions?: string[];
  learnings?: string[];
}

const DEFAULT_MEMORY_PATH = ".claude/RALPH_MEMORY.md";

function parseMemoryFile(path: string): RalphMemory | null {
  if (!existsSync(path)) {
    return null;
  }

  const content = readFileSync(path, "utf-8");

  // Parse YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length).trim();

  // Extract frontmatter values
  const sessionIdMatch = frontmatter.match(/session_id:\s*"?([^"\n]+)"?/);
  const startedAtMatch = frontmatter.match(/started_at:\s*"?([^"\n]+)"?/);

  // Parse body sections
  const sections: Record<string, string> = {};
  const sectionRegex = /^## (.+)$/gm;
  let lastSection = "";
  let lastIndex = 0;

  let match;
  while ((match = sectionRegex.exec(body)) !== null) {
    if (lastSection) {
      sections[lastSection] = body.slice(lastIndex, match.index).trim();
    }
    lastSection = match[1];
    lastIndex = match.index + match[0].length;
  }
  if (lastSection) {
    sections[lastSection] = body.slice(lastIndex).trim();
  }

  // Parse list items from sections
  const parseListItems = (text: string): string[] => {
    if (!text) return [];
    return text
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());
  };

  // Parse accomplished items with iteration numbers
  const parseAccomplished = (text: string): Array<{ iteration: number; description: string }> => {
    if (!text) return [];
    return text
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => {
        const match = line.match(/^- \[Iteration (\d+)\] (.+)$/);
        if (match) {
          return { iteration: parseInt(match[1]), description: match[2] };
        }
        return { iteration: 0, description: line.slice(2) };
      });
  };

  // Parse failed attempts with learning
  const parseFailed = (
    text: string
  ): Array<{ iteration: number; description: string; learning?: string }> => {
    if (!text) return [];
    return text
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => {
        const match = line.match(/^- \[Iteration (\d+)\] (.+?)(?: \| Learning: (.+))?$/);
        if (match) {
          return {
            iteration: parseInt(match[1]),
            description: match[2],
            learning: match[3],
          };
        }
        return { iteration: 0, description: line.slice(2) };
      });
  };

  return {
    session_id: sessionIdMatch?.[1] || "",
    started_at: startedAtMatch?.[1] || "",
    last_updated: new Date().toISOString(),
    current_iteration: 0,
    original_objective: sections["Original Objective"] || "",
    current_status: sections["Current Status"] || "",
    accomplished: parseAccomplished(sections["Accomplished"]),
    failed_attempts: parseFailed(sections["Failed Attempts"]),
    next_actions: parseListItems(sections["Next Actions"]),
    key_learnings: parseListItems(sections["Key Learnings"]),
  };
}

function formatMemoryFile(memory: RalphMemory): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`session_id: "${memory.session_id}"`);
  lines.push(`started_at: "${memory.started_at}"`);
  lines.push(`last_updated: "${memory.last_updated}"`);
  lines.push("---");
  lines.push("");

  // Title
  lines.push("# Ralph Session Memory");
  lines.push("");

  // Original Objective (never modified after init)
  lines.push("## Original Objective");
  lines.push(memory.original_objective || "_Not set_");
  lines.push("");

  // Current Status
  lines.push("## Current Status");
  lines.push(memory.current_status || "_No status yet_");
  lines.push("");

  // Accomplished
  lines.push("## Accomplished");
  if (memory.accomplished.length === 0) {
    lines.push("_Nothing yet_");
  } else {
    for (const item of memory.accomplished) {
      lines.push(`- [Iteration ${item.iteration}] ${item.description}`);
    }
  }
  lines.push("");

  // Failed Attempts
  lines.push("## Failed Attempts");
  if (memory.failed_attempts.length === 0) {
    lines.push("_None yet_");
  } else {
    for (const item of memory.failed_attempts) {
      let line = `- [Iteration ${item.iteration}] ${item.description}`;
      if (item.learning) {
        line += ` | Learning: ${item.learning}`;
      }
      lines.push(line);
    }
  }
  lines.push("");

  // Next Actions
  lines.push("## Next Actions");
  if (memory.next_actions.length === 0) {
    lines.push("1. _Determine next steps_");
  } else {
    for (let i = 0; i < memory.next_actions.length; i++) {
      lines.push(`${i + 1}. ${memory.next_actions[i]}`);
    }
  }
  lines.push("");

  // Key Learnings
  lines.push("## Key Learnings");
  if (memory.key_learnings.length === 0) {
    lines.push("_None yet_");
  } else {
    for (const learning of memory.key_learnings) {
      lines.push(`- ${learning}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

function generateSessionId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 6);
  return `ralph-${timestamp}-${random}`;
}

function updateMemory(
  existing: RalphMemory | null,
  input: MemoryInput
): RalphMemory {
  const now = new Date().toISOString();
  const iteration = input.state.iteration;

  if (!existing) {
    // Initialize new memory file
    return {
      session_id: generateSessionId(),
      started_at: input.state.started_at || now,
      last_updated: now,
      current_iteration: iteration,
      original_objective: input.state.prompt_text || "",
      current_status: input.iteration_summary || "Session started",
      accomplished: [],
      failed_attempts: [],
      next_actions: input.next_actions || [],
      key_learnings: [],
    };
  }

  // Update existing memory
  const updated = { ...existing };
  updated.last_updated = now;
  updated.current_iteration = iteration;

  // Update status
  if (input.iteration_summary) {
    updated.current_status = input.iteration_summary;
  }

  // Add accomplished items based on analysis
  if (input.analysis.meaningful_changes) {
    const accomplishment = {
      iteration,
      description: summarizeProgress(input),
    };
    updated.accomplished.push(accomplishment);
  }

  // Track failed attempts from errors
  if (input.analysis.errors.length > 0 && !input.analysis.meaningful_changes) {
    const failure = {
      iteration,
      description: `Encountered ${input.analysis.errors.length} error(s)`,
      learning: input.analysis.errors[0]?.pattern,
    };
    updated.failed_attempts.push(failure);
  }

  // Update next actions
  if (input.next_actions && input.next_actions.length > 0) {
    updated.next_actions = input.next_actions;
  }

  // Add new learnings
  if (input.learnings) {
    for (const learning of input.learnings) {
      if (!updated.key_learnings.includes(learning)) {
        updated.key_learnings.push(learning);
      }
    }
  }

  // Keep lists manageable (last N items)
  const MAX_ITEMS = 20;
  if (updated.accomplished.length > MAX_ITEMS) {
    updated.accomplished = updated.accomplished.slice(-MAX_ITEMS);
  }
  if (updated.failed_attempts.length > MAX_ITEMS) {
    updated.failed_attempts = updated.failed_attempts.slice(-MAX_ITEMS);
  }
  if (updated.key_learnings.length > MAX_ITEMS) {
    updated.key_learnings = updated.key_learnings.slice(-MAX_ITEMS);
  }

  return updated;
}

function summarizeProgress(input: MemoryInput): string {
  const parts: string[] = [];

  if (input.analysis.files_modified.length > 0) {
    parts.push(`Modified ${input.analysis.files_modified.length} file(s)`);
  }

  if (input.analysis.tests_run) {
    if (input.analysis.tests_passed) {
      parts.push("tests passing");
    } else if (input.analysis.tests_failed) {
      parts.push("tests failing");
    } else {
      parts.push("tests run");
    }
  }

  if (input.analysis.phase_completions.length > 0) {
    parts.push(`completed: ${input.analysis.phase_completions.join(", ")}`);
  }

  return parts.length > 0 ? parts.join("; ") : "Made progress";
}

async function main() {
  const memoryPath = process.argv[2] || DEFAULT_MEMORY_PATH;

  // Read input from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  const inputText = Buffer.concat(chunks).toString("utf-8").trim();

  if (!inputText) {
    console.error("Usage: echo '<input_json>' | bun run update-memory.ts [memory_path]");
    process.exit(1);
  }

  try {
    const input: MemoryInput = JSON.parse(inputText);

    if (!input.state || !input.analysis) {
      console.error("Input must contain 'state' and 'analysis' fields");
      process.exit(1);
    }

    // Parse existing memory or create new
    const existing = parseMemoryFile(memoryPath);
    const updated = updateMemory(existing, input);

    // Write updated memory
    writeFileSync(memoryPath, formatMemoryFile(updated));

    // Output summary
    console.log(
      JSON.stringify({
        path: memoryPath,
        session_id: updated.session_id,
        iteration: updated.current_iteration,
        accomplished_count: updated.accomplished.length,
        failed_count: updated.failed_attempts.length,
        status: "updated",
      })
    );
  } catch (error) {
    console.error("Error updating memory:", error);
    process.exit(1);
  }
}

main();
