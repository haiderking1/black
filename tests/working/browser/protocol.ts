/** Minimal request/reply client for Chromium's local debugging socket. */
export async function connectProtocol(url: string) {
  const socket = new WebSocket(url)
  let nextId = 0
  const errors: unknown[] = []
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data))
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params)
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  }
  socket.onclose = () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Chromium disconnected')) }
    pending.clear()
  }
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error('Could not connect to Chromium'))
  })
  const send = (method: string, params: Record<string, unknown> = {}): Promise<any> => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)) }, 15000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
  return { send, errors, close: () => socket.close() }
}
