import { env } from "../../env.js";
import { cashfreeGateway } from "./cashfree.js";
import { razorpayGateway } from "./razorpay.js";
import type { PaymentGateway } from "./types.js";

export * from "./types.js";
export { razorpayCheckoutSignatureValid } from "./razorpay.js";

const GATEWAYS: Record<string, PaymentGateway> = {
  razorpay: razorpayGateway,
  cashfree: cashfreeGateway,
};

/**
 * The gateway currently taking money, chosen by PAYMENT_GATEWAY.
 *
 * Deliberately a runtime switch rather than a build-time one: moving between
 * providers is then an environment variable and a redeploy, and rolling back a
 * bad switch costs the same. Both implementations stay shipped.
 */
export function getGateway(): PaymentGateway {
  return GATEWAYS[env.PAYMENT_GATEWAY] ?? razorpayGateway;
}

/**
 * Finds the gateway that actually signed an incoming webhook.
 *
 * Not the same question as "which gateway are we selling through": after a
 * switch, orders placed with the old provider keep sending events for days,
 * and checking only the active gateway would reject every one of them — money
 * taken, account never activated. Signature verification is the identification:
 * only the gateway holding the matching secret can produce a valid signature,
 * so trying each configured one in turn is safe.
 */
export function gatewayForWebhook(
  rawBody: string,
  headers: Record<string, string>,
): PaymentGateway | null {
  for (const gateway of Object.values(GATEWAYS)) {
    if (!gateway.configured()) continue;
    if (gateway.verifyWebhook(rawBody, headers)) return gateway;
  }
  return null;
}
