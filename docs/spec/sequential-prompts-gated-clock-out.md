# Sequential Prompts and Gated Clock-Out

## 1. Overview

Build a simple end-of-day workflow for a staff member to record the status of their work before ending a shift. The interface presents three prompts in sequence. A prompt is not available until the preceding prompt has a non-blank answer.

The workflow prompts are:

1. What items are currently outstanding?
2. Who are you waiting on for response?
3. Summary of work completed today.

The system must not allow a user to clock out until all three prompts have been completed for the active shift session. The API is the source of truth for prompt ordering, non-blank validation, session ownership, and clock-out eligibility. The UI must provide immediate sequential guidance while also handling API rejections safely.

This is a PoC. Shift sessions and responses are held in server memory only. No authentication, database, cookies, `localStorage`, `sessionStorage`, or real employee data are required.

## 2. Requirements

### 2.1 Shift session lifecycle

- [x] Represent a shift session with a unique `shift_id`.
- [x] Create a new active shift session when the end-of-day workflow is initialized.
- [x] Store the three prompt responses and completion state on the shift session.
- [x] Track the session status as either `active` or `clocked_out`.
- [x] Keep sessions in server memory only for the lifetime of the running process.
- [x] Do not use browser persistence to restore a shift session after a reload.
- [x] A page reload may start a new shift session and must not claim that the previous session was clocked out.
- [x] Do not allow responses to be changed after the session has been clocked out.
- [x] A server restart may clear all sessions; durable shift history is out of scope.

The shift session shape should be equivalent to:

```ts
type ShiftSession = {
  shift_id: string
  status: "active" | "clocked_out"
  responses: {
    outstanding_items: string | null
    waiting_on: string | null
    completed_summary: string | null
  }
  completed_prompts: Array<"outstanding_items" | "waiting_on" | "completed_summary">
  created_at: string
  clocked_out_at: string | null
}
```

### 2.2 Prompt sequence

- [x] Define these exact prompt keys and display labels:
  - `outstanding_items`: `What items are currently outstanding?`
  - `waiting_on`: `Who are you waiting on for response?`
  - `completed_summary`: `Summary of work completed today.`
- [x] Present the prompts in the defined order.
- [x] Show or enable only the first prompt when a new session starts.
- [x] Keep `waiting_on` hidden or locked until `outstanding_items` has a valid answer.
- [x] Keep `completed_summary` hidden or locked until `waiting_on` has a valid answer.
- [x] Treat whitespace-only input as blank.
- [x] Trim leading and trailing whitespace before saving a response.
- [x] Do not mark a prompt complete until its response has passed validation.
- [x] Allow a user to edit an already completed prompt while the session is active.
- [x] Do not submit a response automatically when the user types.
- [x] Require an explicit `Continue` or equivalent action to save each prompt response.

### 2.3 Gated clock-out

- [x] Keep the `Clock Out` action unavailable or disabled until all three prompts have valid saved responses.
- [x] The client must still call the clock-out API when the user explicitly confirms clock-out.
- [x] The clock-out API must verify the shift session exists and is active.
- [x] The clock-out API must verify all three prompt responses are non-blank on the server.
- [x] If any prompt is incomplete, reject clock-out with HTTP `400`.
- [x] A rejected clock-out must not change the session status or any saved response.
- [x] A valid clock-out changes the session status to `clocked_out` and records `clocked_out_at`.
- [x] After a successful clock-out, disable all prompt controls and prevent another clock-out attempt.
- [x] Display a plain-language success message after a successful clock-out.
- [x] Do not expose a raw stack trace, internal error, or implementation detail in the UI.

### 2.4 In-memory behavior

- [x] Use one server-side in-memory session store for session creation, lookup, response updates, and clock-out.
- [x] Generate a unique `shift_id` for every new session; do not depend on a fixed ID.
- [x] Keep the active session ID in React state only.
- [x] Do not add a database, external service, authentication provider, cookie, `localStorage`, or `sessionStorage` for this feature.
- [x] Return a clear `404` response when a request references an unknown `shift_id`.
- [x] Ensure a failed response update or failed clock-out does not partially mutate the session.
- [x] Keep the implementation single-process; cross-process synchronization is out of scope.

## 3. API Contracts

Implement these Next.js App Router route handlers:

```text
POST  /api/clock-out/sessions
GET   /api/clock-out/sessions/[shiftId]
PATCH /api/clock-out/sessions/[shiftId]/responses
POST  /api/clock-out/sessions/[shiftId]/clock-out
```

