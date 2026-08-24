# Abiz — Meta Setup Guide

**11 August 2026**

Step-by-step setup of the Meta accounts Abiz needs. Do the parts in order — each one blocks the next.

**Who does what:** Part 1 and 2 need company documents and a company email, so the client owns them. Part 3 onward is development.

---

## Before you start

Have these ready:

- A **personal Facebook account** for whoever will own this. Meta requires a real personal profile to create a business account; a brand-new profile is often rejected.
- **Company documents:** certificate of incorporation, GST certificate, and a business bank statement or utility bill.
- **A company email address** on the company domain — not Gmail. Meta checks this against the domain.
- **A live website** at the company domain, reachable publicly.
- **A business phone number** that can receive a call or SMS.

The details on the documents, the website, and the phone number must **match each other**. Mismatches are the most common cause of verification delays.

---

## Part 1 — Meta Business Account

1. Go to **business.facebook.com** and sign in with the personal Facebook account.
2. Click **Create account**.
3. Enter the business name (exactly as on the incorporation certificate), your name, and the company email address.
4. Fill in the business address, phone number and website. These must match the documents.
5. Confirm the email — Meta sends a verification link.

You now have a Business Portfolio. Its ID is under **Business settings → Business info**; keep it, you will need it later.

---

## Part 2 — Business Verification

This is the long one. Start it as soon as Part 1 is done.

1. In Business Manager, open **Business settings → Security Centre**.
2. Click **Start verification**.
3. Choose the country and enter the legal business details.
4. Upload the documents when prompted — incorporation certificate, GST certificate, and proof of address.
5. Verify the phone number by call or SMS.
6. Submit.

**Time:** usually a few days. Longer if anything is resubmitted.

**Why it matters:** until verification passes, Abiz may onboard only **10 customer businesses per rolling 7 days**. After it passes, 200.

**Common reasons for rejection:**

- Business name on the document differs from the name entered, even slightly (e.g. "Pvt Ltd" versus "Private Limited")
- Address on the document differs from the address entered
- Website not live, or does not mention the business name
- Document photographed at an angle, blurred, or with edges cut off

---

## Part 3 — Developer App

1. Go to **developers.facebook.com** and sign in with the same personal account.
2. If prompted, register as a developer and accept the terms.
3. Click **My Apps → Create App**.
4. Choose use case **Other**, then app type **Business**.
5. Name the app (e.g. "Abiz"), enter the contact email, and select the Business Portfolio created in Part 1.
6. Create the app.

Then add WhatsApp:

7. On the app dashboard, find **WhatsApp** and click **Set up**.
8. Meta creates a test WhatsApp number and a test WhatsApp Business Account automatically.

Record these from **App settings → Basic**:

- **App ID** — appears in the connect dialog, in place of AiSensy's
- **App secret** — treat as a password; it goes in the server configuration, never in the website code

---

## Part 4 — Test the connection before applying

The test number lets everything be verified before any real approval.

1. In **WhatsApp → API Setup**, note the test **Phone number ID** and the temporary **access token** (valid 24 hours).
2. Add your own phone as a recipient and send the sample message.
3. Enter the Phone number ID and token in Abiz under **Settings → WhatsApp** and confirm the status turns Connected.
4. Set the webhook: in **WhatsApp → Configuration**, click **Edit**, then enter

   - **Callback URL:** `https://abizapp.netlify.app/api/whatsapp/webhook`
   - **Verify token:** the value shown in Abiz's WhatsApp settings

5. Click **Verify and save**, then **Manage** and subscribe to the **messages** field.
6. Message the test number from your phone — it should appear in the Abiz inbox.

If this works, the whole system is proven end to end. Only the approvals remain.

---

## Part 5 — Privacy policy and terms

Required before App Review, so publish them first.

Two public pages are needed:

- **Privacy policy** — what data Abiz collects, why, where it is stored, how long it is kept, and how a business can request deletion. Must mention WhatsApp message data specifically.
- **Terms of service** — the rules for using Abiz.

Both must be publicly reachable without logging in, and their URLs go in **App settings → Basic**.

---

## Part 6 — App Review, advanced access

Only after Parts 2, 3 and 5 are finished.

1. Open **App Review → Permissions and Features**.
2. Request **Advanced Access** for:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
3. For each, provide:
   - A written explanation of why Abiz needs it
   - A **screen recording** showing a business connecting its WhatsApp account and sending or receiving a message in Abiz
   - Test credentials so a reviewer can sign in
4. Submit.

**Time:** days to several weeks. Rejection is common on a first attempt; budget for one resubmission.

**Recording tips:** show the whole journey without cuts — logging in to Abiz, starting the connect flow, completing Meta's screens, then a message arriving in the inbox. Narrate or caption each step. Reviewers reject recordings that skip steps or start mid-flow.

---

## Part 7 — After approval

Meta grants advanced access. Development then builds the one-click connect button, roughly two days of work.

The customer's experience becomes: click **Connect WhatsApp** in Abiz, complete Meta's screens, done — no copying tokens by hand.

---

## Order of work

| # | Step | Owner | Time | Blocks |
|---|---|---|---|---|
| 1 | Meta Business Account | Client | 1 hour | everything |
| 2 | Business Verification | Client | days | App Review, 10-per-week cap |
| 3 | Developer App + WhatsApp | Development | 1 hour | testing |
| 4 | Test with the test number | Development | 1 hour | — |
| 5 | Privacy policy and terms | Client + Development | 1 day | App Review |
| 6 | App Review submission | Development | weeks to approve | one-click connect |
| 7 | Build one-click connect | Development | 2 days | — |

Steps 3, 4 and 5 can run while step 2 is being reviewed. **Step 1 and 2 should start today** — they gate everything and are entirely outside development's control.

---

## Keep a record of

- Business Portfolio ID
- App ID and App secret
- WhatsApp Business Account ID
- Phone number ID
- The Facebook account that owns all of it

Store the app secret and any access token with the other server secrets. Never put them in the website code or share them over chat or email.

**Ownership warning:** all of this belongs to the personal Facebook account that created it. If that person leaves, access leaves with them. Add a second company person as an admin in **Business settings → People** as soon as the account exists.
