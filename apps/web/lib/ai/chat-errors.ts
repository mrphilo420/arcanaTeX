export function providerErrorDetail(error: unknown): string {
  const candidate = error as {
    responseBody?: unknown;
    message?: unknown;
  };
  let detail = "";
  if (typeof candidate.responseBody === "string") {
    try {
      const parsed = JSON.parse(candidate.responseBody) as {
        error?: { message?: string };
        message?: string;
      };
      detail = parsed.error?.message ?? parsed.message ?? "";
    } catch {
      detail = candidate.responseBody;
    }
  } else if (
    candidate.responseBody &&
    typeof candidate.responseBody === "object"
  ) {
    const body = candidate.responseBody as {
      error?: { message?: string };
      message?: string;
    };
    detail = body.error?.message ?? body.message ?? "";
  }
  if (!detail && typeof candidate.message === "string") {
    detail = candidate.message;
  }
  return detail.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function chatErrorMessage(error: unknown): string {
  const statusCode =
    error && typeof error === "object" && "statusCode" in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
  const detail = providerErrorDetail(error);

  // Billing states read as generic provider failures unless they are named.
  if (
    /no credits remaining|insufficient_quota|exceeded your current quota|billing hard limit/i.test(
      detail,
    )
  ) {
    return `The provider account cannot pay for this request${detail ? `: ${detail}` : "."} Add credits in the provider's billing settings, or switch to another model or provider.`;
  }
  if (/tokens per day|\bTPD\b|daily (?:token|request) limit/i.test(detail)) {
    const reset = /(?:try again in|reset in)\s*([\d.]+\s*(?:ms|s|m|h))/i.exec(
      detail,
    );
    return `The provider's daily token limit (TPD) is exhausted.${
      reset ? ` Try again in ${reset[1]}.` : ""
    } Switch to another model or provider.`;
  }
  if (/output tokens per minute|\bOTPM\b/i.test(detail)) {
    return "The selected model allows fewer output tokens per minute than this request needs. Retry after the app lowers the output budget, or switch to a model with a larger output limit.";
  }
  if (/invalid api key|incorrect api key|api key not valid/i.test(detail)) {
    return "The selected provider rejected the API key. Update it in the provider settings.";
  }
  if (/model.*(not found|does not exist|not supported)/i.test(detail)) {
    return `The provider does not offer this model${detail ? `: ${detail}` : "."} Pick a different model.`;
  }

  if (statusCode === 402) {
    return `The selected provider has insufficient account funds. Add credits or choose another model in the picker.${detail ? ` (${detail})` : ""}`;
  }
  if (statusCode === 401) {
    return "The selected provider rejected the API key. Update the key in the Models tab.";
  }
  if (statusCode === 403) {
    return "The selected provider denied access. Free OpenCode models only work inside OpenCode; choose a paid/Go model or another provider.";
  }
  if (statusCode === 429) {
    return "The selected provider is rate-limiting requests. Wait and retry or choose another model.";
  }
  if (statusCode && statusCode >= 400) {
    return `Provider error (${statusCode})${detail ? `: ${detail}` : ""}`;
  }
  return "Chat failed while contacting the model. Check the server logs and the selected provider configuration.";
}
