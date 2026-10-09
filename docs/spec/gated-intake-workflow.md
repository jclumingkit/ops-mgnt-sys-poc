# Real-Time Gated Intake Workflow

## 1. Overview

Build a stakeholder-facing demonstration of leads arriving from a simulated GoHighLevel integration and moving through a four-stage intake workflow. The interface uses a kanban board so users can see new leads appear in real time, drag leads between stages, and see the result of attempting to advance a gated lead.

The workflow stages are:

1. New Lead
2. Benefits Verification
3. Authorization Pending
4. Schedule Assessment

Only the transition from **Authorization Pending** to **Schedule Assessment** is gated. The system must block that transition until all three required authorization items are complete:

- Authorization number
- Approval date
- Diagnostic report uploaded

The API is the source of truth for transition validation. The UI must present API rejections in plain language, return a rejected drag to its original column, and allow the user to retry after completing the requirements.

This is a PoC. The GoHighLevel integration is represented by a server-side mock lead generator. Use dummy lead data only. No database, external API, or real patient information is required.

All demo state is held in memory. Do not persist it in a database, cookie, `localStorage`, or `sessionStorage`. Reloading the page must reset the in-memory demo and restart lead generation from the beginning.

## 2. Requirements

### 2.1 Lead workflow

- [x] Represent statuses with these exact values:
  - `new_lead`
  - `benefits_verification`
  - `authorization_pending`
  - `schedule_assessment`
- [x] Display the corresponding title-cased labels in the UI.
- [x] Allow only adjacent forward transitions:
  - `new_lead` to `benefits_verification`
  - `benefits_verification` to `authorization_pending`
  - `authorization_pending` to `schedule_assessment`
- [x] Do not allow a lead to move backward or skip a status.
- [x] Reject non-adjacent, backward, or unknown status transitions with HTTP `400`.
- [x] Do not apply the authorization gate to the first two transitions.
- [x] For the first two transitions, the request body requires only `status`; authorization fields are not required and are not changed.
- [x] Every drag-and-drop transition and keyboard alternative must use the same transition API and validation rules.

### 2.2 Mock GoHighLevel lead generator

- [x] Create a server-side mock lead generator engine that simulates incoming leads from GoHighLevel.
- [x] Do not create a static seeded lead or depend on a fixed `case-001` record.
- [x] Generate deterministic dummy leads with unique IDs, display names, and payer values. Every generated lead starts in `new_lead` with all authorization requirements incomplete.
- [x] Start the generator when the demo is reset or initialized by the dashboard.
- [x] Emit the first lead immediately when generation starts.
- [x] Emit the second and third leads 10 seconds apart in sequence. In other words, the first three arrivals occur at approximately `t=0s`, `t=10s`, and `t=20s`.
- [x] After the third lead, emit subsequent leads at one-minute intervals: approximately `t=80s`, `t=140s`, and so on.
- [x] Reset must cancel existing timers, clear the generated lead list, reset the generator sequence, and start the cadence again.
- [x] The generator must publish each new lead to connected dashboards without requiring a page refresh or polling loop.
- [x] Keep the production/demo cadence at 10 seconds and 60 seconds. Allow an environment-controlled accelerated cadence for automated tests without changing the production defaults.

### 2.3 In-memory lifecycle

- [x] Keep the current lead list, lead statuses, authorization values, generator sequence, and active timers in server memory only.
- [x] A browser reload must call the demo reset flow, clear the current board, and restart the generator from its first lead.
- [x] A server restart also clears all leads and restarts the generator when the dashboard initializes.
- [x] The demo must work as a single-process PoC. Multi-process synchronization is out of scope.

### 2.4 Real-time lead API

Implement these Next.js App Router route handlers:

```text
GET   /api/intake/leads
GET   /api/intake/leads/stream
PATCH /api/intake/leads/[leadId]/status
POST  /api/intake/demo/reset
```

- [x] `GET /api/intake/leads` must return the current in-memory lead list as a JSON array.

