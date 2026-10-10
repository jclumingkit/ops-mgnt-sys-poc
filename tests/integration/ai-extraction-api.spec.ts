import { expect, test } from "@playwright/test"

import { POST } from "../../app/api/ai-extraction/extract/route"
import { readExtractionStream } from "../../lib/ai-extraction/read-stream"
import { providerAttempts, providerCalls, providerCancellations } from "../fixtures/OpenRouter"

const result = {
  parent_name: "Jane Doe",
  child_name: "Sam",
  payer: "BCBS",
  follow_up_date: "2026-10-13",
}
const validOutput = JSON.stringify(result)
const extract = (body: unknown) => POST(new Request("http://localhost/api/ai-extraction/extract", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}))
const eventsFrom = async (response: Response) => (await response.text()).trim().split("\n\n").map((record) => {
  const [event, data] = record.split("\n")
  return { type: event.slice(7), data: JSON.parse(data.slice(6)) }
})

test("reads SSE records split across byte boundaries, including UTF-8 names", async () => {
  const bytes = new TextEncoder().encode('event: output_delta\r\ndata: {"text":"José"}\r\n\r\nevent: done\r\ndata: {"success":true}\r\n\r\n')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
      controller.close()
    },
  })
  const events = []
  for await (const event of readExtractionStream(stream)) events.push(event)
  expect(events).toEqual([
    { name: "output_delta", data: { text: "José" } },
    { name: "done", data: { success: true } },
  ])
  expect(stream.locked).toBe(false)
})

test.describe("AI extraction API with a controlled provider", () => {
  const originalKey = process.env.OPENROUTER_API_KEY
  const originalTimeout = process.env.AI_EXTRACTION_TIMEOUT_MS

  test.beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "dummy-test-key"
    process.env.AI_EXTRACTION_TIMEOUT_MS = "250"
    providerAttempts.length = 0
    providerCalls.length = 0
    providerCancellations.length = 0
  })

  test.afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = originalKey
    if (originalTimeout === undefined) delete process.env.AI_EXTRACTION_TIMEOUT_MS
    else process.env.AI_EXTRACTION_TIMEOUT_MS = originalTimeout
  })

  test("rejects blank, malformed, and oversized input before calling the provider", async () => {
    for (const body of [{ notes: " " }, { notes: 42 }, {}, [], { notes: "a".repeat(20_001) }]) {
      const response = await extract(body)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: "EXTRACTION_INPUT_INVALID" })
    }
    const malformed = await POST(new Request("http://localhost", { method: "POST", body: "{" }))
    expect(malformed.status).toBe(400)
    expect(providerCalls).toHaveLength(0)
  })

  test("handles missing provider configuration with HTTP 503", async () => {
    delete process.env.OPENROUTER_API_KEY
    const response = await extract({ notes: "Mock call notes" })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: "EXTRACTION_PROVIDER_UNAVAILABLE" })
    expect(providerCalls).toHaveLength(0)
  })

  test("streams and returns the four validated fields with strict provider formatting", async () => {
    providerAttempts.push([validOutput.slice(0, 30), validOutput.slice(30)])
    const response = await extract({ notes: "Spoke with Jane Doe regarding child Sam. Insurance BCBS. Follow up October 13, 2026." })
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    const events = await eventsFrom(response)
    expect(events.filter((event) => event.type === "output_delta")).toHaveLength(2)
    expect(events.at(-2)).toEqual({ type: "extraction_complete", data: { result } })
    expect(events.at(-1)).toEqual({ type: "done", data: { success: true } })
    expect(providerCalls[0]).toMatchObject({
      input: { text: { format: { type: "json_schema", strict: true, schema: { additionalProperties: false } } } },
      options: { timeoutMs: 250, retries: { strategy: "none" } },
    })
  })

  for (const [label, invalid] of [
    ["Markdown-wrapped JSON", "```json\n" + validOutput + "\n```"],
    ["extra fields", JSON.stringify({ ...result, unexpected: "extra" })],
    ["missing fields", JSON.stringify({ parent_name: "Jane" })],
    ["wrong types", JSON.stringify({ ...result, child_name: 12 })],
    ["blank values", JSON.stringify({ ...result, payer: " " })],
    ["impossible dates", JSON.stringify({ ...result, follow_up_date: "2026-02-30" })],
  ]) {
    test(`retries invalid JSON or schema: ${label}`, async () => {
      providerAttempts.push([invalid], [validOutput])
      const events = await eventsFrom(await extract({ notes: "Mock call notes" }))
      expect(providerCalls).toHaveLength(2)
      expect(events).toContainEqual({ type: "attempt_reset", data: { attempt: 2 } })
      expect(events).toContainEqual({ type: "extraction_retrying", data: { reason: "invalid_output", next_attempt: 2 } })
      expect(events.at(-1)?.data).toEqual({ success: true })
    })
  }

  test("handles repeated timeouts and accepts a subsequent request", async () => {
    const timeout = new Error("Simulated provider timeout")
    timeout.name = "TimeoutError"
    providerAttempts.push(timeout, timeout, timeout)
    const events = await eventsFrom(await extract({ notes: "Mock call notes" }))
    expect(providerCalls).toHaveLength(3)
    expect(providerCancellations).toHaveLength(3)
    expect(events.filter((event) => event.type === "extraction_retrying").map((event) => event.data.reason)).toEqual(["timeout", "timeout"])
    expect(events.at(-2)).toMatchObject({ type: "extraction_error", data: { code: "EXTRACTION_FAILED" } })
    expect(events.at(-1)?.data).toEqual({ success: false })

    providerAttempts.push([validOutput])
    const recovery = await eventsFrom(await extract({ notes: "Mock call notes" }))
    expect(recovery.at(-1)?.data).toEqual({ success: true })
  })

  test("stops after three invalid outputs and returns a handled failure", async () => {
    providerAttempts.push(["not JSON"], ["{}"], ["[]"])
    const events = await eventsFrom(await extract({ notes: "Mock call notes" }))
    expect(providerCalls).toHaveLength(3)
    expect(events.some((event) => event.type === "extraction_complete")).toBe(false)
    expect(events.at(-2)).toMatchObject({ type: "extraction_error", data: { code: "EXTRACTION_FAILED" } })
    expect(events.at(-1)?.data).toEqual({ success: false })
  })
})
