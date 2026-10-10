import { z } from "zod"

import { EXTRACTION_SENTINELS, type ExtractionResult } from "./types"

const isValidIsoCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const isExtractionSentinel = (value: string) =>
  value === EXTRACTION_SENTINELS.NOT_DEFINED || value === EXTRACTION_SENTINELS.INSUFFICIENT

const extractionString = z.string().trim().min(1)

export const ExtractionResultSchema = z
  .object({
    parent_name: extractionString,
    child_name: extractionString,
    payer: extractionString,
    follow_up_date: extractionString.refine(
      (value) => isExtractionSentinel(value) || isValidIsoCalendarDate(value),
      "follow_up_date must be a real YYYY-MM-DD date or a documented sentinel",
    ),
  })
  .strict()

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    parent_name: { type: "string" },
    child_name: { type: "string" },
    payer: { type: "string" },
    follow_up_date: { type: "string" },
  },
  required: ["parent_name", "child_name", "payer", "follow_up_date"],
} as const

export const validateExtractionResult = (value: unknown): ExtractionResult =>
  ExtractionResultSchema.parse(value)