`GET /api/intake/leads/stream` must provide a Server-Sent Events stream. The stream must:

- [x] Send an initial snapshot of the current leads when the client connects.
- [x] Send a `lead_created` event whenever the generator creates a lead.
- [x] Send a `lead_updated` event whenever a lead changes status or authorization data.
- [x] Send a `demo_reset` event after the in-memory state is reset.
- [x] Close cleanly when the client disconnects.

- [x] The event data must be JSON and include the complete lead record for `lead_created` and `lead_updated` events.
- [x] The UI must update from stream events without polling.

- [x] `POST /api/intake/demo/reset` must clear the current state, restart the generator, and return HTTP `200` with the current lead list and generator state.
- [x] The dashboard must call this endpoint on its initial mount, including after a browser reload.

### 2.5 Transition API

Implement the status route at:

```text
PATCH /api/intake/leads/[leadId]/status
```

The request body must have this shape:

```json
{
  "status": "schedule_assessment",
  "authorization_number": "AUTH-12345",
  "approval_date": "2026-10-09",
  "diagnostic_report_uploaded": true
}
```

- [x] The authorization properties are optional for the first two transitions and required for the gated transition.

Before mutating a lead, the API must validate that:

- [x] The lead ID exists.
- [x] The target status is the immediate next status for the current status.
- [x] The request body is valid JSON and contains a supported `status`.
- [x] For `authorization_pending` to `schedule_assessment`:
  - [x] `authorization_number` is a non-empty string after trimming.
  - [x] `approval_date` is an ISO calendar date in `YYYY-MM-DD` format.
  - [x] `approval_date` represents a real calendar date; no past or future date restriction applies.
  - [x] `diagnostic_report_uploaded` is exactly `true`.

- [x] If one or more authorization requirements are not met, return HTTP `400` with this response shape:

```json
{
  "error": "INTAKE_TRANSITION_BLOCKED",
  "message": "The lead cannot move to Schedule Assessment yet.",
  "from_status": "authorization_pending",
  "to_status": "schedule_assessment",
  "missing_fields": [
    "authorization_number",
    "approval_date",
    "diagnostic_report_uploaded"
  ]
}
```

- [x] The `missing_fields` array must contain every unmet field in this deterministic order: `authorization_number`, `approval_date`, `diagnostic_report_uploaded`. A false diagnostic upload value counts as an unmet `diagnostic_report_uploaded` requirement. A blocked request must not change the lead status or saved authorization values.

- [x] For a valid transition, return HTTP `200` with the updated lead record. The response must include the new status and all saved authorization values. Publish the update to the real-time stream.

- [x] For an unknown lead ID, return HTTP `404` with a clear error message. For malformed JSON, missing `status`, an unsupported status, or an invalid/non-adjacent transition, return HTTP `400` with a clear error message.

### 2.6 Drag-and-drop kanban UI

- [x] Replace the starter home page with an intake kanban board.
- [x] Render one column for each workflow stage in the defined order.
- [x] Render each column as an accessible `region` named with its stage label.
- [x] Render new leads in the `New Lead` column as they arrive from the stream.
- [x] Allow users to drag a lead card to another column.
- [x] On drop, calculate the requested transition from the lead's current status and the destination column.
- [x] Do not move the card optimistically for an invalid or gated drop.
- [x] If the destination is not the immediate next stage, reject the drop, keep the card in its source column, and display a plain-language validation message.
- [x] For a valid first or second transition, call the transition API and update the card from the response.
- [x] For a drop on `Schedule Assessment`, open the authorization dialog and keep the card in its current column until the gated request succeeds.
- [x] If the gated request is blocked, close neither the card's current column nor its status; keep the card in `Authorization Pending` and allow retry.
- [x] Provide a keyboard-accessible alternative to drag-and-drop, such as a `Move to next stage` action on the card.
- [x] Use shadcn/ui components for the card, button, badge, dialog, input, label, and checkbox controls.
- [x] Use an accessible dialog for authorization fields.
- [x] Label the three inputs exactly:
  - `Authorization number`
  - `Approval date`
  - `Diagnostic report uploaded`
