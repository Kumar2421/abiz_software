# Abiz — The "Customer Pays Meta" Model

**11 August 2026**

Abiz sells the software. The customer's own WhatsApp account is billed by Meta directly. Abiz never handles message costs.

---

## What Meta charges for

Meta changed to **per-message pricing on 1 July 2025**. Charges apply only when a *template* message is delivered.

| | Charged? |
|---|---|
| Marketing templates | Always |
| Utility / authentication templates | Only outside the 24-hour service window |
| Normal messages inside an open service window | Free |
| Service conversations — customer messages first, business replies | Free |

### The ad flow is free

When someone taps a Click-to-WhatsApp ad and messages the business, a 24-hour window opens. If the business replies inside it, that reply is free **and opens a 72-hour Free Entry Point window** where any message to that customer costs nothing.

This means the core Abiz flow — ad, customer message, dashboard shows it, business replies, automation follows up — **costs the customer nothing from Meta for three days**.

Meta charges appear only when the business sends **marketing templates**: broadcasts, promotions, or re-engaging a customer after the window closes. A business that mainly answers ad leads may have a bill close to zero.

---

## What the customer does, once

All of this happens inside Meta's own screens:

1. Log in with Facebook
2. Create or select a **business portfolio**
3. Create or select a **WhatsApp Business Account**
4. Set business name, **display name**, and category
5. Add the phone number
6. Add a **payment method** in Meta Business Suite → Billing

### Two things to warn customers about

**Name review takes up to one working day.** During review the business can send only **5 business-initiated test messages per 24 hours**. Replies to customers still work, so an ad-driven inbox is usable immediately — but anyone planning to broadcast on day one will be blocked.

**The number cannot be used in the WhatsApp app afterwards.** If the chosen number already has WhatsApp or WhatsApp Business installed, that app stops working once the number moves to the API. Customers must be told this **before** they pick their main business number.

---

## What Abiz does

Abiz stores the customer's access token and phone number, sends and receives on their behalf, and provides the inbox, automation and ad tracking.

Abiz never sees the customer's card, never pays Meta on their behalf, and carries no liability for their usage.

---

## Why this model suits Abiz

- **No financial risk.** Abiz never fronts money for anyone's messages.
- **Nothing extra to build.** No message metering, prepaid balance, top-ups, or monthly reconciliation with Meta.
- **Already how the product works.** Each company's credentials are stored separately and encrypted.
- **Bills stay small anyway.** With the free windows above, ad-driven customers may never be charged much.

---

## What it costs in customer support

Every failure below looks like "Abiz is broken" to the customer, though none of them are:

| What happens | What the customer sees |
|---|---|
| Their card declines at Meta | Messages stop sending |
| They revoke app access in Meta settings | Connection dies immediately |
| Their quality rating drops | Meta reduces their messaging limit |
| New number, low tier | Capped at 250 business-initiated conversations per 24 hours |

**Mitigation:** show connection health in the dashboard. Abiz already retrieves the quality rating and verified name when checking a connection, and records the last error — it simply is not displayed yet. Showing quality rating, messaging tier, and a warning when the connection degrades turns "your product is broken" into "your Meta account needs attention". Recommended before launch.

---

## Ownership: an argument both ways

The customer owns their WhatsApp number and their Meta account. If they leave Abiz, they keep both and connect elsewhere.

- **Good for sales.** No lock-in, and no dependency on Abiz continuing to exist.
- **Risk for retention.** Switching costs nothing, so customers stay only if the product is good. Competitors sell the same capability.

---

## Open question to confirm with Meta

Does Meta require a payment method on the account **before any sending at all**, or only before charged messages?

- **If before any sending:** every customer must add a card, regardless of the free windows. Onboarding support must plan for it.
- **If only before charged messages:** a customer who only replies to ad leads may never need a card — which makes this model considerably easier to sell.

Worth answering early. It is the difference between a mandatory billing step and an optional one.

---

## Recommendation

Adopt customer-pays-Meta for launch. It carries no financial risk, needs no additional billing software, and matches what is already built.

Abiz charges for the software only. Revisit reselling messages later, and only if two things are true: customers are genuinely blocked by Meta's billing step, and enough of them send marketing broadcasts for a margin to be worth the risk.
