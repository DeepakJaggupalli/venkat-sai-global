# Commercial module (`src/modules/commercial`)

Plans, prices and limits; subscriptions; the credit ledger and entitlements; coupons; billing profiles; the tax
engine (India GST + configurable rates); invoices and credit notes; offline and online payments (Razorpay, Stripe)
with signed webhooks; refunds, disputes; recruitment-partner settlements; revenue reports. Server-only except
`schemas.ts`, `types.ts`, `constants.ts`, `money.ts`, `tax.ts`, `pricing.ts`, `periods.ts`, `lots.ts`,
`entitlement-rules.ts`, `settlement-rules.ts` (pure, client-safe).

**Rules that hold everywhere**

- Multi-currency: amounts are integer minor units + ISO currency. Nothing ever adds, compares or converts across
  currencies; reports group by currency. No assumed INR (defaults come from billing profiles / prices).
- Prices, limits, taxes and coupons are data (admin). Nothing is seeded except default GST rate rows (below).
- Candidates are never charged for jobs. Individual invoices exist only for services (training, assessments).
- Every service takes the actor (`StaffContext` from `requireStaff`, or `OrgContext` from `requireOrgMember`) and
  re-checks permission + scope (organisation id / buyer user id). Multi-row writes are transactional; important
  changes are audited (`commercial.*` actions); gateway calls never run inside a DB transaction.

## File map

| File | Contents |
|---|---|
| `entitlements.ts` | **Contract** (unchanged): `ENTITLEMENT_KEYS`, `EntitlementCheck`, `EntitlementError`, `ConsumeOptions`, `checkEntitlement`, `consumeEntitlement` |
| `entitlements-impl.ts` | Implementation + `computeEntitlementSnapshot`, `loadPlanContext`, `countUsage`, `usageWindow` |
| `entitlement-error.ts` | `EntitlementError` (re-exported by the contract; avoids an import cycle) |
| `plans.ts`, `coupons.ts`, `billing-profiles.ts`, `tax-rates.ts` | Admin / reference services |
| `invoices.ts` | Drafts, issue (GST number + snapshots), void, overdue, credit notes, payment application |
| `payments.ts`, `checkout.ts`, `webhooks.ts`, `gateways/*` | Offline payments, Razorpay / Stripe checkout, webhook inbox, REST clients, HMAC checks |
| `subscriptions.ts`, `allowances.ts`, `purchases.ts`, `fulfilment.ts` | Lifecycle, renewals, allowance grants, credit packs, what happens when an invoice is paid |
| `credits.ts`, `lots.ts` | Ledger primitives (locking, grants, expiry, adjustments), lot replay |
| `refunds.ts`, `disputes.ts`, `settlements.ts`, `settlement-rules.ts` | Money back, billing disputes, partner payouts |
| `queries.ts`, `reports.ts` | Read models (org-scoped, staff, partner) and revenue reports |
| `service.ts` | Barrel of every write function (import from here) |
| `actions.ts` | Server Actions for forms / buttons |
| `approval-handlers.ts`, `tasks.ts`, `seed.ts` | Registered automatically |

## Entitlements (`@/modules/commercial/entitlements`)

```ts
checkEntitlement(organizationId, key): Promise<EntitlementCheck>         // { allowed, limit (null = unlimited), used, remaining, reason?, planName? }
consumeEntitlement(organizationId, key, { reference: { type, id }, quantity?, actorUserId?, tx? }): Promise<void>  // throws EntitlementError when enforced and exhausted
```

- **Effective plan** = every live subscription (trialing, active, past_due; base + add-ons, limits summed; any
  unlimited → unlimited). Without a live base subscription, the audience's **default plan** (`plans.isDefault`)
  applies. Paused and pending subscriptions grant nothing.
- **`commercial.enforce_limits` off** (default): every check is allowed (limit/used/remaining still reported for
  display); `consumeEntitlement` still records a `consumption` row for reporting.