- [x] Render the approval date as a date input.
- [x] Render the diagnostic report value as a checkbox.
- [x] Do not submit the transition automatically when a field changes.
- [x] Submit the transition only after a drop or explicit keyboard action is confirmed.
- [x] Show a connection or generator status so stakeholders can tell that new leads are arriving from the simulated integration.

### 2.7 Blocked transition feedback

When a user drops a lead on `Schedule Assessment` with incomplete requirements:

- [x] Send the request to the transition API.
- [x] Keep the lead in `Authorization Pending`.
- [x] Keep the dialog open.
- [x] Display the heading `This lead cannot move forward yet`.
- [x] Display the message `Complete the requirements below before scheduling an assessment.`.
- [x] Display every field returned in `missing_fields` as an unchecked requirement.
- [x] Display the completed count as `0 of 3`, `1 of 3`, `2 of 3`, or `3 of 3` based on the current form values.
- [x] Do not display a raw stack trace or expose server implementation details.

### 2.8 Successful transition feedback

When all three requirements are complete and the user confirms the transition again:

- [x] Send the complete payload to the transition API.
- [x] Update the lead card to `Schedule Assessment` without a full page reload.
- [x] Display the message `Lead advanced to Schedule Assessment`.
- [x] Display the saved authorization number and approval date in the lead detail view.
- [x] Display the diagnostic report requirement as complete.
- [x] Publish the updated lead to connected dashboard clients.

### 2.9 Demo reset

- [x] Implement this route:

  ```text
  POST /api/intake/demo/reset
  ```

- [x] Return HTTP `200` with the freshly reset in-memory lead list and generator state.
- [x] Add a `Reset demo` button to the board.
- [x] Make the button call `POST /api/intake/demo/reset`.
- [x] Reset must clear all generated leads, reset the generator sequence, cancel old timers, and restart the cadence.
- [x] Clear any visible success, error, drag, or connection message after reset.
- [x] Make reset available without a page refresh.
- [x] Call the same reset flow when the dashboard initially mounts so a browser reload starts a fresh demo.

### 2.10 Accessibility and presentation

- Use visible labels for every form control.
- Ensure drag-and-drop has a keyboard-accessible alternative.
- Ensure the gate error, transition result, and generator connection state are announced with accessible alert or status roles.
- Ensure keyboard users can select a lead, complete fields, submit, and close the detail view.
- Keep the board usable at desktop and mobile widths.
- Use plain-language labels in the UI; do not expose `HTTP 400` as the primary stakeholder-facing copy.

## 3. Tasks

### 3.1 Define the intake domain model

1. [x] Create `lib/intake/types.ts` with `IntakeStatus`, `IntakeLead`, `TransitionRequest`, and generator event types.
2. [x] Make the three authorization properties optional on `TransitionRequest` because they are required only for the gated transition.
3. [x] Define the four status string values in `lib/intake/statuses.ts`.
4. [x] Define the ordered transition map in `lib/intake/statuses.ts`.
5. [x] Define the exact display labels in `lib/intake/statuses.ts`.
6. [x] Define a deterministic dummy lead profile generator that creates a fresh lead with a unique ID and empty authorization values.

### 3.2 Implement the mock lead generator

1. [x] Create `lib/intake/lead-generator.ts` as a server-only in-memory engine that owns the lead sequence and timers.
2. [x] Implement `start`, `stop`, `reset`, `listLeads`, and subscription functions for lead-created and lead-updated events.
3. [x] Emit the first three leads at `t=0s`, `t=10s`, and `t=20s`, then emit later leads every 60 seconds.
4. [x] Ensure `reset` cancels old timers before clearing state and restarting the sequence.
5. [x] Keep the default cadence at 10 seconds and 60 seconds, with environment-controlled accelerated intervals for automated tests.
6. [x] Create an in-memory repository or generator facade for `listLeads`, `getLead`, `updateLead`, and `resetLeads`.

### 3.3 Implement transition validation

