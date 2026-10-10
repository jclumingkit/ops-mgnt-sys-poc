// Test-only SDK substitute. The application and Next.js server use the real SDK.
export const providerAttempts: (string[] | Error)[] = []
export const providerCalls: { input: unknown; options: unknown }[] = []
export const providerCancellations: number[] = []

export class OpenRouter {
  callModel(input: unknown, options: unknown) {
    providerCalls.push({ input, options })
    const attempt = providerAttempts.shift()
    return {
      getTextStream: async function* () {
        if (attempt instanceof Error) throw attempt
        if (!attempt) throw new Error("Unexpected provider call")
        for (const text of attempt) yield text
      },
      cancel: async () => { providerCancellations.push(1) },
    }
  }
}
