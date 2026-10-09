# Structured AI Call Notes Extraction

## 1. Overview

Build a stakeholder-facing demonstration that extracts a small, typed record from raw call notes. The feature has its own page, is available through the sidebar item **AI extraction**, and uses a responsive two-column workspace:

- The left column contains raw call notes.
- The right column displays the structured extraction.

The user starts an extraction explicitly. The server sends the notes to OpenRouter using the Gemma model, preserves the model's reasoning context between two requests, and streams the final JSON response back to the browser as it is generated.

The extracted record contains:

- Parent name
- Child name
- Payer
- Follow-up date

The server is authoritative for parsing and validation. Partial streamed text may be displayed as progress, but it must never be treated as a successful extraction until the complete response passes strict JSON parsing and runtime schema validation.

This is a PoC. Use mock call notes only. The OpenRouter API key is read from a server-side environment variable and must never be sent to the browser, logged, or hardcoded. No database, browser persistence, or real patient information is required.

## 2. Requirements

### 2.1 Extraction scope

- [ ] Accept one raw call-notes string per extraction request.
- [ ] Extract exactly these output properties: `parent_name`, `child_name`, `payer`, and `follow_up_date`.
- [ ] Keep the property names in `snake_case` in the API, TypeScript type, JSON Schema, and UI data model.
- [ ] Always return all four properties, even when the call notes do not contain enough information to populate every field.
- [ ] Use only information explicitly present in the call notes; do not infer, guess, or supplement missing facts from general knowledge or model context.
- [ ] Return the exact string `Not defined in call notes` when a field is not mentioned at all.
- [ ] Return the exact string `Insufficient data` when the notes mention a field but do not provide enough unambiguous information to determine its value.
- [ ] Treat `follow_up_date` as either an ISO calendar date in `YYYY-MM-DD` format or one of the two documented sentinel strings.
- [ ] Treat the three name and payer properties as non-empty strings after trimming, including when a sentinel string is required.
- [ ] Do not add inferred fields, free-form commentary, confidence scores, or model reasoning to the successful extraction result.
- [ ] Keep extraction state in React state and the active request only; do not use a database, cookie, `localStorage`, or `sessionStorage`.

Insufficient source information is a valid extraction outcome, not a provider failure. The API must return a valid typed JSON object containing the supplied values and the appropriate sentinel string for every missing or ambiguous field.

### 2.2 Mock call notes

- [ ] Provide a server-independent default mock note for the UI so the page is useful immediately after loading.
- [ ] Use dummy names, payer values, and dates only.
- [ ] Prepopulate the notes control with a value equivalent to:

```text
Spoke with Jane Doe regarding child Sam. Insurance is BCBS. Needs ABA service. Follow up on 2026-10-13.
```

- [ ] Allow the user to edit the mock notes before starting extraction.
- [ ] Do not call OpenRouter until the user activates the extraction action.
- [ ] Do not require a database seed, fixed record ID, or external CRM integration.

### 2.3 OpenRouter provider

- [ ] Send provider requests only from a server-side route handler or server-only service.
- [ ] Read the API key from `OPENROUTER_API_KEY`.
- [ ] Use this exact default model: `google/gemma-4-26b-a4b-it:free`.
- [ ] Send requests to `https://openrouter.ai/api/v1/chat/completions`.
- [ ] Set the `Authorization` header to `Bearer ${OPENROUTER_API_KEY}`.
- [ ] Set the `Content-Type` header to `application/json`.
- [ ] Enable reasoning on the first provider request with `"reasoning": { "enabled": true }`.
- [ ] Preserve the first assistant message's `reasoning_details` value without modifying, summarizing, or serializing it into a string before passing it to the second request.
- [ ] Use the typed `response_format` JSON Schema on the final provider request.
- [ ] Do not fall back to unstructured output if the provider rejects or omits the typed response format.
- [ ] Do not expose the API key, provider authorization header, reasoning details, or raw provider response to the browser.

The extraction service must follow this two-request reasoning flow:

