import { expect, test } from "@playwright/test"

test("advances a lead through the keyboard action and authorization dialog", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Real-Time Intake Workflow Demo" })).toBeVisible()
  await expect(page.getByRole("region", { name: "New Lead" })).toContainText("Demo Lead 001")
  await expect(page.getByRole("region", { name: "Benefits Verification" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Authorization Pending" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Schedule Assessment" })).toBeVisible()

  const moveNext = page.getByRole("button", {
    name: "Move Demo Lead 001 to Benefits Verification",
    exact: true,
  })
  await moveNext.click()
  await expect(page.getByRole("region", { name: "Benefits Verification" })).toContainText("Demo Lead 001")

  await page.getByRole("button", {
    name: "Move Demo Lead 001 to Authorization Pending",
    exact: true,
  }).click()
  await expect(page.getByRole("region", { name: "Authorization Pending" })).toContainText("Demo Lead 001")

  await page.getByRole("button", {
    name: "Move Demo Lead 001 to Schedule Assessment",
    exact: true,
  }).click()
  await expect(page.getByRole("heading", { name: "This lead cannot move forward yet" })).toBeVisible()
  await expect(
    page.getByRole("alert").getByText("Complete the requirements below before scheduling an assessment."),
  ).toBeVisible()
  await expect(page.getByText("0 of 3")).toBeVisible()

  await page.getByLabel("Authorization number").fill("AUTH-12345")
  await page.getByLabel("Approval date").fill("2026-10-09")
  await page.getByRole("checkbox", { name: "Diagnostic report uploaded" }).check()
  await expect(page.getByText("3 of 3")).toBeVisible()

  await page.getByRole("button", { name: "Confirm transition" }).click()
  await expect(
    page.locator('[role="status"]:not(.sr-only)').getByText("Lead advanced to Schedule Assessment"),
  ).toBeVisible()
  await expect(page.getByRole("region", { name: "Schedule Assessment" })).toContainText("Demo Lead 001")
  await expect(page.getByRole("region", { name: "Schedule Assessment" })).toContainText("AUTH-12345")
})