### 3.1 Create a shift session

`POST /api/clock-out/sessions` accepts an empty request body and returns HTTP `201` with a new session:

```json
{
  "shift_id": "shift-abc123",
  "status": "active",
  "responses": {
    "outstanding_items": null,
    "waiting_on": null,
    "completed_summary": null
  },
  "completed_prompts": [],
  "created_at": "2026-10-10T17:00:00.000Z",
  "clocked_out_at": null
}
```

- [x] Generate the ID on the server.
- [x] Do not accept a client-supplied ID as the session identity.
- [x] Return a fresh session for every successful request.

### 3.2 Get a shift session

`GET /api/clock-out/sessions/[shiftId]` returns HTTP `200` with the complete session record.

- [x] Return HTTP `404` with a clear error when the shift ID is unknown.
- [x] Return the latest saved response values and completion state.

### 3.3 Save a prompt response

`PATCH /api/clock-out/sessions/[shiftId]/responses` accepts exactly one response at a time:

```json
{
  "prompt": "outstanding_items",
  "response": "Waiting for the authorization document from the payer."
}
```

Supported prompt values are `outstanding_items`, `waiting_on`, and `completed_summary`.

For a valid response, return HTTP `200` with the updated complete session record:

```json
{
  "shift_id": "shift-abc123",
  "status": "active",
  "responses": {
    "outstanding_items": "Waiting for the authorization document from the payer.",
    "waiting_on": null,
    "completed_summary": null
  },
  "completed_prompts": ["outstanding_items"],
  "created_at": "2026-10-10T17:00:00.000Z",
  "clocked_out_at": null
}
```

Before mutating a session, the API must validate that:

- [x] The session exists.
- [x] The session status is `active`.
- [x] The request body is valid JSON.
- [x] `prompt` is one of the supported prompt keys.
- [x] `response` is a string.
- [x] The trimmed response is non-empty.
- [x] `waiting_on` is not submitted until `outstanding_items` has been completed.
- [x] `completed_summary` is not submitted until `waiting_on` has been completed.

For a blank response, return HTTP `400` with:

```json
{
  "error": "PROMPT_RESPONSE_INVALID",
  "message": "Enter a response before continuing.",
  "prompt": "outstanding_items"
}
```

For an out-of-order response, return HTTP `400` with:

```json
{
  "error": "PROMPT_SEQUENCE_BLOCKED",
  "message": "Complete the previous prompt before continuing.",
  "prompt": "completed_summary",
  "required_previous_prompt": "waiting_on"
}
```

For malformed JSON, an unsupported prompt key, or a non-string response, return HTTP `400` with a clear validation error. For an unknown session, return HTTP `404`. For an already clocked-out session, return HTTP `409` with `error: "SHIFT_ALREADY_CLOCKED_OUT"`.

- [x] Preserve the previous session state for every rejected request.
- [x] Return `completed_prompts` in deterministic prompt order: `outstanding_items`, `waiting_on`, `completed_summary`.

### 3.4 Clock out a shift session

`POST /api/clock-out/sessions/[shiftId]/clock-out` accepts an empty request body. The server must load the saved session and validate all three responses from the session store. The client must not be able to bypass the gate by sending a fabricated completion count.

For an incomplete session, return HTTP `400` with:

```json
{
  "error": "CLOCK_OUT_BLOCKED",
  "message": "Complete all end-of-day prompts before clocking out.",
  "missing_prompts": [
    "waiting_on",
    "completed_summary"
  ]
}
```

- [x] Include every incomplete prompt in `missing_prompts`.
- [x] Return `missing_prompts` in deterministic prompt order.
- [x] Treat null, empty, and whitespace-only saved responses as incomplete.
- [x] Keep the session `active` after a blocked request.

For a complete session, return HTTP `200` with the updated session:

```json
{
  "shift_id": "shift-abc123",
  "status": "clocked_out",
  "responses": {
    "outstanding_items": "Waiting for the authorization document from the payer.",
    "waiting_on": "Jane in Benefits Verification.",
    "completed_summary": "Reviewed open cases and sent follow-up messages."
  },
  "completed_prompts": [
    "outstanding_items",
    "waiting_on",
    "completed_summary"
  ],
  "created_at": "2026-10-10T17:00:00.000Z",
  "clocked_out_at": "2026-10-10T21:30:00.000Z"
}
```

