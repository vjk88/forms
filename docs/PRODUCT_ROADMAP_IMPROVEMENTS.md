# Product Roadmap & Improvement Opportunities

**Product:** Native Forms & Surveys for Salesforce
**This document:** Where the product can go next — completing in-flight work, net-new capabilities, technical/quality investments, AppExchange readiness, and bigger-picture bets. Each item notes **why** it matters and a rough **effort/impact** read.
**Companion documents:** `FORMS_BUSINESS_OVERVIEW.md`, `SURVEYS_BUSINESS_OVERVIEW.md`

**Effort/Impact key:** S/M/L effort · ★–★★★ impact

---

## A. Finish what's already in flight (highest ROI)

These are partially built; completing them unlocks features the builder already advertises.

### A1. The shared related-record fetch engine — `getRecordFields` · M · ★★★
**The single highest-leverage piece of work.** A small, FLS-safe Apex `getRecordFields(objectApiName, recordId, fieldApiNames)` plus a client layer that watches lookup fields, fetches on change (debounced, cached), and merges values into the runtime value map. **Three features depend on it:**
- **Autofill rules** (cross-object prefill: Contact-Id-in-URL → Case fields; hidden-lookup-as-source).
- **One-level relationship visibility** (`Account.Type`).
- **"Current User" full-field visibility** already uses a sibling of this pattern.
Build this once and three roadmap items light up. *Constraints already decided: single-target (non-polymorphic) lookups, one hop, FLS-enforced, debounced/cached.*

### A2. Autofill rules · M · ★★★
On top of A1: let an admin map a source record's fields onto form fields. Source = a **URL parameter** carrying a record Id, **or** a **lookup element** on the form (which can be hidden). Example: pass `?contactId=…` to a Case form and auto-fill SuppliedEmail/Phone/AccountId from that Contact. Scaffolding (`Element_Lookup_Mapping__c`, prefill fields) already exists. **Massive time-saver** for prefilled, context-aware forms.

### A3. Render-As at runtime · M · ★★
The builder and preview already support Toggle/Radio/Dropdown/Checkbox-group/Slider per field type; the **player** must render them and merge their values into the `lightning-record-edit-form` submission (via `onsubmit`). Supporting Apex (`getPicklistOptions`) exists. **Closes the gap between what admins configure and what users see.**

### A4. Content blocks at runtime · S · ★★
Render **Image / Callout / Spacer** in the player (Display Text, Divider, File Upload already render). Trivial templates; pairs naturally with the Render-As player pass.

### A5. Survey submission runtime · L · ★★★
The biggest Surveys gap: render the question types (NPS/Likert/Star/Long Text), write `Form_Response__c` + typed `Form_Response_Answer__c`, and populate the response↔record links (including URL-prefilled context). **Without this, Surveys can be authored but not collected.**

### A6. Page-level visibility UI · S · ★
The runtime engine already evaluates page visibility; just add the "Edit Rules" button on page properties (sections/elements already have it).

---

## B. Net-new capabilities

### B1. Survey analytics — Levels 1–3 · L · ★★★
The strategic moat for Surveys (see Surveys doc §5):
- **L1 — Normalized scores + topics:** question `Analytics_Role`/`Scale`/`Topic`, answer `Normalized_Score` (0–100), compute-on-submit, report types/fact object. *No AI.*
- **L2 — Sentiment via Agentforce prompt template:** pluggable scorer onto the answer record; design session pending.
- **L3 — Question Bank** (`Survey_Question__c`) with add-a-question-on-the-fly that also pushes to the bank → true cross-survey comparability.

### B2. Guest / public adapter · L · ★★★
A separate, explicitly-elevated `without sharing` controller with its own object/field allowlists, restricted lookup search for guests, URL-Id prefill, and spam protection. Unlocks **public-facing forms and surveys** (lead capture, public CSAT) — a huge market segment — while keeping the internal controller locked down. The Public/Guest adapter flag and public-image distribution are already in place as the foundation.

### B3. Form governance components · M · ★★
- **Hidden field** (carries URL/context prefill, never shown) — directly enables A2.
- **Consent / Terms acceptance** checkbox with policy link.
- **CAPTCHA / honeypot** spam guard — effectively mandatory the moment forms go public (pairs with B2).
- **E-signature capture** (consent/contracts).

### B4. Form themes · M · ★★
Preset themes + full custom styling on the Settings tab. A "theme" is literally a named set of the existing `--c-*` design tokens, stored in the layout JSON and applied as token overrides on the form root — the token system was built specifically to make this cheap. Big perceived-polish win for a managed package.

### B5. Formula / calculated fields · M · ★
Read-only display of formula fields in edit context; optional **client-side approximation** (`$Quantity * $Unit_Price`) that updates live as users type, for new-record creation. Specified in the docs, not built.

### B6. Lookup enhancements · M · ★★
Finish the Lookup picker (Typeahead/Modal), add **create-related-record-on-the-fly**, and restricted guest lookup. Lookups are one of the most-requested form capabilities.

### B7. Richer value/operator coverage in visibility · S · ★
- Multipicklist "contains" with a true multi-select value control.
- "Current User" **picklist** value pickers (today user picklists fall back to text).
- Relative date operators (today, last N days) for date fields.

### B8. Distribution & embedding · M · ★★
- **Flow Screen** adapter (drop a form into a Flow).
- **Experience Cloud** page/component packaging.
- **Embedded** adapter (iframe/LWC on external sites) with the right CSP guidance.
The adapter list already anticipates these; they need real implementations.

---

## C. Technical & quality investments

### C1. Apex test classes · L · ★★★ (blocker for AppExchange)
Deliberately deferred until the feature set settled — now the most important quality debt. AppExchange requires **75%+ coverage** and security review. Need a `TestDataFactory`, bulk tests (200+), guest/FLS-negative tests, and trigger/controller coverage. **Nothing ships to the AppExchange without this.**

