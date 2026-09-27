import type { CartLine, FulfillmentKind } from '../types/chocolate';

export interface CheckoutBody {
  lines: CartLine[];
  fulfillment: FulfillmentKind;
  address: string;
  clientTotalBOB: number;
  userId?: string;
}

// Builds the POST /api/checkout body. Logged-in buyers attach userId so the
// server can persist orders.user_id (verified-purchase chain for reviews);
// guests omit the key entirely and stay anonymous.
export function buildCheckoutBody(
  lines: CartLine[],
  fulfillment: FulfillmentKind,
  address: string,
  clientTotalBOB: number,
  userId: string | null | undefined,
): CheckoutBody {
  const id = typeof userId === 'string' ? userId.trim() : '';
  return {
    lines,
    fulfillment,
    address,
    clientTotalBOB,
    ...(id !== '' ? { userId: id } : {}),
  };
}
