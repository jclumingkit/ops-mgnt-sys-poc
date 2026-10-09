import { expect, test } from "@playwright/test"

test.describe("clock-out workflow", () => {
  test("reveals prompts only after successful saves and gates clock-out", async ({ page }) => {
    let clockOutRequests = 0
    page.on("request", (request) => {
      if (request.url().includes("/api/clock-out/sessions/") && request.url().endsWith("/clock-out")) {
        clockOutRequests += 1
      }
    })

    await page.goto("/")

    await page.getByRole("button", { name: "Clock Out" }).click()
    await expect(page.getByRole("heading", { name: "End-of-Day Check-In" })).toBeVisible()
    await expect(page.getByLabel("What items are currently outstanding?")).toBeVisible()
    await expect(page.getByLabel("Who are you waiting on for response?")).toHaveCount(0)
    await expect(page.getByText("0/3 complete")).toBeVisible()
    await expect(page.getByRole("button", { name: "Clock Out" })).toBeDisabled()

    await page.getByLabel("What items are currently outstanding?").fill("  ")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(page.locator("#clock-out-feedback")).toContainText("Enter a response before continuing.")
    await expect(page.getByLabel("Who are you waiting on for response?")).toHaveCount(0)

    await page.getByLabel("What items are currently outstanding?").fill("Waiting for a payer response.")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(page.getByLabel("What items are currently outstanding?")).toHaveCount(0)
    await expect(page.getByLabel("Who are you waiting on for response?")).toBeVisible()
    await expect(page.getByLabel("Summary of work completed today.")).toHaveCount(0)
    await expect(page.getByText("1/3 complete")).toBeVisible()

    await page.getByLabel("Who are you waiting on for response?").fill("The benefits team.")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(page.getByLabel("Who are you waiting on for response?")).toHaveCount(0)
    await expect(page.getByLabel("Summary of work completed today.")).toBeVisible()
    await expect(page.getByText("2/3 complete")).toBeVisible()

    await page.getByLabel("Summary of work completed today.").fill("Reviewed open cases.")
    await page.getByRole("button", { name: "Save response" }).click()
    await expect(page.getByLabel("Summary of work completed today.")).toHaveCount(0)
    await expect(page.getByText("All prompts are complete. You can clock out when you are ready.")).toBeVisible()
    await expect(page.getByText("3/3 complete")).toBeVisible()
    await expect(page.getByRole("button", { name: "Clock Out" })).toBeEnabled()

    await page.getByRole("button", { name: "Edit" }).first().click()
    await expect(page.getByLabel("What items are currently outstanding?")).toBeVisible()
    await page.getByLabel("What items are currently outstanding?").fill("Updated payer response.")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(
      page.getByRole("region", { name: "Saved responses" }).getByText("Updated payer response."),
    ).toBeVisible()

    await page.getByRole("button", { name: "Clock Out" }).click()
    expect(clockOutRequests).toBe(1)
    await expect(page.locator("#clock-out-feedback")).toContainText("Clocked out successfully.")
    await expect(page.getByRole("button", { name: "Clocked out" })).toBeDisabled()
    await expect(page.getByLabel("What items are currently outstanding?")).toHaveCount(0)

    await page.reload()
    await page.getByRole("button", { name: "Clock Out" }).click()
    await expect(page.getByText("0/3 complete")).toBeVisible()
    await expect(page.getByLabel("What items are currently outstanding?")).toBeVisible()
  })

  test("starts a new in-memory workflow after reload", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Clock Out" }).click()
    await expect(page.getByRole("heading", { name: "End-of-Day Check-In" })).toBeVisible()
    await page.getByLabel("What items are currently outstanding?").fill("A response is pending.")

    await page.reload()
    await page.getByRole("button", { name: "Clock Out" }).click()
    await expect(page.getByRole("heading", { name: "End-of-Day Check-In" })).toBeVisible()
    await expect(page.getByLabel("What items are currently outstanding?")).toHaveValue("")
    await expect(page.getByLabel("Who are you waiting on for response?")).toHaveCount(0)
  })

  test("focuses the first missing prompt after an API clock-out rejection", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Clock Out" }).click()
    await expect(page.getByRole("heading", { name: "End-of-Day Check-In" })).toBeVisible()

    for (const [label, response, action] of [
      ["What items are currently outstanding?", "A response is pending.", "Continue"],
      ["Who are you waiting on for response?", "The benefits team.", "Continue"],
      ["Summary of work completed today.", "Reviewed open cases.", "Save response"],
    ] as const) {
      await page.getByLabel(label).fill(response)
      await page.getByRole("button", { name: action }).click()
    }

    await page.route(/\/api\/clock-out\/sessions\/[^/]+\/clock-out$/, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "CLOCK_OUT_BLOCKED",
          message: "Complete all end-of-day prompts before clocking out.",
          missing_prompts: ["outstanding_items"],
        }),
      })
    })

    await page.getByRole("button", { name: "Clock Out" }).click()
    await expect(page.locator("#clock-out-feedback")).toContainText(
      "Complete all end-of-day prompts before clocking out.",
    )
    await expect(page.getByLabel("What items are currently outstanding?")).toBeFocused()
  })

  test("recovers from session initialization failure with a new shift", async ({ page }) => {
    let attempts = 0
    await page.route("**/api/clock-out/sessions", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue()
        return
      }

      attempts += 1
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "SERVICE_UNAVAILABLE" }),
        })
        return
      }

      await route.continue()
    })

    await page.goto("/")
    await page.getByRole("button", { name: "Clock Out" }).click()
    await expect(page.locator("#clock-out-feedback")).toContainText(
      "The end-of-day check-in could not be started. Please try again.",
    )
    await page.getByRole("button", { name: "Start new shift" }).click()
    await expect(page.getByLabel("What items are currently outstanding?")).toBeVisible()
  })
})
