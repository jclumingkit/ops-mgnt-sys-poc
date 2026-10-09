import {
  getIntakeGeneratorState,
  listIntakeLeads,
  resetIntakeGenerator,
} from "@/lib/intake/lead-generator"

export async function POST() {
  resetIntakeGenerator()

  return Response.json({
    leads: listIntakeLeads(),
    generator: getIntakeGeneratorState(),
  })
}
