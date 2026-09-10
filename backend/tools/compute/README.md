# Compute

The user-built compute tool, copied into black and adapted at the host boundary. Its worker, provider bridge, schemas, output recovery, and tests live here.

The model calls compute with a title, an async JavaScript arrow function, and an optional timeout. Workspace, process, and discovered web methods are available inside that plan. Only its returned value reaches the model.

See docs/setup.md and docs/testing.md.
