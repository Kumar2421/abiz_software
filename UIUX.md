# Abiz — UI/UX Design Spec v1.0

Derived from reference screenshots (Flow Index / Closr CRM inbox pattern), scoped down to SRS v1.0 MVP.

---

## 1. Layout DNA

Both references use same skeleton. Adopt it:

```
┌────┬──────────────┬──────────────────────┬─────────────┐
│ 64 │   ~260px     │       flex-1         │   ~300px    │
│rail│  nav/folders │   conversation list  │  chat pane  │  (+ contact panel)
└────┴──────────────┴──────────────────────┴─────────────┘
```

MVP uses **4 columns**, contact panel is a toggle (not always-on):

| Col | Width | Content |
|-----|-------|---------|
| A. Icon rail | 64px | logo, Inbox, Contacts, Settings, avatar (bottom) |
| B. Folders | 240px | connection status card, All / Unread / Unassigned-less list, search |
| C. Conversation list | 340px min | avatar + name + snippet + relative time + channel badge |
| D. Chat pane | flex-1 | header, message scroll, composer |
| E. Contact drawer | 300px, toggle | name, phone, notes, first-seen |

Breakpoints:
- `≥1440px` — all 5 visible (E open)
- `1024–1439` — A+B+C+D, E as overlay drawer
- `768–1023` — A+C+D, B collapses to icon-only
- `<768` — single column, stack navigation (list → chat push transition)

---

## 2. Design tokens

Reference palette = near-white shell, one purple/blue accent, dark ink text. Copy that restraint.

```css
--bg-shell:      #F7F7F8;   /* app background */
--bg-surface:    #FFFFFF;   /* panels */
--bg-hover:      #F2F2F4;
--bg-selected:   #EDEBFE;   /* selected conversation row */
--border:        #E6E6EA;

--text-primary:  #16161A;
--text-secondary:#6B6B76;
--text-tertiary: #9A9AA5;

--accent:        #5B5BD6;   /* primary action, active nav */
--accent-soft:   #EDEBFE;
--bubble-in:     #F2F2F4;   /* customer message */
--bubble-out:    #EDEBFE;   /* business message */

--ok:            #12A150;   /* WhatsApp connected */
--warn:          #F5A524;
--danger:        #E5484D;

--radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 16px;
--shadow-panel: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
```

Type scale (Inter):
- Conversation name — 14px/600
- Snippet, meta — 13px/400, `--text-secondary`
- Timestamp — 12px/400, `--text-tertiary`
- Message body — 14.5px/400, line-height 1.5
- Section label (sidebar) — 11px/600, uppercase, letter-spacing .04em, `--text-tertiary`

Spacing: 4px base. Row padding 12px 16px. Panel gutters 16px.

---

## 3. Screen-by-screen

### 3.1 Auth (register / login / forgot / change password)
Centered card 400px on `--bg-shell`. Logo, title, fields, primary button full-width, secondary link below. No split-hero — keep it plain.

### 3.2 Onboarding — WhatsApp connect
This is the "customer arrives from Meta" moment. 3-step stepper, one card:

1. **Connect** — either
   - *Meta Embedded Signup* (redirect flow, recommended — returns token + Phone Number ID), or
   - *Manual* — paste Access Token, Phone Number ID, Webhook Verify Token
2. **Verify webhook** — show callback URL + verify token with copy buttons, live status pill polls `GET /api/whatsapp/status`
3. **Welcome message** — prefilled template, editable, live WhatsApp-style bubble preview on right

Template picker sits in step 3: chips `Shop details` / `Business hours` / `Support` / `Custom`. Selecting fills the textarea with a template containing `{{company_name}}`, `{{phone}}`, `{{address}}` placeholders resolved from Settings.

> QR path: Meta Cloud API has **no QR pairing** (that is WhatsApp Web / unofficial libs). Offer instead: "Chat with us" **wa.me deep link + generated QR image** for the shop to print/share. Rendered client-side, no backend. That satisfies "connect QR or redirect" without violating Cloud API rules.

### 3.3 Dashboard
Bento grid, 4 stat tiles top row + connection card:
- Connected number + status pill (green `Connected` / amber `Pending verify` / red `Disconnected`)
- Total Contacts · Conversations · Sent · Received
Tile: white surface, 16px radius, label 12px tertiary above 28px/600 number. No charts (Analytics is out of scope).

