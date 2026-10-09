import {
  getNextIntakeStatus,
  isIntakeStatus,
  type IntakeStatus,
} from "./statuses"
import type { TransitionRequest } from "./types"

export const AUTHORIZATION_FIELDS = [
  "authorization_number",
  "approval_date",
  "diagnostic_report_uploaded",
] as const

export type AuthorizationField = (typeof AUTHORIZATION_FIELDS)[number]

type ValidationResult =
  | {
      ok: true
      status: IntakeStatus
      authorization?: {
        authorization_number: string
        approval_date: string
        diagnostic_report_uploaded: true
      }
    }
  | {
      ok: false
      kind: "invalid_transition" | "blocked"
      message: string
      missing_fields?: AuthorizationField[]
    }

const isRealIsoDate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split("-").map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

export const validateTransition = (
  currentStatus: IntakeStatus,
  request: TransitionRequest,
): ValidationResult => {
  if (!isIntakeStatus(request.status)) {
    return {
      ok: false,
      kind: "invalid_transition",
      message: "The requested intake status is not supported.",
    }
  }

  const targetStatus = request.status
  if (getNextIntakeStatus(currentStatus) !== targetStatus) {
    return {
      ok: false,
      kind: "invalid_transition",
      message: `A lead can only move from ${currentStatus} to its next intake stage.`,
    }
  }

  if (currentStatus !== "authorization_pending") {
    return { ok: true, status: targetStatus }
  }

  const missingFields: AuthorizationField[] = []
  const authorizationNumber =
    typeof request.authorization_number === "string"
      ? request.authorization_number.trim()
      : ""
  const approvalDate =
    typeof request.approval_date === "string" ? request.approval_date : ""

  if (!authorizationNumber) {
    missingFields.push("authorization_number")
  }
  if (!isRealIsoDate(approvalDate)) {
    missingFields.push("approval_date")
  }
  if (request.diagnostic_report_uploaded !== true) {
    missingFields.push("diagnostic_report_uploaded")
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      kind: "blocked",
      message: "The lead cannot move to Schedule Assessment yet.",
      missing_fields: missingFields,
    }
  }

  return {
    ok: true,
    status: targetStatus,
    authorization: {
      authorization_number: authorizationNumber,
      approval_date: approvalDate,
      diagnostic_report_uploaded: true,
    },
  }
}
