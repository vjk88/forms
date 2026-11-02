# Submission PDFs, payments, and document generation

Date: 2026-10-27 (America/Chicago)  
Status: proposed implementation plan; no feature code or org changes made.

## Outcome and release order

Extend the existing form experience from collecting answers to delivering a saved copy, collecting a payment, and producing personalized documents. Ship each experience separately, with features off by default on existing forms.

| Milestone | Respondent outcome | Scope | Exit evidence |
| --- | --- | --- | --- |
| M0: shared foundation and feasibility | No visible change yet | Submission snapshots, scoped receipt access, PDF and payment integration spikes | Recorded architecture decisions and real-org prototypes |
| M1: submission PDFs | Submit, then download a branded copy | Built-in submission document; internal and guest access; optional Salesforce File retention | Freeform, survey, and classic-form acceptance cases |
| M2: payments | Submit, pay, then receive confirmation | Stripe hosted checkout; one-time fixed amounts first; calculated amounts next | Test-mode payment and recovery journeys in an org |
| M3: DocGen | Receive a personalized document | Versioned templates, merge fields, conditional sections, repeating tables | Documents generated from a pinned input snapshot and template version |

Detailed plans:

- [M1: submission PDF downloads](./specs/IMPL_PLAN_SUBMISSION_PDF.md)
- [M2: payment integration](./specs/IMPL_PLAN_PAYMENTS.md)
- [M3: document generation](./specs/IMPL_PLAN_DOCGEN.md)

> **Status 2026-11-02:** the three detailed plans above are not written yet. M1's first part, the
> **in-session copy** (the respondent downloads their answers right after submitting, staff download a
> submission, builders download a blank form), is built in the browser with no receipt:
> [IMPL_PLAN_FORM_PDF.md](./IMPL_PLAN_FORM_PDF.md). It records the M1 engine decision and the F0.2
> font findings. The receipt-backed parts of M1 (re-download later, guest recovery, File retention,
> emailed copy) still depend on M0 below.

M0 does only enough shared work to support M1. Payment and template records arrive in their own milestones. Sequence is a dependency plan, not a delivery-date commitment; estimate implementation after the feasibility gates.

## Verified starting points

Inspected local source on the date above. These are source findings, not claims about the deployed org or a complete inventory of the repository.

| Existing source | Finding and planning consequence |
| --- | --- |
| [FinalSubmitService](../../force-app/main/default/classes/FinalSubmitService.cls) | Surveys create `Form_Response__c` and answer rows; freeform forms create `Form_Submission__c` and answer rows; classic forms insert/update business records and return their ID. A universal immutable submission receipt does not exist in these paths. |
| [FinalSubmitController](../../force-app/main/default/classes/FinalSubmitController.cls) | Internal result has `recordId`, `childCount`, and `errors`. Preserve those fields when extending the completion contract. |
| [FinalGuestController](../../force-app/main/default/classes/FinalGuestController.cls) | Guest result has `success` and `childCount`, deliberately no record ID. Existing freeform retry lookup must never become authorization to read answers or mint download access. |
| [Submission key field](../../force-app/main/default/objects/Form_Submission__c/fields/Submission_Key__c.field-meta.xml) | Freeform has a unique browser-minted retry key. Survey/classic receipt and retry behavior need explicit design. |
| [FinalMappingTriggerHandler](../../force-app/main/default/classes/FinalMappingTriggerHandler.cls) | Freeform insertion currently queues configured mapping immediately. Payment-dependent mapping requires a gate before this queueing occurs. |
| [finalFormViewer](../../force-app/main/default/lwc/finalFormViewer/finalFormViewer.js), [finalGuestHost](../../force-app/main/default/lwc/finalGuestHost/finalGuestHost.js) | Internal submit and delegated guest submit converge on completion. The guest host currently discards the result and calls `completeSubmit()` without arguments. Both contracts need coordinated changes. |
| [finalAfterSubmit](../../force-app/main/default/lwc/finalAfterSubmit/finalAfterSubmit.js) | Presentation component emits navigation intent. Keep payment/document orchestration in the host/service layer. |
| [FinalSpecController](../../force-app/main/default/classes/FinalSpecController.cls), [FinalSpecTransferValidator](../../force-app/main/default/classes/FinalSpecTransferValidator.cls) | Publishing and transfer validation are integration points for new settings and immutable version references. |
| [FORM_SPEC_SCHEMA](./FORM_SPEC_SCHEMA.md) | Completion settings live at `settings.completion`; use that actual contract rather than the shorthand in component comments. |

