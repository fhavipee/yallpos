export function discountPercentFromAmount(amount: number, baseTotal: number): number {
  if (baseTotal <= 0) return 0;
  return (amount / baseTotal) * 100;
}

export function needsDiscountPin(discountPercent: number, maxWithoutPin: number): boolean {
  if (discountPercent <= 0) return false;
  return discountPercent > maxWithoutPin + 0.0001;
}

export function isApprovalRequiredError(err: unknown): boolean {
  const data = (err as { response?: { data?: { code?: string } } })?.response?.data;
  return data?.code === "APPROVAL_REQUIRED" || data?.code === "DISCOUNT_PIN_REQUIRED";
}

/** @deprecated alias */
export function isDiscountPinRequiredError(err: unknown): boolean {
  return isApprovalRequiredError(err);
}

export function approvalErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
  return typeof data?.message === "string" ? data.message : fallback;
}

/** @deprecated alias */
export function discountPinErrorMessage(err: unknown, fallback: string): string {
  return approvalErrorMessage(err, fallback);
}

export type ApprovalCodes = { approvalPin?: string; approvalTotp?: string };
