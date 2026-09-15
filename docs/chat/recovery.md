# Interrupted conversations

Changed messages are saved synchronously to black_conversation_recovery_v1 as they arrive. This includes unfinished assistant turns, partial text, reasoning, and announced tool arguments. The recovery copy contains only changes since the last successful full history save, not unrelated conversations.

On startup, recovery records are merged into the saved history before hydration. Active turns become Interrupted while keeping their recorded content and tool calls. No command is replayed. Unfinished tool rows can be expanded to inspect their arguments even when no result arrived.

Full conversation saves remain periodic during streaming and immediate on normal terminal events. Recovery records are removed only after the full snapshot succeeds. Explicit message/session deletion and compaction are recorded too, so recovery does not resurrect deliberately removed entries. Loading history no longer silently discards messages beyond the most recent 200.

Recovery depends on browser storage being available and having space. Save failures retain the in-memory conversation and are reported in the console. Data never received by the renderer cannot be recovered by this mechanism. Browser storage also cannot guarantee durability against power loss or a kill before its own disk writes complete.