Recheck any older pending-work ledger against source before treating it as a dependency. In particular, assess current server-side validation, abuse controls, and guest authorization during M0.

## Product defaults

- Submission PDF: a readable print document with branding and submitted answers. Exact reproduction of interactive layouts and custom web fonts is outside M1.
- Payments: Stripe is the working first-provider assumption, not a configured account or committed commercial arrangement. Each subscriber uses its own merchant account; platform fees, Connect onboarding, subscriptions, tax calculation, and marketplace payouts are outside M2.
- Payments launch on freeform forms first. Survey/classic forms need explicit persistence and business-write semantics before payment can be enabled there.
- DocGen launches with PDF output and a constrained native template editor. Word template import, DOCX output, and electronic signatures are separate future projects.
- No customer data is sent to an external document renderer by default. Native PDF feasibility must be proven; failure triggers a documented engine decision, not a silent external-service fallback.
- Proposed product wording for the payment release: “Salesforce-native forms, submissions, and documents, with optional payment-provider integrations.” Update [PRODUCT.md](../../PRODUCT.md) when that capability is implemented; the current no-third-party-processing promise cannot describe payment processing.

## Shared contracts

### Submission receipt and input snapshot

Introduce an app-owned receipt for feature-enabled submissions. It ties together the accepted submission, immutable form version, sanitized answer/display snapshot, and subsequent outputs. Proposed schema names below are design candidates, not existing metadata or a deployment manifest.

| Proposed record | Minimum responsibility | Introduced |
| --- | --- | --- |
| `Form_Receipt__c` | Form/version association; source kind and server-owned source reference; unique attempt identity; accepted timestamp; snapshot version/hash; private snapshot storage reference | M0/M1 |
| `Form_Document__c` | Receipt; document kind/template version; unique generation key; pending/ready/failed/expired status; private File reference; retry/error metadata; expiry | M1 |
| Scoped access grant | Hashed random bearer token; receipt/document scope; expiry/revocation; creator proof for recovery. Decide separate record vs receipt-owned grant after the spike. | M1 |
| `Form_Payment__c` | Receipt; merchant/mode; frozen amount/currency; payment state and provider identifiers | M2 |
| Payment attempt and event records | Checkout attempt identity, provider event deduplication, durable processing/retry state | M2 |
| Document template/version records | Editable template plus immutable publishable versions; portable merge schema | M3 |

Snapshot content: accepted field labels and values, repeated-entry order, display values already authorized for the respondent, visible sections, form title/brand, locale/time zone, and submission timestamp. Use server normalization and authorization. Do not trust a client-supplied list of visible fields or reread mutable business records to reconstruct what was submitted. Store large snapshots privately with an explicit size cap; settle the storage representation during M0.

Receipt creation and the accepted submission must commit together. Document rendering, external checkout, and delivery run after commit. A rendering or payment-provider outage must not erase accepted answers. Snapshots contain only data allowed in the resulting document; hidden internal values and unapproved Salesforce merge fields are excluded.

Maintain separate states for submission acceptance, payment, mapping, document generation, and delivery. “Answers saved” does not mean “payment received,” and “payment received” does not mean “document ready.”

### Guest and internal access

Authenticated access checks sharing and relevant CRUD/FLS. Guest receipt access uses a dedicated, revocable, expiring capability scoped to one receipt/document; it never grants general record or Files access. Do not use a Salesforce ID, session ID, submission key, or provider session ID as authorization.

