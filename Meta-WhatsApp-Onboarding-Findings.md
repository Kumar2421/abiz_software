# Abiz — Connecting Customers to WhatsApp

**11 August 2026**

## What we found

The onboarding screens shared with us are **Meta's own screens**, not AiSensy's software. The web address in those screenshots contains `app_id=799369954601524` — that is AiSensy's ID. Meta shows the screens; AiSensy's name appears because Meta has approved them.

For Abiz to show the same flow, Abiz needs its own approval from Meta.

**The coding is about 2 days. The Meta approvals take weeks.** Approvals should start now, in parallel.


---

## What Meta requires

Three steps, in order.

**1. Business Verification** — Meta confirms Abiz is a real company.
Needs: incorporation certificate, GST, business bank statement or utility bill, matching phone number and website.
Time: a few days, longer if documents are rejected.
Until this is done, Abiz can sign up only **10 businesses per week**. After, 200.

**2. Developer App** — a technical registration at developers.facebook.com.
Time: a few hours. This produces the ID that replaces AiSensy's in the dialog.

**3. App Review** — Meta approves the permissions Abiz needs to act for customers.
Needs: a screen recording of the flow, a privacy policy page, and a written explanation.
Time: days to weeks. **Can be rejected** and resubmitted.

Only after all three can the one-click connect button be built.

---

## Pricing decision

Meta charges for WhatsApp conversations. Someone has to pay that bill.

**Option A — customer pays Meta** (recommended)
The customer adds their own card to Meta. Abiz charges only its own fee.
- No cost or risk to Abiz
- Already built
- Downside: the customer must complete Meta's setup themselves; smaller shops find this hard

**Option B — Abiz pays Meta, then bills the customer**
This is AiSensy's model. They charge ₹1.09 per marketing message and ₹0.145 per utility message.
- Abiz pays first and recovers later — a customer who stops paying leaves Abiz owing Meta
- Needs new software: message counting, prepaid balance, top-ups, auto-blocking at zero, invoices
- Harder approval from Meta

### The deciding point

Abiz sells **₹14,999 once, for lifetime access**.

That price cannot work with Option B. Abiz would keep paying for that customer's messages forever from a single payment. An active shop sending a few thousand messages a month uses up ₹14,999 within weeks, then keeps costing money every month.

So there are two consistent choices:

1. **Keep ₹14,999 one-time, customer pays Meta.** No ongoing cost to Abiz. Matches what is built.
2. **Switch to monthly or prepaid credits, and Abiz pays Meta.** Earns margin per message, but needs the billing system above and puts Abiz's money at risk.

**Recommendation: option 1 for launch.** Revisit later if customers struggle with Meta's billing step — but the price must change at the same time.

---

## What already works, with no Meta approval

- Receiving messages, including photos, documents, voice notes
- Replying from the inbox, with delivered and read ticks
- Automatic welcome message
- Contacts and chat history
- **Ad tracking** — when a customer arrives from a Facebook or Instagram ad, Abiz records which ad brought them

Ad tracking needs no special approval. It arrives with the normal message. The data is already saved; showing it in the dashboard is small work that can start now.

---

## What to do next

| Action | Who | Waits for |
|---|---|---|
| Start Meta Business Verification | Client | Company documents |
| Create the Developer app | Development | — |
| Decide the pricing model | Client | — |
| Publish privacy policy and terms pages | Client + Development | — |
| Submit App Review | Development | Above three |
| Show ad tracking in the dashboard | Development | — |
| Build one-click connect | Development | App Review approved |

Verification should start today — everything else waits on it.

---

## Risks

- **App Review rejected** — usually unclear demo video or missing privacy policy. Expect at least one resubmission.
- **Verification delayed** — usually company details that do not match across documents.
- **Customer cannot add a card to Meta** — they will not be able to send messages, and will need help.
- **10-business weekly cap** before verification completes.

