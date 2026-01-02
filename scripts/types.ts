/**
 * Ralph Wiggum Plugin - Shared Types
 * TypeScript + Bun implementation
 */

// ===== State File Types =====

export interface RalphState {
  active: boolean;
  iteration: number;
  max_iterations: number;
  completion_promise: string | null;
  started_at: string;
  checkpoint_interval: number;
  checkpoint_mode: "pause" | "notify";
  strategy: {
    current: Strategy;
    changed_at: number;
  };
  progress: {
    stuck_count: number;
    velocity: "fast" | "normal" | "slow" | "stalled";
    last_meaningful_change: number;
  };
  phases: Phase[];
  prompt_text: string;
}

export type Strategy = "explore" | "focused" | "cleanup" | "recovery";

export interface Phase {
  name: string;
  completed: boolean;
  started_at_iteration?: number;
  completed_at_iteration?: number;
}

// ===== Transcript Analysis Types =====

export interface TranscriptAnalysis {
  errors: ErrorEntry[];
  repeated_errors: RepeatedError[];
  files_modified: string[];
  tests_run: boolean;
  tests_passed: boolean;
  tests_failed: boolean;
  phase_completions: string[];
  meaningful_changes: boolean;
}

export interface ErrorEntry {
  pattern: string;
  sample: string;
  iteration?: number;
}

export interface RepeatedError {
  pattern: string;
  count: number;
}

// ===== Strategy Engine Types =====

export interface StrategyResult {
  strategy: Strategy;
  reason: string;
  action: "continue" | "switch";
  guidance: string[];
}

// ===== Memory File Types =====

export interface RalphMemory {
  session_id: string;
  started_at: string;
  last_updated: string;
  current_iteration: number;
  original_objective: string;
  current_status: string;
  accomplished: AccomplishedItem[];
  failed_attempts: FailedAttempt[];
  next_actions: string[];
  key_learnings: string[];
}

export interface AccomplishedItem {
  iteration: number;
  description: string;
}

export interface FailedAttempt {
  iteration: number;
  description: string;
  learning?: string;
}

// ===== Hook Input/Output Types =====

export interface StopHookInput {
  transcript_path: string;
  stop_hook_active?: boolean;
}

export interface StopHookOutput {
  decision: "block" | "allow";
  reason?: string;        // Prompt to feed back
  systemMessage?: string; // Short status shown to user
}

// ===== Status Dashboard Types =====

export interface RalphStatus {
  last_updated: string;
  status: "running" | "paused" | "completed" | "cancelled";
  iteration: number;
  max_iterations: number;
  phase: string;
  started_at: string;
  runtime_seconds: number;
  next_checkpoint: number | null;
  recent_activity: ActivityEntry[];
  error_count: number;
  error_patterns: string[];
  files_changed: string[];
}

export interface ActivityEntry {
  iteration: number;
  time: string;
  action: string;
  status: "OK" | "ERROR" | "RETRY";
}

// ===== Error Pattern Definitions =====

export const ERROR_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /error TS\d+:/i, label: "TypeScript compilation error" },
  { regex: /SyntaxError:/i, label: "JavaScript syntax error" },
  { regex: /ModuleNotFoundError:/i, label: "Python import error" },
  { regex: /FAILED.*test/i, label: "Test failure" },
  { regex: /timed?\s*out/i, label: "Timeout error" },
  { regex: /ENOENT:/i, label: "File not found" },
  { regex: /permission denied/i, label: "Permission error" },
  { regex: /Cannot find module/i, label: "Module resolution error" },
  { regex: /undefined is not/i, label: "Undefined reference error" },
  { regex: /Maximum call stack/i, label: "Stack overflow" },
];