M0 must prove safe creation/recovery: a submit retry may receive a document capability only with independent proof bound to the original submitter. Persist that proof securely before the initial submission so a lost response can be recovered. Evaluate a server-issued signed/opaque attempt grant and avoid logging tokens. Existing idempotency lookup alone is insufficient.

Every public endpoint independently checks scope, expiry, revocation, feature policy, and applicable availability rules. Keep the existing availability gates until an explicit receipt-download policy is specified and tested; closure must not accidentally create a bypass or revoke legitimate recovery without defined behavior. A payment webhook must still reconcile a previously accepted payment after form closure, without accepting new submissions.

### Configuration and preview

Proposed additive settings: `settings.documents` and `settings.payments`, plus completion actions within existing `settings.completion`. Final property names require schema, serializer, validator, import/export, guest projection, and round-trip tests in the same implementation slice. Absence means disabled. Credentials and internal bindings never appear in the guest projection.

Keep Documents and Payments as progressively disclosed settings sections. After submission controls the respondent's actions and messages. Preview simulates PDF/payment states with sample data; it cannot create receipts, files, live checkout sessions, or payment charges.

## M0 execution backlog

- [ ] F0.1: Trace all submit paths, retries, mapping triggers, published-spec projection, and host completion contracts. Freeze a fixture for each form type and audience.
- [ ] F0.2: Render representative native PDFs in an org: long answers, repeated tables, logo, international text, page breaks, and Files storage/download. Record limits and supported branding.
- [ ] F0.3: Prove guest access grant issuance, lost-response recovery, revocation, and binary download delivery without public Files sharing. Record URL/referrer/logging handling.
- [ ] F0.4: Define receipt/snapshot schema, transaction boundaries, retention, permission sets, and backwards-compatible result DTOs. Verify that classic record updates remain atomic with their receipt.
- [ ] F0.5: Prove payment credentials, execution identity, checkout callout, and signed webhook ingress in a sandbox/test account. Credentials and account setup are implementation prerequisites, not needed to finish this plan.
- [ ] F0.6: Record engine and hosting decisions, representative load ceilings, operational retry policy, and implementation estimates; then implement M1 slices.

## Release and validation policy

Each milestone requires targeted frontend contract tests, Apex tests against an org, and real internal/guest journeys. PDF tests include rendered-file inspection; payment tests include actual provider test-mode events. Jest alone does not prove Salesforce compilation, guest permissions, or rendering.

Use additive metadata and feature flags. Preserve existing behavior when disabled. Verify 2GP install/upgrade behavior, permissions, and subscriber credential provisioning before distribution. Rollback disables new initiation while allowing authorized retrieval, reconciliation, and recovery of already-accepted work. Deploy only exact files changed for a slice using targeted `--source-dir` arguments, per workspace rules.

## External evidence

Official documentation checked while planning; feature feasibility still requires an org spike.

- Salesforce developer guide: [Visualforce PDF considerations](https://developer.salesforce.com/docs/platform/salesforce-pages-developers-guide/guide/pages-output-pdf-considerations.html) — print-specific rendering, CSS/JavaScript and asset limitations.
- Salesforce developer guide: [Supported PDF fonts](https://developer.salesforce.com/docs/platform/salesforce-pages-developers-guide/guide/pages-output-pdf-supported-fonts.html) — supported font families and international text constraints.
- Salesforce developer guide: [Package Named Credentials](https://developer.salesforce.com/docs/platform/named-credentials/guide/nc-package-credentials.html) and [populate credential principals](https://developer.salesforce.com/docs/platform/named-credentials/guide/nc-populate-external-credentials.html) — packaging and subscriber setup.
- Stripe: [Checkout payment completion](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted), [webhooks](https://docs.stripe.com/webhooks), and [idempotent requests](https://docs.stripe.com/api/idempotent_requests) — confirmation, event delivery, and retry behavior.
