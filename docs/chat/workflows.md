# Workflows

Settings > General > Workflow selects Compute or Standard. Compute remains the default for old settings and RPC callers. The choice persists across restarts. A turn captures the selected mode when it starts, including queued turns. Changing settings does not replace tools during an active turn.

Compute exposes only compute and its existing workspace, process, and discovered MCP methods. Standard exposes bash, read, write, edit, glob, and grep directly. Standard file tools reuse the compute workspace schemas, validation, image handling, and implementations. The backend uses the same mode for tool definitions, execution lookup, and system instructions. Global/project instructions still apply in both modes.

## Bash lifecycle

Standard bash adapts Pi’s shell discovery, process-group tracking, and child-wait handling. Its MIT license is retained in backend/tools/bash/LICENSE. Pi extension hooks, renderers, and Pi session environment variables are not part of this port.

Each call starts a fresh bash in the project directory. stdin is closed, except for legacy WSL command transport. Commands can use pipes, redirects, and environment assignments. An optional timeout is in seconds, with no default deadline. A foreground command can therefore run until it finishes or the user presses Stop.

On Unix, Stop and timeouts send SIGKILL to the process group, including ordinary children that ignore SIGTERM. Windows uses the trusted System32 taskkill executable with tree termination. SIGINT, SIGTERM, SIGHUP, and Electron shutdown clean up tracked groups. RPC consumer cancellation aborts the request before waiting for the generator to close, so a blocked tool cannot prevent cancellation.

After the shell exits, output pipes drain until they are idle for 100 ms, with a one-second absolute post-exit limit. Remaining background children in the process group are then killed. Background servers do not persist across calls. Processes deliberately escaping the group with a separate session are not covered by Unix process-group tracking.

Bash retains the last 2000 lines or 50 KiB and saves overflow to a private temporary file. Checked synchronous writes keep memory bounded under output floods. Output or spawn failures become tool errors; earlier side effects are not rolled back. Bash commands remain inspectable in their activity rows.

## Validation

Offline tests cover both mode registries, direct file operations, timeout and abort races, inherited pipes, output overflow, shutdown signals, RPC-consumer cancellation, and Node/Bun execution. Chromium checks settings persistence, full reload, reset, native keyboard selection, and narrow layouts. Process lifecycle tests were exercised on Linux; Windows-specific discovery and cleanup still need native Windows validation.