- **On**:
  - *Counted keys* — usage counted from real data, compared with the summed limit:
    `job_posts` (published, not deleted, not expired jobs of the org), `featured_jobs` (active featured promotions),
    `team_seats` (active members), `courses` (non-archived, non-rejected, not deleted), `bulk_requirements`
    (non-draft requirement requests created in the window), `partner_submissions` (non-withdrawn submissions created
    in the window). A plan feature with period `month`/`year` turns job posts / featured jobs / courses into "created
    in the window" limits. `consumeEntitlement` re-counts under the ledger lock **excluding the referenced item**
    (reference types `job`, `job_promotion`, `organization_member`, `course`, `requirement_request`,
    `partner_submission`), so callers may insert the item before or after consuming.
  - *Credit keys* — `candidate_unlocks`, `candidate_search`, `analytics_reports`: the credit-ledger balance decides.
    Allowances are granted at the start of each feature window (period `month`/`year`, anchored at the
    subscription's `startedAt`; `reset` grants expire at the window end, `rollover` grants stay until the
    subscription ends; period `none` = one grant per subscription). Purchased packs top up. Consumption takes a
    transaction-scoped advisory lock per (organisation, key) and appends seq + 1, so **balances never go below
    zero** while enforced (unique `(org, key, seq)` is the backstop).
- `consumeEntitlement` is **idempotent per (key, reference.type, reference.id)** — use a distinct reference id for
  a deliberate repeat charge (e.g. an unlock renewal).
- Reasons are upgrade-prompt ready, e.g. "Your plan includes 3 job posts and 3 are in use. Upgrade your plan or free
  one up to continue.", "You have no candidate unlock credits left. Your allowance resets on 2026-12-01. …",
  "Your organisation does not have an active plan that includes …".
- `billing.credits_low` goes to billing members when a credit balance crosses 10 % of the window allowance (min 1).
- Overdrafts (usage while not enforced, or under an unlimited feature) are written off with an `adjustment` before
  any new credits are added, so unenforced usage never eats paid credits.

```ts
computeEntitlementSnapshot(organizationId, { keys? }?): Promise<{ enforced: boolean; items: EntitlementUsage[] }>   // no authz — use getOrgBillingOverview
```

## Write API (`import { … } from "@/modules/commercial/service"`)

### Plans, coupons, tax rates, billing profiles

```ts
createPlan(staff, PlanFormInput): Promise<PlanRow>                       // commercial.plans; key immutable afterwards
updatePlan(staff, PlanUpdateInput): Promise<PlanRow>
setDefaultPlan(staff, planId, isDefault): Promise<void>                  // base plans only; one per audience
addPlanPrice(staff, { planId, currency, interval, amount: "1250.50", taxInclusive }): Promise<PlanPriceRow>   // one_time = add-on credit packs only
deactivatePlanPrice(staff, priceId), setPlanPriceProviderIds(staff, priceId, { razorpay?, stripe? })
setPlanFeature(staff, { planId, entitlementKey, unlimited, limitValue?, period, resetPolicy }): Promise<PlanFeatureRow>   // upsert
removePlanFeature(staff, planId, key), validateFeature(key, { period, resetPolicy }): string | null
saveCoupon(staff, CouponFormInput): Promise<CouponRow>                   // create/update; discount frozen after first redemption
setCouponActive(staff, couponId, isActive)
validateCoupon({ code, currency, planId?, organizationId?, userId?, at? }, tx?): Promise<{ ok: true, coupon } | { ok: false, reason }>
saveTaxRate(staff, TaxRateFormInput): Promise<TaxRateRow>                // commercial.plans; editing a rate clears its confirmation
confirmTaxRate(staff, taxRateId), listTaxRates(staff, { countryCode? })
upsertBillingProfile(actor, BillingProfileFormInput): Promise<BillingProfileRow>   // members: billing manage (own org); staff: commercial.invoices (+ organizationId)
getBillingProfile(organizationId, tx?)
```

### Invoices (`commercial.invoices`)

```ts
saveDraftInvoice(staff, ManualInvoiceInput): Promise<InvoiceRow>         // create / replace a draft (org XOR individual buyer); lines priced for preview
deleteDraftInvoice(staff, invoiceId)
applyCouponToDraft(staff, invoiceId, code): Promise<{ discountMinor }>    // redemption reserved now, discount applied at issue
removeCouponFromDraft(staff, invoiceId)
issueInvoice(staff, invoiceId, { dueDays? }?): Promise<InvoiceRow>        // re-prices with current rates, freezes buyer+seller snapshots, GST number
voidInvoice(staff, invoiceId, reason): Promise<InvoiceRow>               // issued/overdue with nothing paid; reverses coupon; cancels a pending subscription
markOverdueInvoices(now?): Promise<number>
deriveInvoiceStatus(invoice, now?), outstandingMinor(invoice)
```