### 3.4 Inbox (main screen)

**Col B — folders**
```
[status card: ●Connected  +91 98xxx]
Search  (⌘K)
INBOX
  All            124
  Unread          12
  Archived         8
CONTACTS
  All contacts
```
Active row: `--accent-soft` bg, `--accent` text, 8px radius.

**Col C — conversation list**
Row anatomy (matches both refs): 40px avatar (initials fallback) · name 14/600 · relative time right-aligned 12px tertiary · snippet single line truncated with reply-arrow glyph if last msg outbound · unread → green pill count + name goes 600 weight.
Selected row: `--bg-selected` + 3px left accent bar.
Reference shows a channel badge under snippet — MVP is WhatsApp-only, so **drop it**. Keep a label/tag chip slot for later.

**Col D — chat pane**
- Header: avatar, name, phone number below, right side = contact-panel toggle + kebab (Archive, Block, Delete). **No call icons** — voice/video out of scope.
- Body: centered sticky date divider ("Today", "Apr 20, 2026"). Bubbles max-width 65%, radius 16px with 4px tail corner. Inbound left `--bubble-in`; outbound right `--bubble-out`. Timestamp inside bubble bottom-right 11px. Tick row under outbound: `✓` sent, `✓✓` delivered, `✓✓` accent-colored read — map from Meta status webhook.
- Failed message: red left border + `Retry` inline link.
- 24-hour window: when session expired, composer disables and shows banner *"24h window closed — customer must message first."* Non-negotiable Cloud API rule, must be in UI.
- Composer: textarea auto-grow (max 5 rows), emoji picker, attach (phase 2), `Send` button accent, Enter=send / Shift+Enter=newline. `/` opens template quick-insert.
- Empty state: illustration + "Select a conversation".

**Col E — contact drawer**
Name (inline editable), phone, notes textarea (autosave debounce 800ms), first interaction date, conversation count. Save/Delete at bottom. That's it — reference's CRM fields (languages, local time, subscriptions) are out of scope.

### 3.5 Settings
Left sub-nav, right form panel:
`Profile` · `Company` · `WhatsApp Connection` · `Welcome Message` · `Security`
Token fields masked with reveal toggle; show last-4 only after save. Never echo full token back from API.

### 3.6 Admin panel
Separate route `/admin`, table-first. Users table (search, suspend, delete), WhatsApp numbers table, Webhook errors log (expandable JSON row), System logs. Reuse same shell, swap col B nav.

---

## 4. Interaction rules

- Realtime: Socket.IO rooms per `conversation_id` + per `company_id`. Events `message:new`, `message:status`, `conversation:updated`.
- New inbound message → conversation jumps to list top with a 200ms highlight fade; if chat open and scrolled to bottom, autoscroll; else show floating "1 new message ↓" pill.
- Optimistic send: bubble appears instantly at `pending` opacity .6, resolves on ack.
- Search debounce 300ms, matches name + phone + message body.
- Skeleton loaders for list and chat, never spinners on panels.
- Keyboard: `⌘K` search, `↑/↓` move conversation, `Esc` close drawer.
- Every state designed: loading, empty, error, offline (socket dropped → amber top bar "Reconnecting…").

---

## 5. Component inventory (build order)

`AppShell` → `IconRail` `FolderNav` `StatusPill` `SearchInput`
`ConversationList` → `ConversationRow` `UnreadBadge` `Avatar`
`ChatPane` → `ChatHeader` `DateDivider` `MessageBubble` `TickStatus` `Composer` `TemplatePicker` `WindowClosedBanner`
`ContactDrawer` → `InlineEditField` `NotesField`
`StatTile` `ConnectionCard` `Stepper` `QrCard` `MaskedField` `DataTable` `Toast` `ConfirmDialog` `EmptyState` `Skeleton`

Stack: Next.js App Router + Tailwind + shadcn/ui (Radix). shadcn covers Dialog, Popover, Tabs, Toast, Dropdown — do not hand-roll.

---

## 6. Scope deltas vs reference images

Dropped (SRS "Not Included"): team inboxes, assign/unassign, multi-agent avatars, labels/segments, call & video icons, schedule/draft/spam/trash folders, automations & guides nav, rich CRM contact fields, channel badges (Email/Slack/Teams).

Kept as empty extension slots so later add-on is cheap: tag chip on conversation row, contact drawer custom fields.
