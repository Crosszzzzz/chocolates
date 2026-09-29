// Client-side delivery address rule. Deliberately duplicates the minimal rule
// from api/checkout.ts: the browser bundle must never import from api/* (under
// `vercel dev` those URLs are routed to serverless functions), so the client
// keeps its own copy and the server stays the authority. Delivery zone = Sucre,
// implied by the fulfillment mode; the street field only needs a plausible
// street + number (>= 6 trimmed chars).
export function isDeliveryAddressValid(addr: string): boolean {
  return addr.trim().length >= 6;
}
