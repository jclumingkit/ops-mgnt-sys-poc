import {
  listIntakeLeads,
  startIntakeGenerator,
} from "@/lib/intake/lead-generator"

export function GET(request: Request) {
  void request.url

  startIntakeGenerator()
  return new Response(JSON.stringify(listIntakeLeads()), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  })
}
