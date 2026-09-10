import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
export function workerPath(): string {
 const source = fileURLToPath(new URL("../worker.mjs", import.meta.url));
 return existsSync(source) ? source : fileURLToPath(new URL("./compute/worker.mjs", import.meta.url));
}