1. [x] Create `lib/intake/transition-validation.ts` with a pure validation function that accepts the current status and transition request.
2. [x] Reject any transition whose target status is not the immediate next status in the ordered transition map.
3. [x] Reject backward transitions and non-adjacent drag destinations before mutation.
4. [x] For `authorization_pending` to `schedule_assessment`, check all three required fields before changing lead data.
5. [x] Treat a trimmed empty authorization number, an empty or non-`YYYY-MM-DD` approval date, an impossible calendar date, and a false diagnostic upload as unmet requirements.
6. [x] Return all unmet field names in the deterministic order `authorization_number`, `approval_date`, `diagnostic_report_uploaded`.
7. Cover valid, blocked, partial, invalid-date, false-upload, non-adjacent, and backward transition cases with the integration test suite.

### 3.4 Implement the real-time intake API

1. [x] Create `app/api/intake/leads/route.ts` with a `GET` handler that returns the current in-memory lead list.
2. [x] Create `app/api/intake/leads/stream/route.ts` with an SSE handler that sends an initial snapshot and subsequent generator or update events.
3. [x] Create `app/api/intake/leads/[leadId]/status/route.ts` with a `PATCH` handler matching the transition contracts.
4. [x] Create `app/api/intake/demo/reset/route.ts` with a `POST` handler that resets the generator and returns the current reset state.
5. [x] Parse and validate request JSON before mutating any lead.
6. [x] Use the in-memory generator/repository for all reads and writes.
7. [x] Return `404` for an unknown lead ID.
8. [x] Return the exact `INTAKE_TRANSITION_BLOCKED` error shape for an incomplete gated transition.
9. [x] Publish every generated lead and successful update to connected SSE clients.

### 3.5 Add shadcn UI components

1. [x] Add the shadcn `badge`, `card`, `checkbox`, `dialog`, `input`, and `label` components to the project.
2. [x] Keep the existing `button` component generated during shadcn initialization.
3. [x] Verify each generated component uses the configured `@/components` and `@/lib` aliases.

### 3.6 Build the real-time kanban board

1. [x] Create `components/intake/IntakeBoard.tsx` as the client component that owns lead loading, SSE connection state, selected lead state, drag state, form state, request state, and feedback state.
2. [x] Create `components/intake/IntakeColumn.tsx` to render one status column and its lead cards.
3. [x] Create `components/intake/IntakeLeadCard.tsx` to render lead details, current status, requirement count, drag behavior, and keyboard transition action.
4. [x] Create `components/intake/IntakeLeadDialog.tsx` to render authorization fields and the gated transition action.
5. [x] Update `app/page.tsx` to render the intake board instead of the starter Next.js content.
6. [x] Call the reset endpoint on initial mount so every browser reload starts a new demo.
7. [x] Load the reset state from the API, then connect to the SSE stream.
8. [x] Add new cards from `lead_created` events without a page reload.
9. [x] Update cards from `lead_updated` events without duplicating or reordering unrelated leads.
10. [x] Reject invalid drops locally and restore the card to its source column.
11. [x] Submit adjacent transitions to the API and update board state only from successful responses or stream events.
12. [x] Open the authorization dialog for a drop targeting `Schedule Assessment`.
13. [x] Map `missing_fields` to human-readable blocked-transition feedback.
14. [x] Implement `Reset demo` by calling the reset endpoint and replacing the board state.

### 3.7 Add demo styling and accessibility

1. [x] Add a page heading that reads `Real-Time Intake Workflow Demo`.
2. [x] Add a short explanatory subtitle: `New leads arrive from the simulated GoHighLevel integration.`.
3. [x] Add a visible generator status such as `Listening for new leads`.
4. [x] Style the four columns so live arrivals and rejected drops are visible without scrolling horizontally on desktop.
5. [x] Make the columns stack vertically at mobile widths.
6. [x] Add accessible live status messages for lead arrivals, rejected drops, blocked transitions, and successful transitions.
7. [x] Set focus to the first missing field after a blocked response.
8. [x] Preserve the selected lead and feedback while the dialog remains open.

