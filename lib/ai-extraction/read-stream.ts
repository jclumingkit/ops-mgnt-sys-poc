const parseEvent = (record: string) => {
  const lines = record.split(/\r?\n/)
  const name = lines.find((line) => line.startsWith("event:"))?.slice(6).trim()
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n")
  if (!name || !data) throw new Error("Malformed extraction stream event")

  const parsed: unknown = JSON.parse(data)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Malformed extraction stream data")
  }
  return { name, data: parsed as Record<string, unknown> }
}

// Keep incomplete SSE records between chunks; always release the reader.
export const readExtractionStream = async function* (body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const records = buffer.split(/\r?\n\r?\n/)
      buffer = records.pop() ?? ""
      for (const record of records) {
        if (record.trim()) yield parseEvent(record)
      }
      if (done) break
    }
    if (buffer.trim()) yield parseEvent(buffer)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
