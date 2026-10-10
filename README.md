# Operations management PoC

A lightweight Next.js application demonstrating a gated intake pipeline, sequential end-of-day prompts, and structured AI extraction. The UI makes each API workflow visible for demos. All bundled leads and call notes are mock data.

## Run locally

1. Install **Node.js 20.9+** and npm.
2. Install dependencies from the repository root:

   ```bash
   npm ci
   ```

3. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

4. Set `OPENROUTER_API_KEY` in `.env.local` to your OpenRouter API key. The application uses `deepseek/deepseek-v4.1-flash`. Keep the key in the environment file; `.env.local` is ignored by Git. Intake and clock-out work without a key; AI extraction returns a handled HTTP 503 until one is configured.
5. Start the application:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000). Restart the server after changing environment variables.

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Server-side API key for AI extraction | Required for extraction |
| `AI_EXTRACTION_TIMEOUT_MS` | Provider timeout per attempt; at most three attempts | `30000` |
| `INTAKE_FIRST_THREE_INTERVAL_MS` | Arrival interval for the second and third mock leads; the first arrives immediately | `10000` |
| `INTAKE_FOLLOWING_INTERVAL_MS` | Arrival interval for subsequent mock leads | `60000` |

## Demo workflows

- **Intake:** `/` (also `/dashboard`). Drag a lead or use its next-stage button. Scheduling requires an authorization number, a real `YYYY-MM-DD` approval date, and confirmation that the diagnostic report is uploaded. Reset demo or reload the intake page to restart the feed.
- **Clock-out:** Choose **Clock Out** in the sidebar. Save each answer to unlock the next prompt, review or edit saved responses, then clock out. Reloading starts a fresh shift session.
- **AI extraction:** `/ai-extraction`. Edit the mock notes and start extraction. JSON streams into the result panel; only strictly validated output is marked complete. Invalid output and provider errors are retried up to three total attempts.

Lead and shift state is stored in server memory, with no database. Server restarts clear it. AI notes are not persisted by this application. Use dummy/mock information for demos.

## API reference

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/intake/leads` | List cases and generator state |
| `GET` | `/api/intake/leads/stream` | Receive live intake events (SSE) |
| `POST` | `/api/intake/demo/reset` | Reset the simulated intake feed |
| `PATCH` | `/api/intake/leads/:leadId/status` | Advance a case; send `status` and the three authorization fields when scheduling |
| `POST` | `/api/clock-out/sessions` | Create a shift session |
| `GET` | `/api/clock-out/sessions/:shiftId` | Read a shift session |
| `PATCH` | `/api/clock-out/sessions/:shiftId/responses` | Save `{ "prompt": "outstanding_items", "response": "..." }`; subsequent keys are `waiting_on` and `completed_summary` |
| `POST` | `/api/clock-out/sessions/:shiftId/clock-out` | Clock out only after all three saved prompts are complete |
| `POST` | `/api/ai-extraction/extract` | Send `{ "notes": "..." }`; receive SSE events with a validated `result` in the JSON data of `extraction_complete` |

The legacy mock GoHighLevel feed remains available at `GET /api/gohighlevel/leads`.

## Verification

```bash
npx playwright install chromium  # First-time browser setup
npm run lint
npm run test:integration
npm run build
```

Playwright starts a local development server automatically and accelerates the mock feed. Stop any existing server on port 3000 before running the suite so the test settings take effect. AI tests substitute a controlled provider in the test runner and mock browser responses; they require no real key or paid requests. The running application uses the real OpenRouter SDK.

For a production-mode local run, use `npm run build` followed by `npm start`.

See [the original PoC requirements](docs/poc-requirements.md) and [the cleanup overview](docs/implementation-overview.md).