Statuses: `draft → issued → partially_paid → paid → refunded`, `overdue` (past due, unpaid), `void`. Issued
documents are never edited. **Numbering**: `nextGstDocumentNumber("invoice" | "credit_note")` (CGST Rule 46,
≤ 16 characters, consecutive per financial year: `VSG/2627/000123`, credit notes `VSGC/2627/000045`), assigned only
at issue. Due date: issue + `commercial.invoice_due_days` (default 15), or as given.

### Payments and online checkout

```ts
recordOfflinePayment(staff, OfflinePaymentInput): Promise<PaymentRow>    // commercial.payments; bank_transfer (UTR) | upi_manual (UPI ref) | cheque (no.) | manual
allocatePayment(staff, { paymentId, invoiceId }): Promise<PaymentRow>   // advance payment → invoice of same org + currency
startInvoiceCheckout(user, { invoiceId, provider: "razorpay" | "stripe" }): Promise<RazorpayCheckoutPayload | StripeCheckoutRedirect>
verifyRazorpayCheckout(user, { orderId, paymentId, signature }): Promise<GatewayOutcome>
getCheckoutStatus(user, { provider, reference }): Promise<CheckoutStatus>   // return page; confirms delayed Stripe sessions
gatewayAmountProblem(amountMinor, minorUnits): string | null             // 3-decimal currencies need a trailing 0
expireStaleCheckouts(now?)                                                // pending gateway payments > 24 h → failed
```

Online payment is offered only when the flag **`commercial.online_payments`** is on AND the gateway keys are set
(`RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`; `STRIPE_SECRET_KEY`). Otherwise invoices are payable offline. Who may
pay: members of the invoice's organisation with the billing-manage permission, or the individual buyer.

- **Razorpay**: `POST /v1/orders` (basic auth key_id:key_secret) → client opens Checkout with the payload →
  handler response verified with HMAC-SHA256(`order_id|payment_id`, key_secret), confirmed with
  `GET /v1/payments/:id` (authorised payments are captured) and recorded. The webhook confirms it too (idempotent).
- **Stripe**: Checkout Session (form-encoded, bearer secret, `Idempotency-Key`) with
  `success_url=/billing/checkout/success?provider=stripe&session_id={CHECKOUT_SESSION_ID}` and
  `cancel_url=/billing/checkout/cancel?invoice=<id>`; our payment id travels in session + intent metadata.

### Subscriptions, credit packs, credits

```ts
startSubscription(actor, StartSubscriptionInput): Promise<{ subscription, invoice | null }>
changePlan(actor, ChangePlanInput): Promise<{ subscription, invoice | null }>
cancelSubscription(actor, { subscriptionId, reason?, immediately? }): Promise<SubscriptionRow>   // members: at period end only
resumeSubscription(actor, subscriptionId), setAutoRenew(actor, subscriptionId, autoRenew)
requestSubscriptionException(staff, { subscriptionId, kind: "extend_trial" | "extend_period" | "reactivate", days, reason })  // → approval
processSubscriptionRenewals(now?): Promise<RenewalSummary>                // task commercial.renewals
subscriptionsRenewingWithin(days, now?)
purchaseCreditPack(actor, { planPriceId, couponCode?, organizationId? }): Promise<InvoiceRow>    // credits granted on payment
quotePlanPrice(actor, { planPriceId, couponCode?, organizationId? }): Promise<PriceQuote>        // tax-inclusive preview, problems listed
adjustCredits(staff, { organizationId, entitlementKey, delta, note, expiresAt? })               // commercial.plans; credit keys only; never below 0
getCreditBalance(orgId, key, tx?), getCreditBalances(orgId), expireDueCredits(now?, { organizationId? }?)
```

**Subscription lifecycle** (billing is invoice-based for every provider):

