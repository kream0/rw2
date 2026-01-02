#!/usr/bin/env bun
/**
 * Ralph Wiggum - Context Builder
 *
 * Builds the enhanced prompt with goal recitation for each iteration.
 * This is the core of "deliberate malloc" - carefully managing what
 * context is provided to maintain focus across iterations.
 *
 * Usage: echo '<input_json>' | bun run build-context.ts
 * Input: JSON with state, memory, strategy, analysis
 * Output: Formatted context string for the next iteration
 */

import { existsSync, readFileSync } from "fs";
import type {
  RalphState,
  RalphMemory,
  StrategyResult,
  TranscriptAnalysis,
} from "./types";

interface ContextInput {
  state: RalphState;
  memory?: RalphMemory;
  memory_path?: string;
  strategy: StrategyResult;
  analysis?: TranscriptAnalysis;
  nudge_content?: string;
}

const DIVIDER = "═".repeat(50);
const SECTION_DIVIDER = "─".repeat(40);

function loadMemory(path: string): RalphMemory | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8");

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const body = content.slice(frontmatterMatch[0].length).trim();

    // Extract sections
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

    return {
      session_id: "",
      started_at: "",
      last_updated: "",
      current_iteration: 0,
      original_objective: sections["Original Objective"] || "",
      current_status: sections["Current Status"] || "",
      accomplished: [],
      failed_attempts: [],
      next_actions: parseNumberedList(sections["Next Actions"]),
      key_learnings: parseList(sections["Key Learnings"]),
    };
  } catch {
    return null;
  }
}

function parseList(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((item) => item && !item.startsWith("_"));
}

function parseNumberedList(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .filter((line) => /^\d+\.\s/.test(line))
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter((item) => item && !item.startsWith("_"));
}

function buildContext(input: ContextInput): string {
  const { state, strategy } = input;
  const lines: string[] = [];

  // Load memory if path provided but not object
  let memory = input.memory;
  if (!memory && input.memory_path) {
    memory = loadMemory(input.memory_path);
  }

  // Header with iteration
  lines.push(DIVIDER);
  lines.push(`   RALPH ITERATION ${state.iteration}`);
  lines.push(`   Strategy: ${strategy.strategy.toUpperCase()}`);
  lines.push(DIVIDER);
  lines.push("");

  // One-time nudge (if present)
  if (input.nudge_content) {
    lines.push("## PRIORITY INSTRUCTION (ONE-TIME)");
    lines.push("");
    lines.push(input.nudge_content);
    lines.push("");
    lines.push(SECTION_DIVIDER);
    lines.push("");
  }

  // Mission / Original Objective
  lines.push("## YOUR MISSION");
  lines.push("");
  if (memory?.original_objective) {
    lines.push(memory.original_objective);
  } else if (state.prompt_text) {
    lines.push(state.prompt_text);
  } else {
    lines.push("_No objective recorded_");
  }
  lines.push("");

  // Current Status
  if (memory?.current_status) {
    lines.push("## CURRENT STATUS");
    lines.push("");
    lines.push(memory.current_status);
    lines.push("");
  }

  // Next Actions
  if (memory?.next_actions && memory.next_actions.length > 0) {
    lines.push("## NEXT ACTIONS");
    lines.push("");
    for (let i = 0; i < Math.min(memory.next_actions.length, 5); i++) {
      lines.push(`${i + 1}. ${memory.next_actions[i]}`);
    }
    lines.push("");
  }

  // Strategy guidance
  lines.push("## STRATEGY GUIDANCE");
  lines.push("");
  lines.push(`_Phase: ${strategy.strategy} - ${strategy.reason}_`);
  lines.push("");
  for (const guidance of strategy.guidance) {
    lines.push(`- ${guidance}`);
  }
  lines.push("");

  // Key learnings (to avoid repeating mistakes)
  if (memory?.key_learnings && memory.key_learnings.length > 0) {
    lines.push("## KEY LEARNINGS");
    lines.push("");
    for (const learning of memory.key_learnings.slice(-5)) {
      lines.push(`- ${learning}`);
    }
    lines.push("");
  }

  // Error context (if recent errors)
  if (input.analysis?.errors && input.analysis.errors.length > 0) {
    lines.push("## RECENT ERRORS (fix these!)");
    lines.push("");
    const uniqueErrors = [
      ...new Map(input.analysis.errors.map((e) => [e.pattern, e])).values(),
    ].slice(0, 3);
    for (const error of uniqueErrors) {
      lines.push(`- ${error.pattern}: ${error.sample}`);
    }
    lines.push("");
  }

  // Completion reminder
  if (state.completion_promise) {
    lines.push(SECTION_DIVIDER);
    lines.push("");
    lines.push(
      `**COMPLETION:** When done, output: \`<promise>${state.completion_promise}</promise>\``
    );
    lines.push("_Only output this when the statement is TRUE!_");
    lines.push("");
  }

  lines.push(DIVIDER);
  lines.push("");

  // Original prompt (the actual task)
  lines.push(state.prompt_text || "");

  return lines.join("\n");
}

async function main() {
  // Read input from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  const inputText = Buffer.concat(chunks).toString("utf-8").trim();

  if (!inputText) {
    console.error("Usage: echo '<input_json>' | bun run build-context.ts");
    console.error(
      "Input: JSON with state, strategy, and optionally memory/memory_path"
    );
    process.exit(1);
  }

  try {
    const input: ContextInput = JSON.parse(inputText);

    if (!input.state || !input.strategy) {
      console.error("Input must contain 'state' and 'strategy' fields");
      process.exit(1);
    }

    const context = buildContext(input);
    console.log(context);
  } catch (error) {
    console.error("Error building context:", error);
    process.exit(1);
  }
}

main();
