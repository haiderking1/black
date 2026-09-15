# Streaming updates

Every received event updates the in-memory conversation immediately, in transport order. React receives the latest state once per animation frame instead of rendering each delta. A 50 ms timer provides a fallback when frames pause. This changes notification frequency, not model output speed or the text retained.

Full conversation storage keeps its existing format. Streaming changes schedule at most one full-history save per second, reading the latest state when the save runs. Each changed message also gets a synchronous recovery copy, including unfinished tool arguments. Completion, Stop, errors, disconnection, page hide, window hiding, and hook cleanup flush pending changes. The send queue flushes before advancing. Recovery records are cleared only after a successful full save and merged back on startup. See recovery.md for storage limits.

Context history is constructed after the existing 400 ms settling period, rather than serialized on every render.

The server buffers up to 64 stream events with backpressure. Available events travel in the same RPC chunk, reducing acknowledgement round trips. It does not wait for a full batch, drop events, disable acknowledgements, or leave the producer running after stream cancellation.

## Checks

Scheduling, cancellation, and ordered delivery:

    bun test tests/chat/conversations tests/chat/streaming tests/serverWire.test.ts

Live persistence, terminal states, expansion, scroll, and keyboard checks:

    bun tests/working/browser/run.ts
