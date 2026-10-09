export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMockLeadGenerator } = await import("./lib/gohighlevel/lead-generator")
    const { startIntakeGenerator } = await import("./lib/intake/lead-generator")

    startMockLeadGenerator()
    startIntakeGenerator()
  }
}
