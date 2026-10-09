import { expect, test, type APIRequestContext } from "@playwright/test"

type ResetResponse = {
  leads: Array<{
    id: string
    status: string
  }>
  generator: {
    running: boolean
    next_sequence: number
    lead_count: number
  }
}

const resetLead = async (request: APIRequestContext) => {
  const response = await request.post("/api/intake/demo/reset")
  expect(response.status()).toBe(200)
  const body = (await response.json()) as ResetResponse
  return body.leads[0].id
}

const advanceToAuthorizationPending = async (
  request: APIRequestContext,
  leadId: string,
) => {
  for (const status of ["benefits_verification", "authorization_pending"]) {
    const response = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: { status },
    })
    expect(response.status()).toBe(200)
  }
}

test.describe("intake API", () => {
  test("resets and returns a fresh generated lead", async ({ request }) => {
    const response = await request.post("/api/intake/demo/reset")
    expect(response.status()).toBe(200)

    const body = (await response.json()) as ResetResponse
    expect(body.leads).toHaveLength(1)
    expect(body.leads[0]).toMatchObject({
      id: "intake-lead-001",
      status: "new_lead",
    })
    expect(body.generator).toMatchObject({
      running: true,
      next_sequence: 2,
      lead_count: 1,
    })
  })

  test("keeps generated lead identity fields unique", async ({ request }) => {
    await resetLead(request)

    await expect.poll(async () => {
      const response = await request.get("/api/intake/leads")
      const leads = (await response.json()) as Array<{
        id: string
        display_name: string
        payer: string
      }>
      return leads.length
    }).toBeGreaterThanOrEqual(6)

    const leads = (await (await request.get("/api/intake/leads")).json()) as Array<{
      id: string
      display_name: string
      payer: string
    }>
    const firstSix = leads.slice(0, 6)
    expect(new Set(firstSix.map((lead) => lead.id)).size).toBe(6)
    expect(new Set(firstSix.map((lead) => lead.display_name)).size).toBe(6)
    expect(new Set(firstSix.map((lead) => lead.payer)).size).toBe(6)
  })

  test("enforces adjacent transitions and the authorization gate", async ({ request }) => {
    const leadId = await resetLead(request)

    const skippedResponse = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: { status: "authorization_pending" },
    })
    expect(skippedResponse.status()).toBe(400)

    for (const status of ["benefits_verification", "authorization_pending"]) {
      const response = await request.patch(`/api/intake/leads/${leadId}/status`, {
        data: { status },
      })
      expect(response.status()).toBe(200)
      expect((await response.json()).status).toBe(status)
    }

    const blockedResponse = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: { status: "schedule_assessment" },
    })
    expect(blockedResponse.status()).toBe(400)
    await expect(blockedResponse.json()).resolves.toMatchObject({
      error: "INTAKE_TRANSITION_BLOCKED",
      missing_fields: [
        "authorization_number",
        "approval_date",
        "diagnostic_report_uploaded",
      ],
    })

    const successResponse = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: {
        status: "schedule_assessment",
        authorization_number: " AUTH-12345 ",
        approval_date: "2026-10-09",
        diagnostic_report_uploaded: true,
      },
    })
    expect(successResponse.status()).toBe(200)
    expect(await successResponse.json()).toMatchObject({
      status: "schedule_assessment",
      authorization_number: "AUTH-12345",
      approval_date: "2026-10-09",
      diagnostic_report_uploaded: true,
    })
  })

  test("returns 404 for an unknown lead", async ({ request }) => {
    const response = await request.patch("/api/intake/leads/missing/status", {
      data: { status: "benefits_verification" },
    })

    expect(response.status()).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: "LEAD_NOT_FOUND",
    })
  })

  test("rejects malformed, unsupported, and backward transitions", async ({ request }) => {
    const leadId = await resetLead(request)

    const malformedResponse = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: "{",
    })
    expect(malformedResponse.status()).toBe(400)

    for (const data of [{}, { status: "unsupported_status" }]) {
      const response = await request.patch(`/api/intake/leads/${leadId}/status`, { data })
      expect(response.status()).toBe(400)
    }

    await advanceToAuthorizationPending(request, leadId)
    const backwardResponse = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: { status: "new_lead" },
    })
    expect(backwardResponse.status()).toBe(400)
  })

  test("reports every unmet partial authorization requirement without mutating the lead", async ({ request }) => {
    const leadId = await resetLead(request)
    await advanceToAuthorizationPending(request, leadId)

    const invalidDateResponse = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: {
        status: "schedule_assessment",
        authorization_number: "AUTH-12345",
        approval_date: "2026-02-30",
        diagnostic_report_uploaded: false,
      },
    })
    expect(invalidDateResponse.status()).toBe(400)
    await expect(invalidDateResponse.json()).resolves.toMatchObject({
      error: "INTAKE_TRANSITION_BLOCKED",
      missing_fields: ["approval_date", "diagnostic_report_uploaded"],
    })

    const partialResponse = await request.patch(`/api/intake/leads/${leadId}/status`, {
      data: {
        status: "schedule_assessment",
        authorization_number: "AUTH-12345",
        approval_date: "2026-10-09",
        diagnostic_report_uploaded: false,
      },
    })
    expect(partialResponse.status()).toBe(400)
    await expect(partialResponse.json()).resolves.toMatchObject({
      error: "INTAKE_TRANSITION_BLOCKED",
      missing_fields: ["diagnostic_report_uploaded"],
    })

    const leadsResponse = await request.get("/api/intake/leads")
    const leads = (await leadsResponse.json()) as Array<{
      id: string
      status: string
      authorization_number: string
      approval_date: string
      diagnostic_report_uploaded: boolean
    }>
    expect(leads.find((lead) => lead.id === leadId)).toMatchObject({
      status: "authorization_pending",
      authorization_number: "",
      approval_date: "",
      diagnostic_report_uploaded: false,
    })
  })
})
