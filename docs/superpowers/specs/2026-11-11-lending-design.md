# Lending (Girvi) — Design

Date: 2026-11-11 · Status: draft for owner review

## Intent

Customers bring their own gold or silver jewellery to the shop, leave it as security, and take
cash. Later they pay back the loan plus interest and take their item home. Sometimes the shop
pledges that same item onward to another merchant to raise cash of its own.

Today this is tracked outside the app. The owner wants a **Lending** section where owner and staff
can record these loans with a simple form, see what every customer owes on any day, take
payments, print slips, and know at a glance which items are in the shop, which are with a
merchant, and which loans have gone overdue.

## Goals

1. Record a loan in one form: customer, the pledged item(s), the loan amount, the date.
2. Suggest the loan amount from the items' value at today's live rate (the existing
   metals.dev rates) × a configurable loan-to-value %.
3. Always show the exact amount owed today, using the shop's interest rules (below).
4. Accept any payment — interest only, part, or full — and apply it by the shop's rules.
5. Print a slip when the loan is given and a receipt for each payment.
6. Record when an item is pledged onward to a merchant, and when it comes back.
7. Flag loans older than a configurable limit (default 12 months) as overdue.
8. One page to track everything: active, overdue, with merchant, closed.

## Non-goals (v1)

- Accounting for the merchant side beyond name/date/amount/returned (owner: "leave the merchant
  side for now"). No interest owed to merchants, no profit per loan.
- WhatsApp/SMS reminders to borrowers.
- Cash register / daybook / GST entries for loans (lending is not a sale). Accountant reports
  can come later.
- Automatic forfeiture, auction or sale of overdue items.
- Loans against anything other than gold or silver items (no platinum, no stones valued).
- Customer self-service (catalogue login) view of their loans.

## Anti-goals (failure even if it "works")

- **Wrong money.** Any mismatch between what the app says is owed and what the shop's rules
  give. The interest maths must be exact, explained on screen, and covered by tests.
- **Losing track of an item.** The app must never let a loan be closed and the item "returned"
  while the item is recorded as with a merchant.
- **Silent history changes.** Loan amounts, rates and payments must not be editable after the fact
  without a trace. Corrections are new entries (or audited edits), never overwrites.
- **Slowing down the counter.** Giving a loan to a returning customer should take about a minute.

## The shop's rules (decided by the owner)

| Rule | Value | Configurable |
|---|---|---|
| Loan amount offered | 60–70% of item value | Yes (Settings) |
| Interest | 2% per month, **simple** (never on unpaid interest) | Yes (Settings) |
| Part month | counts as a **full month** | No |
| Overdue warning | after **12 months** | Yes (Settings) |
| Who can give/close loans | **Owner and staff** | — |

### Interest — exact algorithm

A loan has an outstanding **principal** and an **interest start date** (initially the loan date).

```
months(start, today) = whole calendar months from start to today,
                       +1 if any days remain beyond those whole months,
                       minimum 1 (a loan repaid the same day still owes one month)

interest_due(today)  = principal × monthly_rate × months(start, today)
total_due(today)     = principal + interest_due(today)
```

Example (owner-confirmed): ₹50,000 at 2%, repaid after 2 months 10 days →
3 months × ₹1,000 = ₹3,000 interest → ₹53,000.

Calendar-month counting: from 15 Jan, one whole month ends 15 Feb; 31 Jan → 28/29 Feb counts as
a whole month (month-end clamping). Dates are India time (Asia/Kolkata).

### Payments (owner-confirmed)

When a payment of amount P arrives on day D:

1. Compute `interest_due(D)` on the current principal from the interest start date.
2. P pays that interest first; whatever is left reduces the principal.
3. The **interest start date resets to D**, and interest runs on the new principal from D.
4. If principal reaches 0, the loan is **closed (redeemed)**.

Example (owner-confirmed): ₹50,000; after 1 month 5 days the customer pays ₹14,000 →
2 months' interest ₹2,000 paid, principal becomes ₹38,000, and 2%/month runs on ₹38,000 from
that day.

A payment may not exceed `total_due(D)`.

### Payments smaller than the interest due — *open question for the owner*

If a customer pays less than the interest owed (e.g. ₹1,500 when ₹2,000 is due), the rules above
don't say what happens. Options are listed under **Open questions**.

## What the user sees

### Navigation

- Owner console: new **Lending** item in the sidebar.
- POS (staff): new **Lending** item next to "New Bill" and "Invoices".
Both open the same pages; permissions are identical for owner and staff except where noted.

### Lending list (tracking page)

- Summary strip: active loans count, total principal out, interest accrued to date,
  overdue count, items with merchants.
- Filters/tabs: **Active**, **Overdue**, **With merchant**, **Closed**; search by loan number,
  customer name or phone.
- Each row: loan number, customer, items (short), loan date, principal outstanding,
  **due today**, months running, badges (Overdue, With merchant).
- "New loan" button.

### New loan form

1. **Customer** — search existing customers by phone/name, or add new (name, phone, address).
   Reuses the existing Customer records.
2. **Items** — one or more rows: description (e.g. "Gold chain"), metal (gold/silver), purity
   (24K/22K/18K/14K, silver 999/925), gross weight (g), net weight (g), optional notes, optional
   photo.
3. **Valuation** — per item: net weight × today's rate for that purity (shown, per 10 g and total).
   Suggested loan = total value × default LTV %. Shows the % the entered amount represents.
4. **Loan** — amount (prefilled with suggestion, editable), interest rate (prefilled from Settings,
   editable per loan), loan date (default today), payment mode for the cash given (cash/UPI/bank),
   notes.
5. Save → loan created with number, slip printed/downloaded.

Each loan stores its own interest rate, LTV used, and the rate snapshot used for valuation, so
later Settings changes never alter existing loans.

### Loan detail page

- Header: loan number, status, customer (with phone/address), loan date, months running,
  overdue badge.
- Items list with weights, purities, valuation at loan time.
- **Due today** card: principal, interest due (with "N months × ₹X" explanation), total.
- **Take payment**: amount, mode, date (default today, owner may back-date), preview showing
  how it splits into interest and principal and the new principal before confirming. Prints a
  receipt.
- **Payment history**: date, amount, interest part, principal part, principal after, mode, by whom.
- **Merchant** section: "Pledged to merchant" form (merchant name, phone optional, date, amount
  received, notes) → item shows *With merchant*. "Got it back" action records the return date.
  While with a merchant, full repayment is blocked with a clear message ("Item is with
  [merchant] — get it back before closing this loan").
- **Close as forfeited**: record the decision (kept by shop / sold, with notes) — closes the loan
  without a payment.
- Reprint slip.

### Printed documents (PDF, same tooling as invoices)

- **Loan slip**: shop name/address/phone, loan number, date, customer name/phone/address,
  item table (description, metal/purity, gross & net weight), loan amount, interest rate per
  month, the part-month rule in one line, signature lines for customer and shop.
- **Payment receipt**: loan number, date, amount paid, interest part, principal part,
  principal remaining (or "Loan closed — item returned").

### Settings → Lending

- Default loan-to-value % (default 65), maximum LTV % (default 70).
- Default interest % per month (default 2).
- Overdue after N months (default 12).

### Dashboard

- Small card: active loans, total outstanding, overdue count (links to the Overdue tab).

## Data (sketch — builder may refine)

- **Loan**: number (e.g. `GL-202611-0001`), customer, status (ACTIVE / REDEEMED / FORFEITED),
  loan date, original principal, current principal, interest start date, monthly rate %,
  LTV % used, valuation total, rate snapshot reference, payment mode out, notes,
  created by, closed at, forfeit outcome/notes.
- **LoanItem**: loan, description, metal, purity, gross weight, net weight, rate per gram at
  loan time, value, notes, photo URL.
- **LoanPayment**: loan, date, amount, interest part, principal part, principal after,
  months charged, mode, reference, created by.
- **LoanMerchantPledge**: loan, merchant name, merchant phone, pledged date, amount received,
  notes, returned date.
- Every create/payment/pledge/return/forfeit writes an **AuditEvent** (existing table).

Money in rupees with 2 decimals (`Decimal(14,2)`), rates as `Decimal(5,2)` %, weights
`Decimal(10,3)` g, consistent with invoices. Interest rounding: to the nearest rupee per
calculation (my call — see below).

## Constraints

- Uses the existing stack: NestJS + Prisma/Postgres API, React web app, pdfkit for PDFs,
  RustFS for photos, existing auth roles (OWNER, STAFF; ACCOUNTANT read-only).
- Valuation must use the live rates and respect the existing billing guard (no demo/stale rates);
  if rates are unavailable the amount can still be typed manually, with a warning.
- Indian locale formatting (₹1,31,867), India time for dates and month counting.
- **Legal (owner to confirm with accountant):** lending against pledged items in Bihar may
  require a money-lender's licence and prescribe interest caps and slip contents. The slip
  layout should be easy to amend.

## Calls I made (owner to check)

1. **Each loan keeps its own rate and LTV**; changing Settings affects only new loans.
2. **Minimum one month of interest**, even if repaid the same day (follows from "part month =
   full month").
3. **Interest rounded to the nearest rupee.**
4. **LTV limits:** default 65%, warning above 70%; the app still allows a higher amount after a
   confirmation (owner and staff alike).
5. **Payment receipt printed for every payment**, not only the loan slip.
6. **Merchant side minimal:** name, phone (optional), date, amount received, returned date.
7. **Forfeiting** (closing an overdue loan as kept/sold) is allowed for owner and staff, like
   closing, and is audited.
8. **Back-dating** a loan or payment date is owner-only (staff use today's date), to protect the
   interest maths.
9. **No cash-register/daybook entries** in v1.
10. Optional **item photo** per item (uses existing photo storage).

## Decisions for v1 (owner: "build the minimum, we will improve later")

The builder check raised these; the owner asked to build the minimum with sensible defaults, to
be revisited later.

1. **Payment smaller than the interest due:** not allowed in v1 — a payment must at least cover
   the interest due (option a). Full repayment is always allowed.
2. **Minimum one month** applies to the loan's first period only. After a payment, the next
   period charges whole months started (part month = full month), so a second payment on the
   **same day** charges 0 months; a payment the next day charges 1 month.
3. **Existing paper loans:** entered as new loans; the owner may back-date the loan date and
   enter the current balance as the amount. No bulk import, no past-payment entry.
4. **Corrections:** only the latest payment can be reversed, owner only; it restores the
   principal and interest start date exactly. Loan amount/rate/items are not editable after
   saving (cancel by reversing payments or forfeiting is out of scope).
5. **Merchant pledge and release are per loan:** all items in a loan move together.
6. **Overdue clock:** counted from the loan date (12 months by default), regardless of interest
   payments.
7. **Valuation rate:** the shop's current rate for that purity (the live rate including the
   Patna premium), with the configurable LTV % (default 65%). A separate lending rate can come
   later.
8. **Top-ups** (adding money to an existing loan) are a new loan in v1.
9. Forfeiting is blocked while the item is with a merchant (get it back first).
10. Dashboard card deferred; the summary strip on the Lending page covers it in v1.
11. Printed amounts use "Rs." (the built-in PDF fonts have no ₹ glyph).

## Left to the builder

Exact screen layout and component structure, database naming, loan-number format details,
PDF styling, how search works, test structure, API shape.
