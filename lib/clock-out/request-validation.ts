export const validateEmptyRequestBody = async (request: Request) => {
  const contentLength = request.headers.get("content-length")
  if (request.body === null || contentLength === "0") {
    return { ok: true as const }
  }

  return {
    ok: false as const,
    message: "The request body must contain valid JSON or be empty.",
  }
}
