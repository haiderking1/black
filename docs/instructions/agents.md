# AGENTS.md instructions

Settings → Instructions has a Global section and an expandable section for every saved project. Each project shows its selected files or indicates that it uses global instructions. Global files are edited once in the Global section. Sections load on first expansion and retain drafts when collapsed. Expand a file to read or edit it, then Save. The view includes empty files, since an empty project file still replaces global instructions. Saved changes apply on the next model round. Reload rereads disk; unsaved edits require confirmation before leaving or reloading. Saves reject stale revisions rather than silently overwriting detected external changes.

black loads `AGENTS.md` files from the filesystem root down to the active working directory. If any exist, `~/.black/AGENTS.md` is excluded entirely. The global file is a fallback only when no workspace or ancestor instruction file exists. An empty project file also disables the global fallback. Closer directory instructions take precedence within their scope.

The server reloads these files before each model round and places them in a `<runtime_policy>` section of its system prompt. The same policy is included in compute’s tool description for that round, replacing hardcoded personal rules. It is request-local and is not shared across projects. These instructions are separate from conversation history, so compaction does not remove them. Ordinary nonstreaming chat also receives them. Session naming and compaction summarization do not.

The server adopts the loaded content as direct system instructions, without source-file labels or configuration records. These rules take precedence over all earlier application defaults, not just persona or style. The policy tells the assistant to follow them on every round and explain conflicts rather than silently dropping instructions. This is prompt enforcement, not a mechanical guarantee that generated code obeys prose rules.

Nested instruction files below the working directory are not loaded indiscriminately. The assistant is instructed to check the directories leading to each target file before editing it and apply those instructions only within their scope. This check depends on the assistant using its tools.

Each file must be a regular UTF-8 file of at most 128 KiB. Combined files may occupy at most 512 KiB. Invalid, unreadable, or oversized files fail the request rather than silently omitting rules. Symlink aliases are loaded once. Model context limits still apply to the resulting prompt.
