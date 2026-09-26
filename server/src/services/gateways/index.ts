import { env } from "../../env.js";
import { razorpayGateway } from "./razorpay.js";
import type { PaymentGateway } from "./types.js";

export * from "./types.js";
export { razorpayCheckoutSignatureValid } from "./razorpay.js";

const GATEWAYS: Record<string, PaymentGateway> = {
  razorpay: razorpayGateway,
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
