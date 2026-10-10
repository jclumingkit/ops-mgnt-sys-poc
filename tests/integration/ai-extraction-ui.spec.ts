import { expect, test } from "@playwright/test"

const result = { parent_name: "Jane Doe", child_name: "Sam", payer: "BCBS", follow_up_date: "2026-10-13" }
const event = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
const output = JSON.stringify(result, null, 2)
const successfulStream = event("extraction_started", { attempt: 1, max_attempts: 3 })
  + event("output_delta", { text: output })
  + event("extraction_complete", { result })
  + event("done", { success: true })

test("shows validated JSON, rejects blank notes, and recovers from extraction errors", async ({ page }) => {
  let attempts = 0
  await page.route("**/api/ai-extraction/extract", async (route) => {
    attempts += 1
    await route.fulfill({
      contentType: "text/event-stream",
      body: attempts === 1
        ? event("extraction_error", { code: "EXTRACTION_FAILED" }) + event("done", { success: false })
        : successfulStream,
    })
  })
  const initialized = page.waitForResponse("**/api/clock-out/sessions")
  await page.goto("/ai-extraction")
  await initialized
  await page.getByLabel("Raw call notes").fill(" ")
  await page.getByRole("button", { name: "Start extraction" }).click()
  await expect(page.locator("#ai-extraction-feedback")).toContainText("Enter call notes")
  expect(attempts).toBe(0)

  await page.getByLabel("Raw call notes").fill("Mock call notes for Jane and Sam.")
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.locator("#ai-extraction-feedback")).toContainText("The details could not be extracted right now")
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByText("Extraction complete", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Streaming extraction JSON")).toHaveText(output)
  await expect(page.locator("#ai-extraction-feedback")).toHaveCount(0)
})

test("handles an interrupted stream without staying in a loading state", async ({ page }) => {
  await page.route("**/api/ai-extraction/extract", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: event("output_delta", { text: "{\"parent_name\":" }),
  }))
  await page.goto("/ai-extraction")
  await page.getByRole("button", { name: "Start extraction" }).click()
  await expect(page.locator("#ai-extraction-feedback")).toContainText("stream ended before a result")
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled()
})

test("supports mobile navigation and the end-of-day dialog without horizontal overflow", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await expect(page.getByRole("region", { name: "New Lead" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  await page.getByRole("button", { name: "Clock Out" }).click()
  await expect(page.getByLabel("What items are currently outstanding?")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