### 3.8 Verify the feature

1. [x] Add the `@playwright/test` dev dependency and a package script named `test:integration` with the command `playwright test`.
2. [x] Install the Chromium test browser with `npx playwright install chromium`.
3. [x] Run `npm run test:integration` with the accelerated generator cadence.
4. [x] Run `npm run lint`.
5. [x] Run `npm run build`.
6. [x] Confirm the first three generated leads arrive in order with the configured 10-second cadence in the normal demo configuration.
7. [x] Drag a lead from `New Lead` to `Schedule Assessment` and confirm it remains in `New Lead` with a skip validation message.
8. [x] Drag a lead through adjacent stages and confirm each successful transition updates the board.
9. [x] Attempt the gated drop with incomplete requirements and confirm the lead remains in `Authorization Pending`.
10. [x] Complete all three requirements and confirm the lead moves to `Schedule Assessment` without a page reload.
11. [x] Reload the page and confirm the old leads and statuses are gone and generation restarts from the first lead.

## 4. Acceptance Criteria

### Lead generation and real-time behavior

- [x] No static lead seed is required for the demo to start.
- [x] The mock generator creates the first lead immediately and creates the next two leads 10 seconds apart.
- [x] Leads after the first three are generated one minute apart in the normal demo configuration.
- [x] New leads appear in the `New Lead` column without a page refresh or polling loop.
- [x] Each generated lead has a unique ID, dummy display data, `new_lead` status, and incomplete authorization requirements.
- [x] Reset cancels the previous generator schedule and restarts the sequence.
- [x] Reloading the page resets the in-memory state and restarts lead generation.

### API behavior

- [x] `GET /api/intake/leads` returns the current generated leads.
- [x] `GET /api/intake/leads/stream` sends an initial snapshot and future lead or update events.
- [x] `PATCH /api/intake/leads/[leadId]/status` rejects non-adjacent and backward transitions with HTTP `400`.
- [x] A blocked schedule transition returns HTTP `400` with `error: "INTAKE_TRANSITION_BLOCKED"`.
- [x] The blocked response lists every unmet authorization field.
- [x] A blocked request does not change the lead status or stored authorization values.
- [x] A request with only one or two valid requirements returns HTTP `400` and lists only the unmet requirements.
- [x] A request with all three valid requirements returns HTTP `200` and changes the status to `schedule_assessment`.
- [x] The API returns HTTP `404` for an unknown lead ID.
- [x] Successful status updates are published to connected stream clients.

### UI behavior

- [x] The initial page shows four kanban columns in the required order.
- [x] Generated leads appear in `New Lead` as stream events arrive.
- [x] A lead cannot be dragged from `New Lead` directly to `Schedule Assessment`.
- [x] Invalid or skipped drops return the card to its original column and display a plain-language validation message.
- [x] Adjacent valid drops update the lead through the API.
- [x] A gated drop opens the authorization dialog and does not move the card before validation succeeds.
- [x] An incomplete submission displays `This lead cannot move forward yet` and keeps the lead in `Authorization Pending`.
- [x] The blocked feedback lists every unmet requirement in plain language.
- [x] A valid retry moves the lead to `Schedule Assessment` without a page reload.
- [x] A successful retry displays `Lead advanced to Schedule Assessment`.
- [x] `Reset demo` clears the board and restarts generation without a page reload.
- [x] Reloading the page clears the previous demo state.

### Quality and presentation

- [x] All form controls have visible labels and keyboard access.
- [x] Drag-and-drop has a keyboard-accessible alternative.
- [x] Lead arrivals, blocked transitions, rejected drops, and successful transitions are announced to assistive technology.
- [x] The interface is usable at desktop and mobile widths.
- [x] No real patient data, API keys, browser persistence, or external database is used.
- [x] `npm run lint` completes successfully.
- [x] `npm run build` completes successfully.
- [x] Playwright integration tests cover lead generation, stream updates, drag validation, the authorization gate, reset behavior, and API response contracts.
