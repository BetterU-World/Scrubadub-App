const IMPLEMENTATION_IDENTIFIER =
  /^(?:[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+|[A-Z][A-Z0-9_]*(?:_[A-Z0-9_]+)+)$/;

export function normalizeFeedbackMessage(message: string, fallback: string) {
  const normalized = message.trim();
  return IMPLEMENTATION_IDENTIFIER.test(normalized) ? fallback : normalized;
}
