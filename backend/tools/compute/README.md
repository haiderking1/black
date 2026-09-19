# Compute

The user-built compute tool, copied into black and adapted at the host boundary. Its worker, provider bridge, schemas, output recovery, and tests live here.

The model calls compute with a title, an async arrow function, and an optional timeout. Type annotations in that plan are erased before the worker runs it. Workspace, process, and discovered web methods are available inside the plan. Only its returned value reaches the model.

See docs/setup.md and docs/testing.md.