1. Send an explicit extraction prompt containing the required output fields, missing-data rules, and raw notes to the model with reasoning enabled and receive the first assistant message.
2. Build a new message list containing the original user message, the assistant `content`, and the assistant `reasoning_details` exactly as returned.
3. Append a user message asking for the final extraction only as strict JSON.
4. Send that message list in a second request with the typed JSON Schema and streaming enabled.
5. Parse and validate the complete content accumulated from the second request.

The provider request shape must be equivalent to:

```ts
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "google/gemma-4-26b-a4b-it:free",
    messages: [
      {
        role: "user",
        content: extractionPrompt,
      },
    ],
    reasoning: { enabled: true },
  }),
});

const result = await response.json();
const firstAssistantMessage = result.choices[0].message;

const messages = [
  {
    role: "user",
    content: extractionPrompt,
  },
  {
    role: "assistant",
    content: firstAssistantMessage.content,
    reasoning_details: firstAssistantMessage.reasoning_details,
  },
  {
    role: "user",
    content: "Return only the final extraction as JSON matching the required schema. Do not include Markdown, commentary, or additional properties.",
  },
];

const finalResponse = await fetch(
  "https://openrouter.ai/api/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemma-4-26b-a4b-it:free",
      messages,
      stream: true,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_notes_extraction",
          strict: true,
          schema: extractionJsonSchema,
        },
      },
    }),
  },
);
```

The implementation may add request timeouts and OpenRouter metadata headers, but it must preserve this model, two-request sequence, reasoning handoff, explicit extraction instructions, and typed final response behavior.

The first user message must contain an explicit prompt equivalent to:

```text
Extract a structured record from the call notes below.

Return exactly one JSON object with exactly these four properties:
- parent_name: the explicitly stated parent's name; preserve only the portion supplied if a full name is not present.
- child_name: the explicitly stated child's name; preserve only the portion supplied if a full name is not present.
- payer: the explicitly stated insurance payer or carrier.
- follow_up_date: an explicitly stated follow-up date normalized to YYYY-MM-DD.

Extraction rules:
- Use only facts stated in the call notes. Never guess or infer missing identities, payer details, or dates.
- If a field is not mentioned at all, set its value to exactly "Not defined in call notes".
- If a field is mentioned but the notes are ambiguous or incomplete, set its value to exactly "Insufficient data".
- Keep every property in the JSON object, including fields with either sentinel value.
- Resolve a relative date only when a reliable reference date is provided. Otherwise use "Insufficient data".
- Return only JSON. Do not return Markdown, explanations, confidence scores, reasoning, or additional properties.

Call notes:
<call_notes>
{{raw notes}}
</call_notes>
```

### 2.4 Typed extraction result

Define the application result as equivalent to:

```ts
type ExtractionResult = {
  parent_name: string
  child_name: string
  payer: string
  follow_up_date: string
}
```

