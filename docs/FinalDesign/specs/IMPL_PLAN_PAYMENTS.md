# M2: payment integration

Date: 2026-10-27  
Status: planned; working provider assumption is Stripe. See the [roadmap](../PLAN_DOCUMENTS_AND_PAYMENTS.md).

## Scope and commercial model

Each subscriber connects its own merchant account. Start with hosted checkout, one-time card payments, one currency per form, and a fixed amount. Add calculated totals as a second release slice with server-owned price rules. Payments initially apply only to freeform forms with persisted answers.

No subscriptions, split payments, platform fees, Connect marketplace onboarding, tax engine, discount system, stored card handling, or in-app refund initiation in M2. Refunds performed at the provider still need reconciliation into the local payment status. Payment confirmation is distinct from a tax invoice.

The default journey is: save answers -> create checkout -> pay -> verify payment -> release payment-dependent mapping/documents. Clearly tell respondents that answers are saved while payment is pending. A cancellation or failed charge preserves the submission and offers a safe retry.

## Integration and authentication

Use an outbound provider adapter with Named Credential / External Credential authentication. Keep provider credentials out of form JSON, source control, browser payloads, and logs. Bind all requests to the subscriber's configured merchant and test/live mode. Package metadata and provision secrets after installation; verify credential ownership/control and principal permissions against [Salesforce packaging guidance](https://developer.salesforce.com/docs/platform/named-credentials/guide/nc-package-credentials.html).

A credential principal does not automatically become usable by a guest or every async job. M0 must prove the callout execution identity and least-privilege access for guest-initiated checkout. Prefer a narrowly scoped integration worker; document provisioning and dispatch. Do not grant guests broad credential access as a shortcut.

Inbound design candidate: a dedicated Salesforce HTTPS Apex REST endpoint verifies provider signatures and durably records events before processing. Prove unauthenticated endpoint routing, package compatibility, raw-body availability, and verification in an org. Webhook signing-secret storage is a separate design decision: outbound Named Credentials do not imply Apex-readable webhook secrets. Record protected runtime storage, provisioning, and rotation before implementation. An external relay would require an explicit architectural decision.

Use a stable, pinned provider API version. Do not adopt preview versions simply because documentation examples use them.

## Data and transaction model

Maintain a receipt-linked payment obligation plus checkout attempts. Freeze amount in integer currency minor units, currency, merchant, environment, price-rule version, and submission identity before checkout. Currency precision must use provider-supported rules, not a universal multiplication by 100.

1. Submission transaction saves accepted answers, receipt, frozen payment obligation, and a durable checkout request. No provider callout inside the submission DML transaction.
2. A worker reads committed input and creates/retrieves checkout with a stable idempotency key for that attempt. Callout and persistence order must be proven against Salesforce transaction rules.
3. The browser retrieves only its authorized checkout URL/status. Cancellation permits resuming a valid existing checkout; a new attempt is created only when the prior attempt is conclusively expired/closed. An ambiguous timeout triggers reconciliation.
4. A verified event is persisted with a unique merchant + environment + event-ID key. A worker checks provider objects, receipt association, amount, currency, and actual paid status before marking the obligation paid.
5. A unique fulfillment job releases payment-dependent actions once. Each downstream action also deduplicates by receipt/action version. Failure after charging becomes “paid; processing needs retry,” never “pay again.”

The return URL is a UX signal, not payment evidence. Checkout completion alone is insufficient if the payment method can remain pending. Use server-verified payment status; see [Stripe completion guidance](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted).

## State and recovery rules

| State | Respondent/admin behavior |
| --- | --- |
| Checkout pending / ready | Show amount/currency and preparing/pay action; preserve answers |
| Processing / status unknown | Reconcile existing attempt; do not create another charge |
| Paid | Show confirmed payment; queue eligible fulfillment once |
| Failed / expired | Offer a controlled retry after verifying the previous attempt's state |
| Partially refunded / refunded / disputed | Show reconciled status; flag admin follow-up; do not automatically rerun or reverse business mapping |

