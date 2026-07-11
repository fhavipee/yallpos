export function discountPercentFromAmount(amount: number, baseTotal: number): number {
  if (baseTotal <= 0) return 0;
  return (amount / baseTotal) * 100;
}

export function needsDiscountPin(discountPercent: number, maxWithoutPin: number): boolean {
  if (discountPercent <= 0) return false;
  return discountPercent > maxWithoutPin + 0.0001;
}

export function isApprovalRequiredError(err: unknown): boolean {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return false;
  const nested = data.message;
  const code =
    (typeof data.code === "string" && data.code) ||
    (nested && typeof nested === "object" && typeof (nested as { code?: string }).code === "string"
      ? (nested as { code: string }).code
      : undefined);
  return (
    code === "APPROVAL_REQUIRED" ||
    code === "DISCOUNT_PIN_REQUIRED" ||
    code === "APPROVAL_INVALID"
  );
}

/** @deprecated alias */
export function isDiscountPinRequiredError(err: unknown): boolean {
  return isApprovalRequiredError(err);
}

export function approvalErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.message === "string") return data.message;
  if (data.message && typeof data.message === "object") {
    const nested = (data.message as { message?: unknown }).message;
    if (typeof nested === "string") return nested;
  }
  if (Array.isArray(data.message)) return data.message.join(", ");
  return fallback;
}

/** @deprecated alias */
export function discountPinErrorMessage(err: unknown, fallback: string): string {
  return approvalErrorMessage(err, fallback);
}

export type ApprovalCodes = { approvalPin?: string; approvalTotp?: string };