```
startSubscription ─┬─ trial (plan.trialDays, first time on this plan) ─► trialing ─┐
                   ├─ free price / staff contract ──────────────────────► active  │
                   └─ paid price ─► pending + first invoice ─(paid)─────► active  │
renewals (daily): reminders 7 and 1 days before the period end; renewal invoice issued 7 days before, due on the
period end; at the end: paid / free → active (next period, allowances granted); unpaid → past_due (period advanced,
still live); past_due longer than commercial.grace_period_days (default 7) → expired (renewal invoice voided,
allowances closed); cancelAtPeriodEnd → cancelled at the end; autoRenew off → expired at the end.
pending not paid by due date + grace → cancelled (invoice voided).
```

Members' subscriptions start with automatic renewal on (they can switch it off with `setAutoRenew`); staff choose
`autoRenew` when they create one. A subscription without a price (staff contract) has no period end and never renews
or expires by itself.

**Plan changes** (documented policy): `changePlan` creates the new base subscription as `pending` with a full
first-period invoice. The switch is **immediate when that invoice is paid** (or at once for free plans / staff
contracts): the old subscription ends at that moment (`cancelled`, "Replaced by plan change to …"), its unpaid
future invoices are voided and its allowances closed. **No proration** — unused time of the old plan is not credited
automatically; finance may agree a credit through a `subscription_exception` approval or a refund.

### Refunds, disputes

```ts
requestRefund(staff, { paymentId, amount?, reason }): Promise<RefundRow>          // commercial.payments | commercial.refunds → approval "refund"
resubmitRefund(staff, { refundId, amount?, reason? })                              // after "changes requested"
completeManualRefund(staff, { refundId, reference, processedAt })                 // commercial.refunds; offline payments
retryRefund(staff, refundId), processApprovedRefund(refundId)                      // task commercial.process_refund
openDispute(actor, { paymentId?, invoiceId?, amount?, reason })                    // members (own org, billing view) or staff commercial.refunds
updateDispute(staff, { disputeId, status, resolution? })                           // open → under_review → resolved | rejected
```

Refund flow: `requested → (approval) approved → [gateway: processing → completed | failed] | [offline:
completeManualRefund → completed]`; rejected on rejection. Completion updates payment (`partially_refunded` /
`refunded`) and invoice (`amountRefundedMinor`, `refunded` when everything paid is refunded), issues a **GST credit
note** (lines scaled exactly, own number series) and sends `billing.refund_processed`.

### Partner settlements (`partners.settlements`; partners `partner.settlements.view`, own only)

```ts
computeSettlementDrafts(staff, { partnerOrganizationId, periodStart, periodEnd }): Promise<ComputeResult>   // one draft per currency; skipped placements with reasons
addSettlementLine(staff, { settlementId, kind: "bonus" | "adjustment" | "deduction", description, amount })
removeSettlementLine(staff, lineId), updateSettlementDraft(staff, { settlementId, withholdingTax?, notes?, internalNotes? })
submitSettlement(staff, settlementId)                                    // → approval "partner_settlement"
markSettlementPaid(staff, { settlementId, paymentReference, paidAt }), cancelSettlement(staff, settlementId, reason)
disputeSettlement(partnerCtx, { settlementId, reason }), resolveSettlementDispute(staff, { settlementId, outcome, note })
submitPartnerInvoice(partnerCtx, { settlementId, partnerInvoiceNumber, partnerInvoiceFileId? })
```

Fee rules (`settlement-rules.ts`): placements attributed to the partner (`placements.partnerOrganizationId`), terms
from the assignment's `commissionTerms` (if a model is set) else the partner agreement in force on the joining date.
`flat_per_placement`/`fixed_per_placement`: amount after `payableAfterDays` from joining; `flat_per_selection`: from
the placement date; `percent_of_fee`: % of the placement fee (fee currency); `salary_percentage`: % of the
annualised salary (year ×1, month ×12, week ×52; other periods manual); `none`: nothing; `custom`: manual line.
Every unsettled fee payable by the period end is included (earlier periods are caught up); a placement fee is
settled once (`partner_settlement_lines_placement_fee_uq`). Net payable = amount − tax deducted at source.

### Webhooks

