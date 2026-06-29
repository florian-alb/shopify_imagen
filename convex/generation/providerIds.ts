export type ProviderIds = {
  providerBatchId?: string | null;
  providerRequestId?: string | null;
  providerResponseId?: string | null;
};

export function providerIdsFromResponse(
  response: Response,
  payload?: unknown,
): ProviderIds {
  // OpenAI reliably exposes x-request-id. Google APIs vary by surface, so keep
  // first request/trace header available for support correlation.
  const providerRequestId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-goog-request-id") ??
    response.headers.get("x-google-request-id") ??
    response.headers.get("x-cloud-trace-context") ??
    null;
  const body = payload as
    | { id?: string; responseId?: string; response_id?: string }
    | null
    | undefined;
  return {
    providerRequestId,
    providerResponseId:
      body?.id ?? body?.responseId ?? body?.response_id ?? null,
  };
}