- [x] Set `status` and `clocked_out_at` atomically after validation succeeds.
- [x] Return HTTP `409` for a repeated clock-out request against a `clocked_out` session.
- [x] Return HTTP `404` for an unknown session.
- [x] Do not require the browser to reload after a successful clock-out.

## 4. Front-End Workflow

### 4.1 End-of-day panel

- [x] Create a client component named `ClockOutWorkflow`.
- [x] Render a clearly labeled end-of-day panel available from the dashboard through the sidebar `Clock Out` action.
- [x] Display a heading such as `End-of-Day Check-In` and explain that all prompts are required before clock-out.
- [x] Create a shift session on initial mount by calling `POST /api/clock-out/sessions`.
- [x] Display a loading state while the session is being created.
- [x] Display a recoverable error if session creation fails.
- [x] Keep the returned `shift_id` in component state only.

### 4.2 Sequential prompt interaction

- [x] Render the first prompt immediately after session creation.
- [x] Render the second prompt only after the first response has been accepted by the API.
- [x] Render the third prompt only after the second response has been accepted by the API.
- [x] Use visible labels containing the exact prompt text.
- [x] Use multiline text controls suitable for end-of-day notes.
- [x] Provide a `Continue` action for the first and second prompts.
- [x] Provide a `Save response` or equivalent explicit action for the third prompt.
- [x] Disable the current prompt action while its API request is pending.
- [x] Show a clear inline validation message when the current response is blank.
- [x] Keep the current response in the field after a failed request so the user can correct it.
- [x] Do not reveal a later prompt merely because text has been typed into the current field; unlock it only after a successful response request.
- [x] Allow completed prompts to be reviewed and edited without changing the order of the workflow.

### 4.3 Clock-out interaction

- [x] Display a completion indicator such as `0 of 3`, `1 of 3`, `2 of 3`, or `3 of 3`.
- [x] Keep `Clock Out` disabled until the session contains all three completed responses.
- [x] On explicit `Clock Out`, call the session clock-out endpoint.
- [x] Show a pending state while the request is in progress.
- [x] On `CLOCK_OUT_BLOCKED`, keep the session active and reveal or focus the first missing prompt.
- [x] On success, display `Clocked out successfully.` or equivalent plain-language confirmation.
- [x] Display the session as complete and prevent further editing.
- [x] Announce validation errors and the successful clock-out through an accessible status or alert region.

### 4.4 Error and reset behavior

- [x] Map API error codes to plain-language UI messages.
- [x] Do not display raw HTTP status codes as the primary user-facing message.
- [x] Handle network failures without losing answers already confirmed by the API.
- [x] Provide a `Start new shift` or equivalent recovery action after an unrecoverable session initialization error.
- [x] Provide the same `Start new shift` recovery action when the active session is no longer available or has already been clocked out.
- [x] Starting a new shift must create a new server-side session and clear only the local workflow state.
- [x] Do not restore answers from browser storage after reload.

## 5. Implementation Tasks

### 5.1 Define the clock-out domain model

    1. [x] Create `lib/clock-out/types.ts` with prompt keys, session status, response types, and API error types.
    2. [x] Create `lib/clock-out/prompts.ts` with the ordered prompt definitions and exact display labels.
    3. [x] Create `lib/clock-out/validation.ts` with pure functions for response validation, sequence validation, completion calculation, and clock-out validation.
    4. [x] Keep prompt ordering in one shared definition so the API and UI use the same deterministic order.

### 5.2 Implement the in-memory session store

    1. [x] Create `lib/clock-out/session-store.ts` as a server-only in-memory store.
    2. [x] Implement `createSession`, `getSession`, `saveResponse`, and `clockOut` operations.
    3. [x] Generate unique session IDs on the server.
    4. [x] Validate all state changes before mutating the stored session.
    5. [x] Return copies of session data so route handlers cannot mutate store state accidentally.

### 5.3 Implement the API

    1. [x] Create `app/api/clock-out/sessions/route.ts` with the session creation handler.
    2. [x] Create `app/api/clock-out/sessions/[shiftId]/route.ts` with the session lookup handler.
    3. [x] Create `app/api/clock-out/sessions/[shiftId]/responses/route.ts` with the response update handler.
    4. [x] Create `app/api/clock-out/sessions/[shiftId]/clock-out/route.ts` with the gated clock-out handler.
    5. [x] Parse and validate request bodies before mutating the in-memory store.
    6. [x] Return the documented status codes and error shapes.
    7. [x] Ensure blocked and malformed requests leave the session unchanged.