```ts
handleRazorpayWebhook(rawBody, headers): Promise<{ status, body }>      // POST /api/v1/webhooks/razorpay
handleStripeWebhook(rawBody, headers, now?): Promise<{ status, body }>  // POST /api/v1/webhooks/stripe
```

Signature over the raw body (Razorpay `X-Razorpay-Signature` with `RAZORPAY_WEBHOOK_SECRET`; Stripe
`Stripe-Signature` `t=…,v1=…` with `STRIPE_WEBHOOK_SECRET`, 5-minute tolerance, constant-time, any of several v1).
Forged requests → 400, never stored. Events are stored once per (provider, event id) in `payment_webhook_events`;
replays of processed events → 200 `{ duplicate: true }`; failures → 500 (provider retries; the event is processed
again). Handled: Razorpay `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`;
Stripe `checkout.session.completed`, `checkout.session.async_payment_succeeded|failed`,
`payment_intent.payment_failed`, `refund.created|updated`. Others are stored as `ignored`.

## Read API (`import { … } from "@/modules/commercial/queries"`)

```ts
// Public / portal
getPlanCatalog(audience, { kind?, includeNonPublic? }?): Promise<PlanView[]>          // active (public) plans + active prices (all currencies) + features
getOrgBillingOverview(orgCtx): Promise<OrgBillingOverview>                              // plans, pending change, usage vs limits, credits, outstanding per currency, online options
listOrgInvoices(orgCtx, { status?, documentType?, currency? }, page): Promise<Paginated<InvoiceListItem>>   // never drafts
listOrgPayments(orgCtx, page), listOrgCreditLedger(orgCtx, { key? }, page), listOrgDisputes(orgCtx, page)
getInvoiceForViewer(invoiceId): Promise<{ document: InvoiceDocumentView; access: InvoiceViewerAccess } | null>   // printable page access rules
listPartnerSettlements(partnerCtx, page), getSettlementDetail(staffOrPartner, settlementId)   // partners: no internal notes, no drafts
// Command Centre (commercial.view unless noted)
listPlansForAdmin(staff, { audience? }), listCoupons(staff, filters, page)
listSubscriptions(staff, filters, page), getSubscriptionDetail(staff, id)
listInvoices(staff, { status?: InvoiceStatus | "open", documentType?, organizationId?, currency?, q? }, page), getInvoiceForStaff(staff, id)
listPayments(staff, { status?, provider?, organizationId?, unallocated?, currency? }, page)
listRefunds(staff, filters, page), listDisputes(staff, filters, page), listWebhookEvents(staff, filters, page)
getOrgBillingForStaff(staff, orgId), listCreditLedgerForStaff(staff, orgId, { key? }, page), listOrganizationsWithOutstanding(staff)
listSettlements(staff, { status?, partnerOrganizationId? }, page)       // partners.settlements
```

Reports (`@/modules/commercial/reports`, `commercial.reports`; months in `DEFAULT_TIMEZONE`, grouped by currency):
`revenueByMonth(staff, { from, to })` (invoiced, credited, net, net tax, collected, refunded),
`outstandingInvoices(staff, now?)` (ageing buckets), `activeSubscriptionsByPlan(staff)` (counts by status +
monthly-equivalent recurring amount per currency), `paymentsByProvider(staff, { from, to })`.

## Server Actions (`actions.ts`)

