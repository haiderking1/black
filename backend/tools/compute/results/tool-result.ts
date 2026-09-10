import type { ComputeToolResult } from "../core/result.ts";

export function toolText(text: string, details?: unknown): ComputeToolResult {
	return { content: [{ type: "text", text }], details: details ?? null };
}

export function toolValue(value: unknown): ComputeToolResult {
	// `content` is empty and `details.codeModeValue` carries the raw value; the
	// worker's invoke() unwraps it so the plan receives the concrete value.
	return { content: [], details: { codeModeValue: value } as unknown };
}

export function toolError(text: string, details?: unknown): ComputeToolResult {
	return { content: [{ type: "text", text }], details: details ?? null, isError: true };
}
