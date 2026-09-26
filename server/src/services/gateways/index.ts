import { env } from "../../env.js";
import {
  cashfreeGateway,
  webhookSecret as cashfreeWebhookSecret,
} from "./cashfree.js";
import { razorpayGateway } from "./razorpay.js";
import type { PaymentGateway } from "./types.js";

export * from "./types.js";
export { razorpayCheckoutSignatureValid } from "./razorpay.js";
export { parseCashfreeJson as parseGatewayJson } from "./cashfree.js";

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

/**
 * Why no gateway claimed a webhook, in terms safe to write to a log.
 *
 * A rejected webhook is otherwise a bare 400 with nothing to act on, and the
 * gateway keeps retrying against it. The three real causes look identical from
 * outside — no keys, a secret that does not match, or a missing signature
 * header — so each is named. Secrets and signatures are never included: only
 * whether they are present.
 */
export function describeWebhookRejection(
  headers: Record<string, string>,
  rawBody: string,
): string {
  const configured = Object.values(GATEWAYS)
    .filter((gateway) => gateway.configured())
    .map((gateway) => gateway.name);

  if (configured.length === 0) {
    return "no gateway has API keys configured";
  }

  const signatureHeaders = Object.keys(headers)
    .filter((name) => name.includes("signature") || name.includes("timestamp"))
    .sort();

  return [
    `configured gateways: ${configured.join(", ")}`,
    // The effective key, not the override — Cashfree normally signs with the
    // API secret, so reporting the override alone would read as "false" on a
    // perfectly good configuration.
    `cashfree signing key available: ${Boolean(cashfreeWebhookSecret())}`,
    `razorpay webhook secret set: ${Boolean(env.RAZORPAY_WEBHOOK_SECRET)}`,
    `signature headers seen: ${signatureHeaders.join(", ") || "none"}`,
    `body bytes: ${Buffer.byteLength(rawBody, "utf8")}`,
  ].join(" | ");
}
