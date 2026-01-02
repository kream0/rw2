#!/usr/bin/env bun
/**
 * Ralph Wiggum - Post-Loop Summary Generator
 *
 * Generates a comprehensive summary when the loop ends.
 * Analyzes the full session to provide insights.
 *
 * Usage: bun run generate-summary.ts [memory_path] [output_path]
 * Input: Optional state JSON via stdin
 * Output: RALPH_SUMMARY.md file
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

interface SummaryInput {
  memory_path?: string;
  status_path?: string;
  state_path?: string;
  completion_reason?: "promise" | "max_iterations" | "cancelled" | "error";
  final_iteration?: number;
}

const DEFAULT_MEMORY_PATH = ".claude/RALPH_MEMORY.md";
const DEFAULT_OUTPUT_PATH = ".claude/RALPH_SUMMARY.md";

function parseMemoryFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const content = readFileSync(path, "utf-8");
  const sections: Record<string, string> = {};

  // Skip frontmatter
  const bodyMatch = content.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // Parse sections
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

  return sections;
}

function countListItems(text: string | undefined): number {
  if (!text) return 0;
  return text.split("\n").filter((line) => line.startsWith("- ")).length;
}

function extractAccomplishments(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      // Remove iteration prefix if present
      return line.replace(/^- \[Iteration \d+\] /, "- ");
    });
}

function determineOutcome(
  sections: Record<string, string>,
  reason: string
): { emoji: string; label: string; description: string } {
  const accomplishments = countListItems(sections["Accomplished"]);
  const failures = countListItems(sections["Failed Attempts"]);

  if (reason === "promise") {
    return {
      emoji: "✅",
      label: "COMPLETED",
      description: "Loop ended successfully via completion promise",
    };
  }

  if (reason === "cancelled") {
    return {
      emoji: "⏹️",
      label: "CANCELLED",
      description: "Loop was manually cancelled",
    };
  }

  if (reason === "max_iterations") {
    if (accomplishments > failures) {
      return {
        emoji: "⚠️",
        label: "PARTIAL",
        description: "Max iterations reached with partial progress",
      };
    }
    return {
      emoji: "❌",
      label: "INCOMPLETE",
      description: "Max iterations reached without completion",
    };
  }

  if (reason === "error") {
    return {
      emoji: "💥",
      label: "ERROR",
      description: "Loop terminated due to error",
    };
  }

  return {
    emoji: "❓",
    label: "UNKNOWN",
    description: "Loop ended for unknown reason",
  };
}

function generateSummary(input: SummaryInput): string {
  const memoryPath = input.memory_path || DEFAULT_MEMORY_PATH;
  const sections = parseMemoryFile(memoryPath);

  const completionReason = input.completion_reason || "unknown";
  const outcome = determineOutcome(sections, completionReason);

  const accomplishments = extractAccomplishments(sections["Accomplished"]);
  const learnings = extractAccomplishments(sections["Key Learnings"]);
  const failedCount = countListItems(sections["Failed Attempts"]);

  const lines: string[] = [];

  // Header
  lines.push(`# Ralph Session Summary ${outcome.emoji}`);
  lines.push("");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push("");

  // Outcome box
  lines.push("## Outcome");
  lines.push("");
  lines.push(`**Status:** ${outcome.label}`);
  lines.push(`**Reason:** ${outcome.description}`);
  if (input.final_iteration) {
    lines.push(`**Total Iterations:** ${input.final_iteration}`);
  }
  lines.push("");

  // Original objective
  if (sections["Original Objective"]) {
    lines.push("## Original Objective");
    lines.push("");
    lines.push(sections["Original Objective"]);
    lines.push("");
  }

  // Final status
  if (sections["Current Status"]) {
    lines.push("## Final Status");
    lines.push("");
    lines.push(sections["Current Status"]);
    lines.push("");
  }

  // Accomplishments
  lines.push("## Accomplishments");
  lines.push("");
  if (accomplishments.length === 0) {
    lines.push("_No accomplishments recorded_");
  } else {
    for (const item of accomplishments) {
      lines.push(item);
    }
  }
  lines.push("");

  // Statistics
  lines.push("## Statistics");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Iterations | ${input.final_iteration || "Unknown"} |`);
  lines.push(`| Accomplishments | ${accomplishments.length} |`);
  lines.push(`| Failed Attempts | ${failedCount} |`);
  lines.push(`| Learnings | ${learnings.length} |`);
  lines.push("");

  // Key learnings
  if (learnings.length > 0) {
    lines.push("## Key Learnings");
    lines.push("");
    for (const learning of learnings) {
      lines.push(learning);
    }
    lines.push("");
  }

  // Recommendations for next session
  lines.push("## Recommendations for Next Session");
  lines.push("");

  if (outcome.label === "COMPLETED") {
    lines.push("- Review the implemented solution for edge cases");
    lines.push("- Consider adding tests if not already present");
    lines.push("- Document any API changes or new features");
  } else if (outcome.label === "PARTIAL" || outcome.label === "INCOMPLETE") {
    lines.push("- Review failed attempts to avoid repeating mistakes");
    lines.push("- Consider breaking the task into smaller subtasks");
    lines.push("- Check if the original objective needs refinement");
    if (failedCount > 3) {
      lines.push("- Multiple failures suggest the approach may need rethinking");
    }
  } else if (outcome.label === "CANCELLED") {
    lines.push("- Determine if the task is still needed");
    lines.push("- Consider what prompted the cancellation");
    lines.push("- Review partial progress before starting again");
  }
  lines.push("");

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("_This summary was auto-generated by Ralph Wiggum._");
  lines.push("_Review RALPH_MEMORY.md for full session history._");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const memoryPath = process.argv[2] || DEFAULT_MEMORY_PATH;
  const outputPath = process.argv[3] || DEFAULT_OUTPUT_PATH;

  // Try to read input from stdin (optional)
  let input: SummaryInput = { memory_path: memoryPath };

  try {
    const chunks: Buffer[] = [];
    // Use a timeout to check if there's stdin data
    const hasStdin = await Promise.race([
      (async () => {
        for await (const chunk of Bun.stdin.stream()) {
          chunks.push(chunk);
          return true;
        }
        return chunks.length > 0;
      })(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);

    if (hasStdin && chunks.length > 0) {
      const inputText = Buffer.concat(chunks).toString("utf-8").trim();
      if (inputText) {
        input = { ...input, ...JSON.parse(inputText) };
      }
    }
  } catch {
    // No stdin or invalid JSON - use defaults
  }

  try {
    const summary = generateSummary(input);
    writeFileSync(outputPath, summary);

    console.log(
      JSON.stringify({
        path: outputPath,
        status: "generated",
        outcome: input.completion_reason || "unknown",
      })
    );
  } catch (error) {
    console.error("Error generating summary:", error);
    process.exit(1);
  }
}

main();