Portal actions take a hidden `portal` field (`employer` | `recruiter` | `institution`): `saveBillingProfileAction`,
`startSubscriptionAction`, `changePlanAction`, `cancelSubscriptionAction` (portal optional → staff),
`resumeSubscriptionAction`, `setAutoRenewAction`, `purchaseCreditPackAction`, `quotePlanPriceAction`,
`openDisputeAction`; checkout (any signed-in payer): `startCheckoutAction({ invoiceId, provider })`,
`verifyRazorpayPaymentAction({ orderId, paymentId, signature })`; partner: `disputeSettlementAction`,
`submitPartnerInvoiceAction`. Command Centre: `createPlanAction`, `updatePlanAction`, `setDefaultPlanAction`,
`addPlanPriceAction`, `deactivatePlanPriceAction`, `setPlanFeatureAction`, `removePlanFeatureAction`,
`saveCouponAction`, `setCouponActiveAction`, `saveTaxRateAction`, `confirmTaxRateAction`,
`saveBillingProfileForStaffAction`, `saveDraftInvoiceAction` (lines as `lines:json`), `deleteDraftInvoiceAction`,
`applyCouponToDraftAction`, `removeCouponFromDraftAction`, `issueInvoiceAction`, `voidInvoiceAction`,
`recordOfflinePaymentAction`, `allocatePaymentAction`, `requestRefundAction`, `resubmitRefundAction`,
`completeManualRefundAction`, `retryRefundAction`, `openDisputeForStaffAction`, `updateDisputeAction`,
`startSubscriptionForStaffAction`, `changePlanForStaffAction`, `requestSubscriptionExceptionAction`,
`adjustCreditsAction`, `computeSettlementAction`, `addSettlementLineAction`, `removeSettlementLineAction`,
`updateSettlementDraftAction`, `submitSettlementAction`, `markSettlementPaidAction`, `cancelSettlementAction`,
`resolveSettlementDisputeAction`. All return `ActionResult` (`fieldErrors` keyed by schema paths).

## Pages and routes (owned here)

| Route | Contract |
|---|---|
| `/billing/invoices/[id]` | Printable invoice / credit note (A4 print CSS, "Print or save as PDF"). Access: members of the invoice's org with `employer.billing.view` / `partner.billing.manage` / `institution.billing.manage`, the individual buyer, or staff with `commercial.view` (drafts too); others → 404. Seller and buyer from the frozen snapshots; line taxes + tax breakdown; reverse-charge line; balance due; pay-online buttons when available; offline payment instructions when configured. |
| `/billing/checkout/success` | `?provider=stripe&session_id=…` or `?provider=razorpay&order_id=…`: real payment status (confirms a delayed Stripe session) |
| `/billing/checkout/cancel` | `?invoice=…`: nothing charged; link back to the invoice |
| `POST /api/v1/webhooks/razorpay`, `POST /api/v1/webhooks/stripe` | See Webhooks |

## Tax engine (`tax.ts`, `pricing.ts`)

1. A treatment chosen by staff on a manual invoice (`export`, `sez`, `exempt`, `reverse_charge`, `out_of_scope`)
   charges no tax (`standard` = automatic).
2. Buyer marked tax-exempt → `exempt`.
3. Seller in India **without a GSTIN** (blank `taxId` in `commercial.seller_details`) is not GST-registered → no GST
   (`out_of_scope`), document titled "Invoice" (with a GSTIN: "Tax invoice").
4. Seller and buyer in India: **same GST state code → CGST + SGST** (each the configured rate, e.g. 9 % + 9 %);
   **different state → IGST** (e.g. 18 %). The buyer's state code (place of supply) is required.
5. Buyer outside India: rates configured for the buyer's country (VAT / sales tax, optionally per region) apply;
   otherwise **zero-rated export of services** (default, `commercial.export_zero_rated`), or IGST with place of
   supply 96 when export zero-rating is switched off.
6. Individuals have no state code on record: place of supply = the supplier's location (IGST Act s. 12(2)(b)).

