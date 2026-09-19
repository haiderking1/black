const MAX_ERROR_BYTES = 16 * 1024;
const MAX_ERROR_LINES = 40;
export const PLAN_LINE_OFFSET = 2;

export class ProviderCallError extends Error {
  constructor(provider, method, message) {
    super(message);
    this.name = "ProviderCallError";
    this.provider = provider;
    this.method = method;
  }

  toJSON() {
    return { name: this.name, provider: this.provider, method: this.method, message: this.message };
  }
}

function field(error, key) {
  try {
    const value = error?.[key];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function formatLine(line, column) {
  if (line < 1) return "";
  return "\n[plan line " + line + (column ? ", column " + column : "") + "]";
}

function planLocation(error) {
  const stack = field(error, "stack")?.match(/compute-plan\.js:(\d+)(?::(\d+))?/);
  if (stack) return formatLine(Number(stack[1]) - PLAN_LINE_OFFSET, stack[2]);
  // Sucrase reports against the raw plan, not the wrapped vm filename.
  const stripped = field(error, "message")?.match(/compute-plan\.ts:[^]*?\((\d+):(\d+)\)/);
  if (stripped) return formatLine(Number(stripped[1]), stripped[2]);
  return "";
}

function bounded(text) {
  const suffix = "\n[error truncated]";
  const budget = MAX_ERROR_BYTES - Buffer.byteLength(suffix);
  let output = "", bytes = 0, lines = 1;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > budget || (char === "\n" && lines >= MAX_ERROR_LINES - 1)) return output + suffix;
    output += char;
    bytes += size;
    if (char === "\n") lines++;
  }
  return output;
}

export function formatPlanError(error, phase) {
  let message = field(error, "message");
  if (message === undefined) {
    try { message = String(error ?? "Unknown JavaScript error"); }
    catch { message = "Unknown JavaScript error"; }
  }
  const provider = field(error, "provider"), method = field(error, "method");
  if (provider && method) message = provider + "." + method + ": " + message;
  else {
    const name = field(error, "name");
    if (name && name !== "Error") message = name + ": " + message;
  }
  const guidance = phase === "compile"
    ? "Plan did not compile. Nothing ran. Pass one async arrow function expression, for example: async () => { return 42; }\nDo not add a semicolon after the closing brace, invoke the function, or use Markdown fences. Type annotations are erased before the plan runs; leftover syntax errors are JavaScript. Semicolons inside the body are valid. Fix the reported syntax before retrying.\n"
    : phase === "execute"
      ? "Plan execution failed. Earlier operations may have succeeded. Check the completed-call trace and current state before repeating writes or commands.\n"
      : "";
  return bounded(guidance + message + planLocation(error));
}
