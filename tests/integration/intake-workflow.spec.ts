import { expect, test, type Page } from "@playwright/test"

const moveButton = (page: Page, leadName: string, destination: string) =>
  page.getByRole("button", {
    name: `Move ${leadName} to ${destination}`,
    exact: true,
  })

const dragLeadTo = async (page: Page, destination: string) => {
  const leadCard = page.getByTestId("intake-lead-card-intake-lead-001")
  const destinationColumn = page.getByTestId(`intake-column-${destination}`)
  const sourceBox = await leadCard.boundingBox()
  const destinationBox = await destinationColumn.boundingBox()

  if (!sourceBox || !destinationBox) {
    throw new Error("Could not locate the drag source and destination.")
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 3)
  await page.mouse.down()
  await page.mouse.move(
    destinationBox.x + destinationBox.width / 2,
    destinationBox.y + destinationBox.height / 2,
    { steps: 8 },
  )
  await page.mouse.up()
}

test.describe("real-time gated intake workflow", () => {
  test("receives the first three generated leads in order", async ({ page }) => {
    await page.goto("/")

    const newLeadColumn = page.getByRole("region", { name: "New Lead" })
    await expect(newLeadColumn).toContainText("Demo Lead 001")
    await expect(newLeadColumn).toContainText("Demo Lead 002", { timeout: 15_000 })
    await expect(newLeadColumn).toContainText("Demo Lead 003", { timeout: 15_000 })

    await expect(
      page.getByTestId("intake-lead-card-intake-lead-001"),
    ).toBeVisible()
    await expect(
      page.getByTestId("intake-lead-card-intake-lead-002"),
    ).toBeVisible()
    await expect(
      page.getByTestId("intake-lead-card-intake-lead-003"),
    ).toBeVisible()
  })

  test("rejects a skipped drag and keeps the lead in its source column", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")

    await dragLeadTo(page, "schedule_assessment")

    await expect(page.getByRole("alert").filter({ hasText: "Demo Lead 001 must move to" })).toContainText(
      "Demo Lead 001 must move to Benefits Verification before Schedule Assessment.",
    )
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")
    await expect(page.getByRole("region", { name: "Schedule Assessment" })).not.toContainText(
      "Demo Lead 001",
    )
  })

  test("moves a lead to the next stage with drag and drop", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")

    const transitionResponse = page.waitForResponse(
      (response) => response.url().includes("/api/intake/leads/intake-lead-001/status"),
    )
    await dragLeadTo(page, "benefits_verification")
    await expect((await transitionResponse).status()).toBe(200)

    await expect(page.getByRole("region", { name: "Benefits Verification" })).toContainText(
      "Demo Lead 001",
    )
    await expect(page.getByRole("region", { name: "New Lead" })).not.toContainText("Demo Lead 001")
  })

  test("advances a lead through adjacent stages", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")

    await moveButton(page, "Demo Lead 001", "Benefits Verification").click()
    await expect(page.getByRole("region", { name: "Benefits Verification" })).toContainText(
      "Demo Lead 001",
    )

    await moveButton(page, "Demo Lead 001", "Authorization Pending").click()
    await expect(page.getByRole("region", { name: "Authorization Pending" })).toContainText(
      "Demo Lead 001",
    )
  })

  test("keeps an incomplete gated transition blocked and focuses the first missing field", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")

    await moveButton(page, "Demo Lead 001", "Benefits Verification").click()
    await moveButton(page, "Demo Lead 001", "Authorization Pending").click()
    await moveButton(page, "Demo Lead 001", "Schedule Assessment").click()

    await expect(page.getByRole("heading", { name: "This lead cannot move forward yet" })).toBeVisible()
    await expect(page.getByRole("alert")).toContainText(
      "Complete the requirements below before scheduling an assessment.",
    )
    await expect(page.getByText("0 of 3")).toBeVisible()
    await expect(page.getByLabel("Authorization number")).toBeFocused()
    await expect(page.getByTestId("intake-lead-card-intake-lead-001")).toBeVisible()
    await expect(
      page.getByTestId("intake-column-schedule_assessment").getByTestId(
        "intake-lead-card-intake-lead-001",
      ),
    ).toHaveCount(0)
  })

  test("moves a lead after all authorization requirements are confirmed", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")

    await moveButton(page, "Demo Lead 001", "Benefits Verification").click()
    await moveButton(page, "Demo Lead 001", "Authorization Pending").click()
    await moveButton(page, "Demo Lead 001", "Schedule Assessment").click()

    await page.getByLabel("Authorization number").fill("AUTH-12345")
    await page.getByLabel("Approval date").fill("2026-10-09")
    await page.getByRole("checkbox", { name: "Diagnostic report uploaded" }).check()
    await expect(page.getByText("3 of 3")).toBeVisible()
    await page.getByRole("button", { name: "Confirm transition" }).click()

    await expect(page.locator('[role="status"]:not(.sr-only)').getByText(
      "Lead advanced to Schedule Assessment",
    )).toBeVisible()
    await expect(page.getByRole("region", { name: "Schedule Assessment" })).toContainText(
      "Demo Lead 001",
    )
    await expect(page.getByRole("region", { name: "Schedule Assessment" })).toContainText(
      "AUTH-12345",
    )
    await expect(page.getByRole("region", { name: "Schedule Assessment" })).toContainText(
      "Diagnostic report uploaded",
    )
  })

  test("resets the board and restarts generation on reload", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")

    await moveButton(page, "Demo Lead 001", "Benefits Verification").click()
    await moveButton(page, "Demo Lead 001", "Authorization Pending").click()
    await moveButton(page, "Demo Lead 001", "Schedule Assessment").click()
    await page.getByLabel("Authorization number").fill("AUTH-12345")
    await page.getByLabel("Approval date").fill("2026-10-09")
    await page.getByRole("checkbox", { name: "Diagnostic report uploaded" }).check()
    await page.getByRole("button", { name: "Confirm transition" }).click()
    await expect(page.getByRole("region", { name: "Schedule Assessment" })).toContainText(
      "Demo Lead 001",
    )

    await page.reload()
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")
    await expect(page.getByRole("region", { name: "Schedule Assessment" })).not.toContainText(
      "Demo Lead 001",
    )

    await page.getByRole("button", { name: "Reset demo", exact: true }).click()
    await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")
    await expect(page.locator('span[role="status"]').filter({ hasText: "Listening for new leads" })).toBeVisible()
  })
})
