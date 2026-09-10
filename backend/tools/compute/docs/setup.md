# Setup

Compute is registered in black’s backend tool registry. The build ships worker.mjs and runtime/errors.mjs beside the main bundle. Electron runs the worker with ELECTRON_RUN_AS_NODE; development tests use Node. BLACK_COMPUTE_NODE overrides the worker executable.

Web tools are discovered at app startup. EXA_MCP_URL overrides the endpoint and EXA_API_KEY supplies an optional credential. Keep credentials outside the repository. Workspace and process methods remain available when web discovery fails.

Images use black’s image decoder and resize pipeline. Non-vision models receive the text note without image attachments.