Treat cancellation as a browser action until provider state is checked. An old failure/expiry event must not overwrite a verified success. Duplicate and out-of-order events are expected; derive changes from authoritative provider state. Verify signatures over the raw body, enforce timestamp/replay policy, support key rotation, and acknowledge only after durable acceptance. [Stripe webhook documentation](https://docs.stripe.com/webhooks)

Set bounded callout timeouts and exponential backoff with jitter for transient failures/rate limits. Exhausted retries enter an admin-visible failed queue. Reconcile stale pending payments on a schedule and allow audited manual rechecks. Provider idempotency has finite retention, so local attempt uniqueness and reconciliation remain necessary for older retries. [Stripe idempotency documentation](https://docs.stripe.com/api/idempotent_requests)

Log correlation IDs, state changes, attempt counts, and safe error codes. Exclude secrets, access grants, payment card data, and unnecessary answers. Define a short, explicit retention policy for incoming event payloads.

## Mapping dependency

`FinalMappingTriggerHandler.beforeInsert/afterInsert` currently marks mapped freeform submissions queued and starts jobs immediately. Add a server-computed awaiting-payment gate before enqueueing, including direct insert, retry, and worker entry paths. Recheck payment inside the mapping worker so bypassing a UI gate cannot release fulfillment.

Payment success creates one durable release action; the existing mapping engine executes its pinned rules. Keep mapping failures independent from payment success. Refund/dispute policy is admin review initially. Audit installed automation that runs on submission insertion: this gate controls app mapping, and does not automatically control customer Flows/triggers.

Classic forms currently write business records during submit; survey writeback also needs separate semantics. Payment-required publishing is rejected for those form types until a later plan defines pre-payment storage and deferred business writes.

## Implementation slices

| Slice | Deliverable | Exit evidence |
| --- | --- | --- |
| PAY-1 | Subscriber setup, credential/identity and webhook spike | Real test-mode checkout and verified event reach the intended org/merchant |
| PAY-2 | Fixed-price obligation, attempt uniqueness, request worker, scoped checkout/status endpoints | Timeout/retry cannot create duplicate obligations or unsafe second checkouts |
| PAY-3 | Durable event ingress, state reducer, reconciliation and admin status | Duplicate, delayed, missing, and reordered events converge correctly |
| PAY-4 | Payment gate for mapping and paid documents; action deduplication | Failed/unpaid submissions never release gated work; paid failures retry without recharging |
| PAY-5 | Builder settings, completion flow, test/live distinction, cancellation/recovery | Internal and guest journeys work; preview cannot initiate real checkout |
| PAY-6 | Calculated amounts using published rules and validated answers | Altered browser amounts, hidden prices, invalid quantities, rounding, and overflow are rejected |
| PAY-7 | Package install/upgrade, secret rotation, monitoring and runbook | Fresh subscriber setup and recovery drill pass |

## Release acceptance

- [ ] Success, decline, cancellation, authentication challenge, abandoned checkout, browser closed after payment, and delayed webhook are exercised in provider test mode.
- [ ] Tampered amount/currency/merchant/mode/session association and forged signatures cannot mark paid.
- [ ] Parallel clicks, lost callout responses, provider 429/5xx, and retries after the provider's idempotency window cannot cause unintended duplicate charges.
- [ ] Duplicate or reordered events cannot regress paid state or duplicate mappings/documents.
- [ ] Disabling a form/integration stops new initiation while accepted payments still reconcile; expired access grants have defined recovery behavior.
- [ ] Refund/dispute events, failed mapping after successful payment, queue exhaustion, and credential rotation have admin-visible recovery paths.
- [ ] Packaging tests validate credential principals, webhook registration, site permissions, and test/live isolation. Product copy describes optional external payment processing accurately.
