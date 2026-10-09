import { expect, test, type APIRequestContext } from "@playwright/test"

type ShiftSession = {
  shift_id: string
  status: "active" | "clocked_out"
  responses: {
    outstanding_items: string | null
    waiting_on: string | null
    completed_summary: string | null
  }
  completed_prompts: string[]
  created_at: string
  clocked_out_at: string | null
}

const createSession = async (request: APIRequestContext) => {
  const response = await request.post("/api/clock-out/sessions")
  expect(response.status()).toBe(201)
  return (await response.json()) as ShiftSession
}

const saveResponse = async (
  request: APIRequestContext,
  shiftId: string,
  prompt: string,
  response: string,
) => request.patch(`/api/clock-out/sessions/${shiftId}/responses`, {
  data: { prompt, response },
})

test.describe("clock-out API", () => {
  test("creates unique active sessions with empty responses", async ({ request }) => {
    const first = await createSession(request)
    const second = await createSession(request)

    expect(first).toMatchObject({
      status: "active",
      responses: {
        outstanding_items: null,
        waiting_on: null,
        completed_summary: null,
      },
      completed_prompts: [],
      clocked_out_at: null,
    })
    expect(first.shift_id).not.toBe(second.shift_id)
  })

  test("validates blank responses and prompt order without mutating the session", async ({ request }) => {
    const session = await createSession(request)

    const blankResponse = await saveResponse(request, session.shift_id, "outstanding_items", "  \n ")
    expect(blankResponse.status()).toBe(400)
    await expect(blankResponse.json()).resolves.toMatchObject({
      error: "PROMPT_RESPONSE_INVALID",
      prompt: "outstanding_items",
    })

    const outOfOrderResponse = await saveResponse(
      request,
      session.shift_id,
      "completed_summary",
      "Completed the follow-up work.",
    )
    expect(outOfOrderResponse.status()).toBe(400)
    await expect(outOfOrderResponse.json()).resolves.toMatchObject({
      error: "PROMPT_SEQUENCE_BLOCKED",
      prompt: "completed_summary",
      required_previous_prompt: "waiting_on",
    })

    const secondPromptResponse = await saveResponse(
      request,
      session.shift_id,
      "waiting_on",
      "The benefits team.",
    )
    expect(secondPromptResponse.status()).toBe(400)
    await expect(secondPromptResponse.json()).resolves.toMatchObject({
      error: "PROMPT_SEQUENCE_BLOCKED",
      prompt: "waiting_on",
      required_previous_prompt: "outstanding_items",
    })

    const unchangedResponse = await request.get(`/api/clock-out/sessions/${session.shift_id}`)
    expect(await unchangedResponse.json()).toMatchObject({
      responses: {
        outstanding_items: null,
        waiting_on: null,
        completed_summary: null,
      },
      completed_prompts: [],
    })
  })

  test("trims accepted responses and enforces every clock-out gate", async ({ request }) => {
    const session = await createSession(request)

    const emptyClockOut = await request.post(`/api/clock-out/sessions/${session.shift_id}/clock-out`)
    expect(emptyClockOut.status()).toBe(400)
    await expect(emptyClockOut.json()).resolves.toMatchObject({
      error: "CLOCK_OUT_BLOCKED",
      missing_prompts: ["outstanding_items", "waiting_on", "completed_summary"],
    })

    const firstResponse = await saveResponse(
      request,
      session.shift_id,
      "outstanding_items",
      "  Waiting for a payer response.  ",
    )
    expect(firstResponse.status()).toBe(200)
    expect((await firstResponse.json()).responses.outstanding_items).toBe("Waiting for a payer response.")

    const onePromptClockOut = await request.post(`/api/clock-out/sessions/${session.shift_id}/clock-out`)
    expect(onePromptClockOut.status()).toBe(400)
    await expect(onePromptClockOut.json()).resolves.toMatchObject({
      missing_prompts: ["waiting_on", "completed_summary"],
    })

    expect((await saveResponse(request, session.shift_id, "waiting_on", "The benefits team.")).status()).toBe(200)

    const twoPromptClockOut = await request.post(`/api/clock-out/sessions/${session.shift_id}/clock-out`)
    expect(twoPromptClockOut.status()).toBe(400)
    await expect(twoPromptClockOut.json()).resolves.toMatchObject({
      missing_prompts: ["completed_summary"],
    })

    const blockedState = await request.get(`/api/clock-out/sessions/${session.shift_id}`)
    await expect(blockedState.json()).resolves.toMatchObject({
      status: "active",
      responses: {
        outstanding_items: "Waiting for a payer response.",
        waiting_on: "The benefits team.",
        completed_summary: null,
      },
    })

    expect(
      (await saveResponse(request, session.shift_id, "completed_summary", "Reviewed open cases.")).status(),
    ).toBe(200)

    const successResponse = await request.post(`/api/clock-out/sessions/${session.shift_id}/clock-out`)
    expect(successResponse.status()).toBe(200)
    const completedSession = (await successResponse.json()) as ShiftSession
    expect(completedSession).toMatchObject({
      status: "clocked_out",
      completed_prompts: ["outstanding_items", "waiting_on", "completed_summary"],
      responses: {
        outstanding_items: "Waiting for a payer response.",
        waiting_on: "The benefits team.",
        completed_summary: "Reviewed open cases.",
      },
    })
    expect(completedSession.clocked_out_at).toEqual(expect.any(String))

    const repeatedClockOut = await request.post(`/api/clock-out/sessions/${session.shift_id}/clock-out`)
    expect(repeatedClockOut.status()).toBe(409)
    await expect(repeatedClockOut.json()).resolves.toMatchObject({
      error: "SHIFT_ALREADY_CLOCKED_OUT",
    })

    const unchangedCompletedSession = await request.get(`/api/clock-out/sessions/${session.shift_id}`)
    await expect(unchangedCompletedSession.json()).resolves.toEqual(completedSession)

    const afterClockOutResponse = await saveResponse(
      request,
      session.shift_id,
      "completed_summary",
      "Another response.",
    )
    expect(afterClockOutResponse.status()).toBe(409)
  })

  test("handles unknown sessions and invalid request bodies", async ({ request }) => {
    const unknownGet = await request.get("/api/clock-out/sessions/missing-shift")
    expect(unknownGet.status()).toBe(404)

    const unknownClockOut = await request.post("/api/clock-out/sessions/missing-shift/clock-out")
    expect(unknownClockOut.status()).toBe(404)

    const session = await createSession(request)
    const malformedCreate = await request.post("/api/clock-out/sessions", {
      data: "{",
      headers: { "content-type": "application/json" },
    })
    expect(malformedCreate.status()).toBe(400)

    const malformed = await request.patch(`/api/clock-out/sessions/${session.shift_id}/responses`, {
      data: "{",
      headers: { "content-type": "application/json" },
    })
    expect(malformed.status()).toBe(400)

    for (const data of [
      { prompt: "not_a_prompt", response: "Text" },
      { prompt: "outstanding_items", response: 123 },
      { prompt: "outstanding_items", response: "Text", extra: true },
    ]) {
      const response = await request.patch(`/api/clock-out/sessions/${session.shift_id}/responses`, { data })
      expect(response.status()).toBe(400)
    }

    const malformedClockOut = await request.post(
      `/api/clock-out/sessions/${session.shift_id}/clock-out`,
      {
        data: "{",
        headers: { "content-type": "application/json" },
      },
    )
    expect(malformedClockOut.status()).toBe(400)

    const nonEmptyClockOut = await request.post(
      `/api/clock-out/sessions/${session.shift_id}/clock-out`,
      { data: { completed: 3 } },
    )
    expect(nonEmptyClockOut.status()).toBe(400)

    const unchangedSession = await request.get(`/api/clock-out/sessions/${session.shift_id}`)
    await expect(unchangedSession.json()).resolves.toMatchObject({
      status: "active",
      completed_prompts: [],
    })
  })
})
