## Task Objective

Build a lightweight proof-of-concept (PoC) API and minimal front-end interface demonstrating gated state transitions, sequential workflow rules, and structured AI data extraction.

## Core Requirements

1. Gated Intake Workflow Engine (Back-End)
   Implement a basic state machine API for an intake process with four sequential stages:

- New Lead
- Benefits Verification
- Authorization Pending
- Schedule Assessment

### Gate Rule: A case record cannot transition from Authorization Pending to Schedule Assessment unless all three required fields exist in the payload:

- authorization_number (string)
- approval_date (ISO date)
- diagnostic_report_uploaded (boolean = true)

If an API request attempts to advance the status without these fields present, the API must reject the update with a clear, handled HTTP 400 error detailing the missing items.

2. Sequential Prompts & Gated Clock-Out (Front-End & Back-End)
   Build a simple user UI and validation endpoint for an end-of-day workflow:

Sequential UI: Present a 3-question sequence:

- "What items are currently outstanding?"
- "Who are you waiting on for response?"
- "Summary of work completed today."

Rule: Question 2 must remain locked/hidden until Question 1 is answered; Question 3 must remain locked/hidden until Question 2 is answered. Blank submissions are invalid.

Gated Clock-Out: The "Clock Out" API endpoint must reject the request unless all 3 prompts are completed for that shift session.

3. Structured AI Extraction Endpoint
   Create an API endpoint that connects to an LLM provider (e.g., OpenAI or Anthropic API):

- Input: A raw text string of call notes (e.g., "Spoke with Jane Doe regarding child Sam. Insurance is BCBS. Needs ABA service. Follow up next Tuesday.").

- Output: Extract and return structured JSON containing parent_name, child_name, payer, and follow_up_date.

- Rule: Enforce strict JSON output parsing. Implement basic error handling/retry logic so that invalid LLM output or API timeouts do not crash the application server.

## Instructions & Deliverables

- Setup File: Include a README.md with step-by-step instructions on how to install dependencies, configure environment variables (.env), and run the server locally.
- Security: Do not hardcode API keys, database credentials, or secret tokens in your code. Use environment variables with a .env.example file.
- Data: Use dummy/mock data only.
