# Hosting Adapters — one form, many surfaces (spec'd 2026-07-05, PARKED)

> Owner intent: the FinalDesign runtime must be reusable across a wide variety of use cases —
> a form declares **where it may render**, and every surface adapter validates that declaration
> **server-side** before serving the spec. Deferred ledger item; see [DEFERRED.md](./DEFERRED.md).

## The concept

One spec (`Spec_JSON__c`), one renderer (`finalFormViewer`), many thin **hosts**. Each host is an
"adapter": it acquires the spec through a controller that checks the form's allowed-surface
declaration and refuses to serve it anywhere it isn't sanctioned. A Survey can never be a Record
Page (owner rule) — the constraint is data, not convention.

**Prior art in this repo:** legacy already did a v0 of this — `Allowed_Adapters__c` on `Form__c`
(multiselect: `Internal_Record_Page` / `Flow_Screen` / `Public_Guest` / `Embedded`) with every
legacy controller validating it before rendering. The concept is ratified for FinalDesign; the
legacy value set and enforcement code are NOT the spec — rebuild both when scheduled.

## Target surface set

| Surface | What it means | Notes for the build |
|---|---|---|
| Internal app page | LEX app/home/tab hosting (today's `Final P0 Test`) | v1 baseline — effectively always allowed |
| Lightning Record Page | Form on a record flexipage in **record-edit** or **record-create** mode | Needs record-context binding (prefill/save against the hosting record). **Survey NEVER allowed here** — type-derived constraint |
| Flow screen | Viewer as a Flow screen component | Needs a Flow I/O contract (inputs: recordId/prefill; outputs: created record Id, completion state) |
| Experience / guest page | Published public form | Already the P5 plan — guest is just the first adapter to build |
| External iFrame embed | Form embedded on non-Salesforce websites | Biggest scope: Sites/LWR endpoint, CSP `frame-ancestors`, clickjacking posture, resize messaging, spam tier — interacts with review F13 (asset URLs) |
| Embedded LWC | Composed inside another team's LWC | Legacy `Embedded` value; needs a public-API posture for the viewer |

## Model rules

1. **Declaration lives with the form** — today `Allowed_Adapters__c` (KEPT per DATA_MODEL_DELTA);
   whether it stays a field or moves into the spec (with the field as an indexed mirror for list
   filtering/reporting) is open question #2.
2. **Enforcement is server-side per adapter.** Client hints are UX; the spec-fetch controller is
   the gate. Guest (P5) and internal fetch paths both check.
3. **`Form_Type__c` derives constraints** — the type axis (Form = object-bound, Survey =
   answer-store) implies surface eligibility: Survey ≠ Record Page; a record-bound Form is the
   natural Record Page / Flow citizen.
4. **Creation flow sets type-sensible defaults** when this builds — until then the field is inert
   for final* (nothing reads it) and its picklist default stays as-is.

## Open questions (decide when scheduled)

1. Granularity: one `Record_Page` value vs separate Edit/Create; do surfaces carry per-surface
   options (e.g. record-context field map for Record Page, resize policy for iFrame)?
2. Field vs spec: one-spec-document rule pulls the declaration into `Design_Config_JSON__c`/spec;
   list-view filtering pulls toward keeping the multiselect field. Possibly both (spec = truth,
   field = compiled mirror at publish).
3. iFrame embed is likely its own phase (identity, CSPs, spam, messaging) — don't let it ride
   along with the cheap adapters.

## When to revisit

After **P5** ships: the guest runtime IS adapter #2 (internal app page being #1), and its
controller shape will tell us what the generic adapter contract looks like. Record Page and Flow
are the highest-value next surfaces.