The OpenRouter `response_format` must use a strict JSON Schema equivalent to:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "parent_name": {
      "type": "string"
    },
    "child_name": {
      "type": "string"
    },
    "payer": {
      "type": "string"
    },
    "follow_up_date": {
      "type": "string"
    }
  },
  "required": [
    "parent_name",
    "child_name",
    "payer",
    "follow_up_date"
  ]
}
```

- [ ] Require every property, including `follow_up_date`, to be present in the model response.
- [ ] Reject unknown properties.
- [ ] Reject missing properties and non-string values.
- [ ] Trim string values before returning them to the client.
- [ ] Reject empty strings after trimming unless the value is one of the exact documented sentinel strings.
- [ ] Validate `follow_up_date` as a real calendar date when it is not a sentinel string.
- [ ] Use the request date or an explicitly supplied reference date when resolving relative language such as `next Tuesday`; use `Insufficient data` when no reliable reference date is available.
- [ ] Preserve the exact sentinel strings and do not convert them to `null`, empty strings, or guessed values.

### 2.5 Strict parsing and validation

- [ ] Accumulate only the final assistant content from the second provider request.
- [ ] Parse the accumulated content with `JSON.parse` exactly once after the final stream marker.
- [ ] Reject Markdown code fences, leading or trailing commentary, multiple JSON values, and truncated JSON.
- [ ] Validate the parsed value against the shared runtime extraction schema before sending success to the client.
- [ ] Do not attempt to repair invalid JSON with string replacement, regular expressions, or a second client-side parser.
- [ ] Do not render an invalid final value as a successful result.
- [ ] Keep partial content available for progress display, but label it as incomplete until validation succeeds.
- [ ] Treat an empty stream, missing choices, missing message content, or missing final stream marker as an invalid provider response.
- [ ] Keep provider parsing and application schema validation on the server.

### 2.6 Timeout and retry behavior

- [ ] Protect each provider fetch with an `AbortController` timeout.
- [ ] Use a default per-request timeout of 30 seconds, with an optional server-only `AI_EXTRACTION_TIMEOUT_MS` override for local testing.
- [ ] Make a maximum of three complete extraction attempts: the initial attempt plus two retries.
- [ ] A complete extraction attempt consists of both the reasoning request and the final streaming request.
- [ ] Retry a provider timeout, network failure, HTTP `429`, HTTP `5xx`, malformed provider response, invalid streamed JSON, or runtime schema validation failure.
- [ ] Do not retry malformed client input or a missing `OPENROUTER_API_KEY`.
- [ ] Stop retrying immediately after a valid typed result is parsed.
- [ ] Discard the failed attempt's partial output before exposing the next attempt's output as current progress.
- [ ] Send a retry status event with the current attempt number so the UI can explain what is happening.
- [ ] After the third failed attempt, send a safe, plain-language error and no successful extraction result.
- [ ] Catch all expected provider, parsing, timeout, abort, and stream-processing errors in the route handler or service boundary.
- [ ] Ensure a provider failure never produces an unhandled promise rejection or crashes the application server.
- [ ] Do not include stack traces, API keys, request headers, raw provider payloads, or reasoning details in the client error.
- [ ] If the browser disconnects, abort the active provider request and clean up all stream readers and timers.

### 2.7 Extraction stream

- [ ] Stream extraction progress from the API to the browser using Server-Sent Events.
- [ ] Send `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive` headers.
- [ ] Send a complete event record separated by a blank line.
- [ ] Send an `extraction_started` event with the first attempt and maximum attempt count.
- [ ] Send `output_delta` events containing text fragments from the final provider response.
- [ ] Send an `attempt_reset` event before retry output so the client clears the failed attempt's partial JSON.
- [ ] Send an `extraction_retrying` event with a safe reason category and the next attempt number.
- [ ] Send exactly one `extraction_complete` event with the validated `ExtractionResult` after successful parsing.
- [ ] Send exactly one `extraction_error` event after all retries fail.
- [ ] Send a final `done` event for both success and failure.
- [ ] Close the SSE response cleanly after `done`.
- [ ] Never send `extraction_complete` for a partial, malformed, or schema-invalid result.

The event shapes should be equivalent to:

```text
event: extraction_started
data: {"attempt":1,"max_attempts":3}

