export type SchedulePublication = (publish: () => void) => () => void

/** Frames may pause in a background window. The timer still publishes progress. */
const nextFrame: SchedulePublication = publish => {
  let frame: number | undefined
  const cancel = () => {
    clearTimeout(timer)
    if (frame !== undefined) cancelAnimationFrame(frame)
  }
  const run = () => { cancel(); publish() }
  const timer = setTimeout(run, 50)
  if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(run)
  return cancel
}

/** Coalesce notifications only. The caller's authoritative state updates immediately. */
export function createFramePublisher(publish: () => void, schedule: SchedulePublication = nextFrame) {
  let cancel: (() => void) | undefined
  function flush() {
    if (cancel === undefined) return
    const stop = cancel
    cancel = undefined
    stop()
    publish()
  }
  return {
    schedule() { cancel ??= schedule(flush) },
    flush,
    cancel() { const stop = cancel; cancel = undefined; stop?.() },
  }
}
