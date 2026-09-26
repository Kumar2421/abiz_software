/**
 * One payment gateway, behind one interface.
 *
 * Abiz has to be able to change gateway without touching plans, subscriptions,
 * or the payment window — those are business rules and have nothing to do with
 * who moves the money. Everything gateway-specific lives behind this: HTTP
 * shapes, signature schemes, and the units each provider expects.
 *
 * Amounts cross this boundary in **paise**, always. Providers disagree
 * (Razorpay wants paise, Cashfree wants rupees) and each implementation
 * converts at its own edge, so a unit mistake cannot escape into the database.
 */

export interface GatewayCustomer {
  id: string;
  name: string;
  email: string;
  /** Required by some gateways; empty string when Abiz has none on file. */
  phone: string;
}

export interface CreateOrderParams {
  /** Abiz's own id for the order. Providers that accept one are given it. */
  orderId: string;
  amountPaise: number;
  currency: string;
  customer: GatewayCustomer;
  /** Where the gateway should POST webhook events. */
  notifyUrl: string;
  /** Free-form, echoed back on the event where the provider supports it. */
  notes: Record<string, string>;
}

export interface GatewayOrder {
  /** The id to reconcile against — what gets stored in gateway_order_id. */
  orderId: string;
  amountPaise: number;
  currency: string;
  /**
   * Everything the browser needs to open this gateway's checkout. Shape is
   * provider-specific and passed through to the client untouched.
   */
  checkout: RazorpayCheckout | CashfreeCheckout;
}

export interface RazorpayCheckout {
  gateway: "razorpay";
  /** Publishable key id. The secret never leaves the server. */
  keyId: string;
  orderId: string;
}

export interface CashfreeCheckout {
  gateway: "cashfree";
  /** Single-use token the Cashfree JS SDK opens the modal with. */
  paymentSessionId: string;
  mode: "sandbox" | "production";
}

export interface GatewayStatus {
  paid: boolean;
  paymentId: string | null;
  method: string | null;
  /** Provider's own words when a payment failed. */
  error: string | null;
}

export interface WebhookEvent {
  orderId: string;
  paymentId: string | null;
  method: string | null;
  outcome: "captured" | "authorized" | "failed" | "ignored";
  error: string | null;
}

export interface PaymentGateway {
  readonly name: "razorpay" | "cashfree";

  /** False until this gateway's keys are present in the environment. */
  configured(): boolean;

  createOrder(params: CreateOrderParams): Promise<GatewayOrder>;

  /**
   * Asks the gateway what really happened, rather than believing the browser.
   * This is the only trustworthy answer: a checkout callback can be forged,
   * and a closed modal says nothing about whether money moved.
   */
  fetchStatus(orderId: string): Promise<GatewayStatus>;

  /** True when the raw body genuinely came from this gateway. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;

  /** Reads a verified webhook body into the shape billing acts on. */
  parseWebhook(rawBody: string): WebhookEvent;
}