### C2. Reconcile the dual model (JSON vs. relational) · L · ★★
The design lives in `Layout_Config__c` JSON; the normalized `Form_Section__c`/`Form_Element__c` objects (and their validation rules) exist but aren't populated. Decide: (a) keep JSON as source of truth and treat the relational objects as an optional reporting projection generated on publish, or (b) migrate to relational persistence. Today there's ambiguity and dormant scaffolding. **Pick one and document it.**

### C3. Reusable component library · M · ★★
Per the standing "build modular components" preference: extract a **typed value-input** component (used by visibility now, autofill next), a **field-picker**, and keep consolidating shared Apex (`getRecordFields`, `getPicklistOptions`). Reduces duplication and keeps behavior consistent as surface area grows.

### C4. Accessibility pass · M · ★★
The app uses SLDS and lightning base components (good baseline), but the **custom-built controls** (segmented toggles, custom dropdowns, drag-drop chips, the icon grid) need an ARIA/keyboard audit. Important for public-sector and enterprise procurement (WCAG/Section 508).

### C5. Localization / translation · M · ★★
Externalize UI strings to **custom labels**, support **Translation Workbench** for form content, and respect user locale for number/date formatting. Essential for global customers and a differentiator vs. some competitors.

### C6. Performance & limits hardening · M · ★
- Image cleanup when an Image element is deleted (and on form delete) — a known leak.
- Layout JSON size monitoring (131 KB field limit) as forms grow.
- Debounce/caching for the fetch engine; lazy-load picklist/related data.
- Edit-mode visibility seeding from the loaded record (today rules evaluate against empty values until first change).

### C7. Error handling & observability · S · ★
Consistent user-facing error toasts, a structured logging strategy (Platform Events or a log object) for runtime failures, and admin-visible diagnostics for publish/save failures.

---

## D. AppExchange go-to-market readiness

Beyond C1 (tests), a managed package needs:
- **Security Review** prep — run Code Analyzer/Checkmarx, address findings, document the security model (the `WITH USER_MODE` / guest-guard discipline already in place is a strong start).
- **Namespace & packaging** — 2GP package setup, install scripts, post-install configuration.
- **Permission set + permission set groups** for clean entitlement (the `Form_Builder_Admin` set exists; add a runtime/end-user set).
- **CSP Trusted Sites** for any embedded/external resources.
- **Sample data / quick-start** forms and a guided setup experience.
- **Listing assets** — these very business documents are the seed of the listing narrative and the demo script.

---

## E. Bigger-picture bets (where this could go)

### E1. Agentforce-native experiences · L · ★★★
Surveys already plan an Agentforce sentiment scorer. Go further: **conversational forms** — an agent that fills a form through dialogue, or an agent that *acts on* survey sentiment (auto-create a follow-up case when CSAT is low). This aligns the product with Salesforce's AI direction and is hard for external form tools to replicate.

### E2. Data Cloud integration · L · ★★
Stream survey responses and sentiment into **Data Cloud** for unified profiles and segmentation — "show me all promoters in the manufacturing segment" — and trigger journeys. Turns feedback into activation.

### E3. Workflow & automation hooks · M · ★★
First-class **Flow/Platform Event** emission on submit (beyond the native record DML), so admins can orchestrate post-submission journeys declaratively. A "submit → start this Flow" option in the Completion tab.

### E4. Templates & a form marketplace · M · ★★
A library of starter templates (intake, registration, CSAT, NPS) and the ability to export/import form definitions (the JSON layout makes this natural). Accelerates time-to-value and seeds a community.

### E5. Analytics dashboards out of the box · M · ★★
Ship CRM Analytics / report-type packs so a customer gets "Response volume, completion rate, average score by topic, sentiment trend" without building anything — the payoff of the typed answer store and normalization layer.

### E6. Multi-record & complex transactions · L · ★
Forms that create a parent **and** multiple related children in one transaction (the nested repeater schema already anticipates this), with all-or-nothing DML. Powerful for order entry, applications, etc.

### E7. Scheduling & recurrence · M · ★
Send a survey on a schedule (e.g., post-case-close CSAT triggered by a record event), with response tracking and reminders — closing the loop from "build" to "distribute" to "measure."

---

## F. Suggested sequencing

A pragmatic order that respects dependencies and ROI:

1. **`getRecordFields` engine (A1)** → unblocks autofill + relationship visibility + finishes user-field visibility.
2. **Autofill (A2)** and **relationship visibility** — immediate, visible admin value on the engine.
3. **Render-As + content blocks at runtime (A3, A4)** — close the build-vs-runtime gap; small and high-satisfaction.
4. **Survey submission runtime (A5)** → then **Analytics L1 (B1)** — makes Surveys actually usable end-to-end, then valuable.
5. **Apex tests (C1)** in parallel from here on — required for any release.
6. **Guest/public adapter (B2)** + **governance components (B3)** — open the public-forms market.
7. **Themes (B4)**, **localization (C5)**, **accessibility (C4)** — polish for enterprise/AppExchange.
8. **Analytics L2/L3 (Agentforce sentiment, Question Bank)** and the **bigger bets (E)** — the long-term moat.

---

## G. The one-line strategic summary

The foundation — native builder, versioning, native runtime, a Lightning-grade conditional-visibility engine, and a hardened security model — is **built and deployed**. The path to a market-leading AppExchange product runs through **one shared data-fetch engine** (which unlocks autofill and cross-object logic), the **survey response runtime + analytics layers** (the differentiated moat), the **guest adapter** (the public-forms market), and **Apex tests** (the gate to shipping). Everything is already architected so these slot in cleanly rather than requiring rework.
