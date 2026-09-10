export interface ComputeToolResult {
 content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
 details?: unknown;
 isError?: boolean;
}