### 5.4 Build the sequential UI

    1. [x] Create `components/clock-out/ClockOutWorkflow.tsx` as the client workflow component.
    2. [x] Create a prompt field component if needed to keep the three prompt states consistent.
    3. [x] Add the workflow to the dashboard through the existing sidebar `Clock Out` navigation trigger without removing the existing intake demonstration.
    4. [x] Add visible loading, pending, error, completion-count, and success states.
    5. [x] Use the existing UI component conventions for cards, buttons, labels, textareas, and alerts.
    6. [x] Ensure keyboard users can complete every prompt, submit responses, clock out, and recover from errors.
    7. [x] Ensure the layout remains usable at desktop and mobile widths.

### 5.5 Verify the feature

    1. [x] Add unit or integration coverage for blank, whitespace-only, valid, and out-of-order responses.
    2. [x] Test unknown shift IDs, malformed JSON, unsupported prompt keys, and non-string responses.
    3. [x] Test that a blocked clock-out returns every missing prompt in the expected order.
    4. [x] Test that a blocked clock-out does not change session state.
    5. [x] Test that a complete session clocks out exactly once.
    6. [x] Test that responses and clock-out are rejected after the session is already clocked out.
    7. [x] Test the UI sequence: prompt 2 is unavailable before prompt 1 succeeds, and prompt 3 is unavailable before prompt 2 succeeds.
    8. [x] Test that a blank submission does not unlock the next prompt.
    9. [x] Test that successful completion of all prompts enables clock-out.
    10. [x] Test that a successful clock-out disables editing without a page reload.
    11. [x] Run `npm run lint`.
    12. [x] Run `npm run build`.
    13. [x] Run the integration test suite with `npm run test:integration`.

## 6. Acceptance Criteria

### Session and API behavior

- [x] A new request to create a session returns a unique active shift session with three empty responses.
- [x] The API stores no session or response data in a database or browser persistence mechanism.
- [x] The API accepts the first prompt only when its response is a non-blank string.
- [x] The API rejects a second-prompt response until the first prompt is complete.
- [x] The API rejects a third-prompt response until the second prompt is complete.
- [x] The API trims accepted responses before storing them.
- [x] Blank and whitespace-only responses return HTTP `400` and do not mutate the session.
- [x] Unknown sessions return HTTP `404`.
- [x] Invalid prompt keys, malformed JSON, and invalid response types return HTTP `400`.
- [x] A blocked response update returns a deterministic error code and does not mutate the session.

### Clock-out gate

- [x] Clocking out with zero completed prompts returns HTTP `400` with all three missing prompt keys.
- [x] Clocking out with one completed prompt returns HTTP `400` with the remaining two missing prompt keys.
- [x] Clocking out with two completed prompts returns HTTP `400` with the remaining prompt key.
- [x] `missing_prompts` is always ordered as `outstanding_items`, `waiting_on`, `completed_summary`.
- [x] A blocked clock-out leaves the session active and preserves all saved responses.
- [x] A session with all three non-blank responses returns HTTP `200` and status `clocked_out`.
- [x] A successful clock-out records `clocked_out_at` and returns all saved responses.
- [x] A repeated clock-out returns HTTP `409` and does not alter the completed session.

### UI behavior

- [x] The first exact prompt is visible when the workflow is ready.
- [x] The second prompt remains hidden or locked until the first response succeeds.
- [x] The third prompt remains hidden or locked until the second response succeeds.
- [x] The UI does not unlock prompts for blank or whitespace-only submissions.
- [x] The UI displays the completion count as responses are accepted.
- [x] The `Clock Out` action remains disabled before all three prompts are complete.
- [x] An explicit clock-out action calls the API even when the UI believes the session is complete.
- [x] An incomplete clock-out displays a plain-language error and focuses the first missing prompt.
- [x] A successful clock-out displays a confirmation and disables all editing controls.
- [x] Reloading the page does not restore the previous session or its responses.
- [x] All controls have visible labels, keyboard access, and accessible status announcements.

### Quality and scope

- [x] The implementation uses dummy data only and does not require external services.
- [x] No API keys, database credentials, or secret tokens are hardcoded.
- [x] The API remains authoritative even when the UI is manipulated or requests are replayed.
- [x] The implementation is single-process and intentionally non-durable for the PoC.
- [x] `npm run lint` completes successfully.
- [x] `npm run build` completes successfully.
- [x] Integration tests cover the prompt sequence, validation errors, gated clock-out, successful clock-out, and reload behavior.