event: output_delta
data: {"text":"{\\"parent_name\\":\\"Jane Doe\\","attempt":1}

event: attempt_reset
data: {"attempt":2}

event: extraction_retrying
data: {"reason":"invalid_output","next_attempt":2}

event: extraction_complete
data: {"result":{"parent_name":"Jane Doe","child_name":"Sam","payer":"BCBS","follow_up_date":"2026-10-13"}}

event: done
data: {"success":true}
```

For an exhausted request:

```text
event: extraction_error
data: {"code":"EXTRACTION_FAILED","message":"The details could not be extracted right now. Please try again."}

event: done
data: {"success":false}
```

The server may return a normal JSON error response before the SSE stream starts for invalid input or unavailable configuration:

```json
{
  "error": "EXTRACTION_INPUT_INVALID",
  "message": "Enter call notes before starting extraction."
}
```

### 2.8 Navigation and page

- [ ] Add a sidebar navigation item labeled exactly `AI extraction`.
- [ ] Navigate that item to `/ai-extraction`.
- [ ] Keep the existing lead feed and clock-out navigation available.
- [ ] Create a dedicated page at `app/ai-extraction/page.tsx`.
- [ ] Render the page inside the existing dashboard shell with the sidebar and shared header.
- [ ] Use a clear heading such as `AI Call Notes Extraction`.
- [ ] Explain that the page extracts a structured record from mock call notes using the AI provider.
- [ ] Do not require a full page reload to start another extraction.

### 2.9 Extraction workspace UI

- [ ] Use a responsive two-column layout at desktop widths.
- [ ] Place the raw call notes editor in the left column.
- [ ] Place the extraction status and output in the right column.
- [ ] Stack the columns vertically at mobile widths.
- [ ] Render a visible label such as `Raw call notes` for the notes control.
- [ ] Prepopulate the notes control with the mock call notes.
- [ ] Preserve edited notes in the control while an extraction is running or after an error.
- [ ] Add a primary action labeled `Start extraction` or an equally clear user-facing alternative.
- [ ] Disable the start action while the request is active.
- [ ] Reject blank or whitespace-only notes before opening the stream.
- [ ] Show a pending status while the reasoning and final extraction requests are running.
- [ ] Show streamed JSON fragments in the output panel as they arrive.
- [ ] Clearly label streamed JSON as `Building extraction` or equivalent until validation succeeds.
- [ ] On success, show the four extracted fields as readable values.
- [ ] Show the follow-up date in its ISO value when available; display `Insufficient data` or `Not defined in call notes` as status text rather than attempting date formatting.
- [ ] Provide access to the final JSON representation without displaying model reasoning.
- [ ] On retry, clear failed partial output and display the current attempt status.
- [ ] On failure, keep the notes available and provide a clear `Try again` action.
- [ ] Keep a failed request from replacing a previous successful result unless a new attempt produces a new successful result.
- [ ] Do not optimistically display extracted field values before the server sends `extraction_complete`.

### 2.10 Accessibility and security

- [ ] Use visible labels for the notes editor and extraction action.
- [ ] Make all controls keyboard accessible.
- [ ] Announce pending, retrying, successful, and failed states through an accessible status or alert region.
- [ ] Ensure streamed output does not move keyboard focus unexpectedly.
- [ ] Preserve readable contrast and usable spacing at desktop and mobile widths.
- [ ] Keep the OpenRouter API key server-only and exclude it from client bundles.
- [ ] Do not log raw call notes, extracted values, authorization headers, or reasoning details by default.
- [ ] Use mock data only and document that the page is not intended for real patient information.

## 3. API Contract

Implement this Next.js App Router route handler:

```text
POST /api/ai-extraction/extract
```

### 3.1 Start extraction

`POST /api/ai-extraction/extract` accepts:

```json
{
  "notes": "Spoke with Jane Doe regarding child Sam. Insurance is BCBS. Needs ABA service. Follow up on 2026-10-13."
}
```

Before starting a provider request, the route must validate that:

- [ ] The request body is valid JSON.
- [ ] `notes` exists and is a string.
- [ ] The trimmed notes value is non-empty.
- [ ] The notes value is within the documented request size limit.
- [ ] `OPENROUTER_API_KEY` is configured on the server.

For valid input, return an SSE response and follow the event contract in section 2.7. The route must not return the provider's raw response directly.

For invalid input, return HTTP `400` without calling OpenRouter:

```json
{
  "error": "EXTRACTION_INPUT_INVALID",
  "message": "Enter call notes before starting extraction."
}
```

For missing provider configuration, return HTTP `503` without exposing configuration details:

```json
{
  "error": "EXTRACTION_PROVIDER_UNAVAILABLE",
  "message": "AI extraction is temporarily unavailable. Please try again later."
}
```

For an accepted request, the server must:

1. Start the bounded retry workflow.
2. Execute the first reasoning-enabled OpenRouter request.
3. Preserve the returned assistant message and its `reasoning_details`.
4. Execute the second typed, streaming OpenRouter request.
5. Forward safe progress events to the browser.
6. Validate the accumulated final JSON.
7. Send either the validated result or the safe terminal error event.

### 3.2 Successful stream

The successful terminal event must contain exactly the typed result:

```json
{
  "parent_name": "Jane Doe",
  "child_name": "Sam",
  "payer": "BCBS",
  "follow_up_date": "2026-10-13"
}
```

The route must not include `reasoning_details`, raw provider metadata, token usage, or unrecognized output properties in `extraction_complete`.

Insufficient information in the notes is still a successful extraction when the response is valid JSON. For example, if the notes contain only `Insurance is BCBS.`, the terminal result must be:

```json
{
  "parent_name": "Not defined in call notes",
  "child_name": "Not defined in call notes",
  "payer": "BCBS",
  "follow_up_date": "Not defined in call notes"
}
```

If the notes say that a follow-up is needed but do not identify a date, `follow_up_date` must be `Insufficient data`. Missing source information must not trigger a retry or `EXTRACTION_FAILED` response.

### 3.3 Failed stream

If all three attempts fail, emit:

```json
{
  "code": "EXTRACTION_FAILED",
  "message": "The details could not be extracted right now. Please try again."
}
```

Allowed safe reason categories for retry status are:

- `timeout`
- `provider_error`
- `network_error`
- `invalid_output`

The client-facing error must not reveal which raw provider payload or internal exception caused the failure.

## 4. Front-End Workflow

### 4.1 Extraction page

- [ ] Create a client component named `AIExtractionWorkspace`.
- [ ] Render the component from `app/ai-extraction/page.tsx`.
- [ ] Render the raw notes card and output card in a responsive two-column layout.
- [ ] Load the mock notes into local component state on initial render.
- [ ] Keep the latest result, partial output, request status, current attempt, and error in local state only.

### 4.2 Start and stream interaction

- [ ] Validate notes locally before sending the request.
- [ ] Clear only the current output and error when a new extraction starts.
- [ ] Send `POST /api/ai-extraction/extract` with the current notes.
- [ ] Verify the response content type before attempting to read the SSE stream.
- [ ] Parse SSE events incrementally from the response body.
- [ ] Append `output_delta.text` to the partial output for the active attempt.
- [ ] Clear partial output on `attempt_reset`.
- [ ] Update pending status from `extraction_started` and `extraction_retrying` events.
- [ ] Set the final result only after receiving and parsing `extraction_complete`.
- [ ] Set the error state from `extraction_error` and retain the notes after failure.
- [ ] Stop reading and reset pending state after `done`.
- [ ] Handle a network disconnect or malformed SSE event as a recoverable extraction error.
- [ ] Do not run a second client request automatically after a terminal failure; the user must explicitly choose `Try again` or `Start extraction`.

### 4.3 Output presentation

- [ ] Display a neutral empty state before the first extraction, such as `Your structured output will appear here.`
- [ ] Display partial JSON in a monospace, scrollable region while it is being generated.
- [ ] Display the validated result as labeled fields after completion.
- [ ] Display a success status such as `Extraction complete.`.
- [ ] Display retry progress such as `Retrying extraction (2 of 3).` without exposing internal exception text.
- [ ] Display the terminal message `The details could not be extracted right now. Please try again.` after exhausted retries.
- [ ] Keep the previous successful result visible until a subsequent request succeeds, unless the product design explicitly chooses to clear it at start.

### 4.4 Error and recovery behavior

- [ ] Show a plain-language validation message for blank notes without making a network request.
- [ ] Show a recoverable message for HTTP `503` provider configuration errors.
- [ ] Show a recoverable message for HTTP `400` input errors.
- [ ] Show a recoverable message when the stream ends without `extraction_complete` or `extraction_error`.
- [ ] Keep the start action available after a terminal error.
- [ ] Do not expose stack traces, provider response bodies, model reasoning, or HTTP status codes as the primary UI message.

## 5. Implementation Tasks

### 5.1 Define the extraction domain model

1. [ ] Create `lib/ai-extraction/types.ts` with `ExtractionResult`, request types, stream event types, attempt state, and safe error types.
2. [ ] Create `lib/ai-extraction/schema.ts` with the shared JSON Schema and runtime validation for `ExtractionResult`.
3. [ ] Create `lib/ai-extraction/mock-call-notes.ts` with the default dummy notes.
4. [ ] Keep the output property order deterministic: `parent_name`, `child_name`, `payer`, `follow_up_date`.
5. [ ] Add pure helpers for ISO date validation, sentinel handling, required string validation, and complete result validation.
6. [ ] Define the required extraction prompt in one shared server-side location so every attempt uses the same field definitions and missing-data rules.

### 5.2 Implement the OpenRouter client

1. [ ] Create `lib/ai-extraction/openrouter-client.ts` as a server-only provider client.
2. [ ] Read `OPENROUTER_API_KEY` from the environment and fail safely when it is absent.
3. [ ] Use `google/gemma-4-26b-a4b-it:free` as the default model.
4. [ ] Implement the first reasoning-enabled request.
5. [ ] Preserve the first assistant `content` and `reasoning_details` values without modifying them.
6. [ ] Implement the second request with the preserved messages, strict `response_format`, and `stream: true`.
7. [ ] Add bounded `AbortController` timeout handling to both provider requests.
8. [ ] Parse OpenRouter streaming chunks and expose only final response text deltas to the extraction service.
9. [ ] Treat provider non-success responses, missing response fields, stream truncation, and `[DONE]` absence as typed failures.

### 5.3 Implement extraction orchestration

1. [ ] Create `lib/ai-extraction/extraction-service.ts` with the two-call attempt workflow.
2. [ ] Implement a maximum of three attempts total.
3. [ ] Retry only timeout, network, provider, invalid JSON, and schema validation failures.
4. [ ] Emit typed progress events for start, output deltas, attempt reset, retry, complete, error, and done.
5. [ ] Parse the final accumulated content with strict `JSON.parse`.
6. [ ] Validate the parsed object with the shared runtime schema before emitting completion.
7. [ ] Ensure failed attempts cannot mutate or leak a successful result.
8. [ ] Ensure cancellation closes provider readers, clears timers, and does not throw after the client disconnects.

### 5.4 Implement the API route

1. [ ] Create `app/api/ai-extraction/extract/route.ts` with a `POST` handler.
2. [ ] Parse and validate the request body before calling the extraction service.
3. [ ] Return the documented `400` response for invalid notes.
4. [ ] Return the documented `503` response when the provider is not configured.
5. [ ] Return an SSE response for valid requests.
6. [ ] Map internal failures to safe stream events or safe pre-stream JSON errors.
7. [ ] Never allow provider errors or malformed model output to escape as an unhandled server exception.

### 5.5 Build the extraction page

1. [ ] Create `components/ai-extraction/AIExtractionWorkspace.tsx` as the client workflow component.
2. [ ] Create `app/ai-extraction/page.tsx` and render it inside the dashboard shell.
3. [ ] Add the mock notes editor and `Start extraction` action.
4. [ ] Add the streamed output and structured result presentation.
5. [ ] Add pending, retry, success, empty, and failure states.
6. [ ] Add the `AI extraction` sidebar item linking to `/ai-extraction`.
7. [ ] Preserve the existing lead feed and clock-out navigation.
8. [ ] Use the existing UI component conventions for cards, buttons, labels, textareas, alerts, and status text.
9. [ ] Ensure the layout remains usable at desktop and mobile widths.

### 5.6 Verify the feature

1. [ ] Test valid output with all four required properties.
2. [ ] Test missing properties, unknown properties, invalid types, empty strings, invalid JSON, fenced JSON, and trailing commentary.
3. [ ] Test valid ISO dates, impossible calendar dates, both sentinel strings, and ambiguous relative dates.
4. [ ] Test sparse notes and verify supplied values are preserved while absent fields use `Not defined in call notes`.
5. [ ] Test ambiguous or incomplete notes and verify the affected fields use `Insufficient data` without triggering a retry.
6. [ ] Test malformed request JSON, missing notes, non-string notes, and blank notes.
7. [ ] Test a successful two-request provider flow and verify `reasoning_details` is passed back unmodified.
8. [ ] Test streamed deltas and the final `extraction_complete` event.
9. [ ] Test provider timeout, network failure, HTTP `429`, HTTP `5xx`, and invalid output retry behavior.
10. [ ] Verify that no more than two retries occur after the initial attempt.
11. [ ] Verify that exhausted retries emit one safe error and do not crash the server.
12. [ ] Verify that a client disconnect aborts the provider request and cleans up resources.
13. [ ] Test that the UI displays partial JSON but does not display a successful result before completion.
14. [ ] Test that retry output resets the failed attempt's partial JSON.
15. [ ] Test the sidebar navigation and dedicated `/ai-extraction` page.
16. [ ] Test the two-column desktop layout and stacked mobile layout.
17. [ ] Run `npm run lint`.
18. [ ] Run `npm run build`.
19. [ ] Run the integration test suite with `npm run test:integration`.

## 6. Acceptance Criteria

### Provider and extraction behavior

- [ ] The extraction service uses OpenRouter with model `google/gemma-4-26b-a4b-it:free`.
- [ ] The first provider request enables reasoning.
- [ ] The second provider request includes the first assistant message's `reasoning_details` unchanged.
- [ ] The final request enables streaming and uses a strict typed JSON Schema response format.
- [ ] A valid result contains exactly `parent_name`, `child_name`, `payer`, and `follow_up_date`.
- [ ] Every valid result contains the supplied values and uses `Insufficient data` or `Not defined in call notes` for fields that cannot be safely populated.
- [ ] `follow_up_date` is an ISO date or one of the two exact sentinel strings.
- [ ] Invalid JSON, extra commentary, missing fields, unknown fields, invalid types, and invalid dates are rejected.
- [ ] Partial JSON is never emitted as a completed extraction.

### API and resilience behavior

- [ ] `POST /api/ai-extraction/extract` rejects malformed or blank input with HTTP `400`.
- [ ] The route returns HTTP `503` when `OPENROUTER_API_KEY` is not configured.
- [ ] Valid requests return an SSE stream with progress events and a terminal `done` event.
- [ ] The stream renders final JSON deltas while the model is generating them.
- [ ] A timeout or invalid output retries no more than twice after the initial attempt.
- [ ] Provider, timeout, network, parsing, and schema failures are caught and do not crash the application server.
- [ ] An exhausted request emits a safe `EXTRACTION_FAILED` error without stack traces or provider internals.
- [ ] A failed attempt's partial output is cleared before the next attempt is displayed.
- [ ] A disconnected browser aborts the active provider request and cleans up resources.
- [ ] The API key is never included in client code, response data, or user-facing errors.

### UI behavior

- [ ] The sidebar contains an `AI extraction` item that opens `/ai-extraction`.
- [ ] The feature has its own page and does not replace the existing lead feed or clock-out workflow.
- [ ] The page loads with mock raw call notes in the left column.
- [ ] The right column shows an empty state before extraction and streamed output during extraction.
- [ ] The primary action is clearly labeled `Start extraction` or an equivalent friendly label.
- [ ] The user can edit the mock notes before starting extraction.
- [ ] The start action is disabled while extraction is active.
- [ ] The validated result is displayed as four labeled output values without model reasoning.
- [ ] Retry, timeout, invalid output, and provider failures produce recoverable plain-language feedback.
- [ ] A failed extraction does not crash the page or erase the raw notes.
- [ ] The layout uses two columns on desktop and stacks on mobile.
- [ ] All controls have visible labels, keyboard access, and accessible status announcements.

### Quality and scope

- [ ] Only dummy/mock call notes are used.
- [ ] No API keys, database credentials, or secret tokens are hardcoded.
- [ ] No database or browser persistence is used for extraction state.
- [ ] Runtime validation is shared by the provider response handling and API result handling.
- [ ] `npm run lint` completes successfully.
- [ ] `npm run build` completes successfully.
- [ ] Integration tests cover strict parsing, streaming, retries, failure recovery, navigation, and responsive workflow behavior.