Rates are matched by country, region, kind, HSN/SAC code (a rate for the line's code beats a generic rate) and
effective dates. Lines default to `commercial.default_tax_code` (9985).

**Rounding**: amounts are integer minor units of the invoice currency (INR paise, KWD fils, JPY yen). Tax is computed
**per line and per component**, half away from zero at the minor unit; the invoice tax is the sum of the rounded
components (never re-rounded). Tax-inclusive prices: net = round(gross ÷ (1 + rate)), components on that net, and
the net absorbs any one-minor-unit difference so net + tax = gross exactly. Percent coupons round half away from zero
on the pre-tax amount, fixed coupons are capped at it, and the discount is allocated to lines by largest remainder
before tax. `invoice.total = subtotal − discount + tax` always holds (DB check).

## Configuration

Settings used: `commercial.enforce_limits`, `commercial.seller_details` (fields: `legalName`, `address` or
`addressLine1/2`, `city`, `postalCode`, `stateRegion`, `stateCode` (GST), `countryCode` (default
`platform.home_country`), `taxId` (GSTIN), `email`, `phone`, `paymentInstructions` (printed on unpaid invoices)),
`commercial.invoice_prefix_note` (invoice footer), `platform.home_country`. Flags: `commercial.subscriptions`
(self-serve purchases), `commercial.online_payments`. Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DEFAULT_TIMEZONE`.

Keys not yet in the settings catalogue (read from `platform_settings` when a row exists, defaults in
`COMMERCIAL_CONFIG_DEFAULTS`): `commercial.grace_period_days` (7), `commercial.invoice_due_days` (15),
`commercial.export_zero_rated` (true), `commercial.default_tax_code` ("9985").

## Seed (`seed.ts`)

Inserts once, never updates: India GST for services under **SAC 9985** — CGST 9 %, SGST 9 %, IGST 18 %, effective
1 July 2017 — marked as **default configuration that finance must confirm** (`confirmedAt` null + note). No plans,
prices or coupons.

## Approvals, tasks, notifications, audit

- Approval handlers: `refund`, `subscription_exception` (applies `{ kind, days }` on approval), `partner_settlement`
  (approved → approved; rejected → cancelled; changes requested → draft). Admin links:
  `/admin/commercial/{refunds|subscriptions|settlements}/<id>`.
- Tasks: `commercial.renewals` (daily: credits expiry, reminders, renewal invoices, period changes, past-due expiry,
  pending cancellation, allowance top-ups, overdue invoices, abandoned checkouts) and
  `commercial.process_refund { refundId }`.
- Notifications (`data` keys): `billing.invoice_issued` (code, amount, organizationName, dueAt),
  `billing.payment_received` (code, amount, invoiceCode), `billing.payment_failed` (amount?, invoiceCode, reason),
  `billing.renewal_due` (planName, renewsOn, daysLeft, endsAtPeriodEnd), `billing.subscription_expired` (planName),
  `billing.credits_low` (remaining, creditName), `billing.refund_processed` (code, amount), and new:
  `billing.subscription_changed` (planName, change, status, periodEnd), `billing.dispute_updated` (status,
  resolution, forStaff, reason), `partner.settlement_updated` (code, change, status, amount, periodStart, periodEnd,
  paymentReference, note, forStaff, reason). Billing events go to members with the billing permission of the
  organisation type, plus the billing-profile e-mail when no member uses it.
- Audit actions: `commercial.plan_*`, `commercial.coupon_*`, `commercial.tax_rate_*`, `commercial.billing_profile_*`,
  `commercial.invoice_*`, `commercial.credit_note_issued`, `commercial.payment_*`, `commercial.checkout_started`,
  `commercial.subscription_*`, `commercial.credit_pack_ordered`, `commercial.credits_adjusted`,
  `commercial.refund_*`, `commercial.dispute_*`, `commercial.settlement_*`.

## Tests

```powershell
npx vitest run src/modules/commercial                         # pure: tax, totals/rounding (INR/KWD/JPY), periods, lots, rules, signatures
node scripts/test-db.mjs vsg_test_commercial
$env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_commercial'; npx vitest run src/modules/commercial
```

Integration (`commercial.integration.test.ts`): seed idempotency; GST invoice issue + snapshots + numbering +
partial/full offline payments; IGST / export / KWD / JPY; coupons + void; entitlements off / on (counted + credits +
reasons); **12 concurrent consumptions against 5 credits → exactly 5 succeed, balance never negative**; credit packs
with overdraft write-off; subscription activation, renewal invoices, reminders, past due, expiry; plan change without
proration; cancel at period end; trial + approved exception; refund approval → credit note; Razorpay and Stripe
webhooks (signature, replay, forgery, stale timestamp, failure); partner settlement computation, approval, payout,
dispute and partner scoping.

## Known limits

- Gateway-managed recurring billing (Razorpay Subscriptions / Stripe Billing) is not used: renewals are invoices,
  payable online or offline. Chargeback webhooks (`charge.dispute.*`) are not processed; record them as disputes.
- Stripe zero-decimal / three-decimal currencies are handled; HUF/TWD special cases are not.
- Invoice PDFs are produced by the browser (print to PDF); `invoices.pdfFileId` is not filled.
- Webhook payloads may contain payer contact details; purge them with the privacy retention jobs.
