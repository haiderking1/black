/** Abort before awaiting generator.return(): next() may be blocked in a tool. */
export function abortableEvents<T>(events: AsyncGenerator<T>, abort: () => void): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => events.next(),
        return: () => { abort(); return events.return(undefined) },
        throw: (error: unknown) => { abort(); return events.throw(error) },
      }
    },
  }
}
