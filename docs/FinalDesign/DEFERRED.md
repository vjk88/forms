# Deferred Ledger — consciously OUT of scope for v1

> The single list of parked features. Items here keep their written specs (spec'd ≠ scheduled) —
> this ledger is what stops them from sneaking into a build phase. Review before v2 planning and at
> each phase gate. Companions: [BUILD_PHASES.md](./BUILD_PHASES.md) (what IS in scope) ·
> [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md). Started 2026-07-04.

| # | Item | What it is | Spec lives at | Why parked / revisit when |
|---|---|---|---|---|
| 1 | **`formMap` — location/map element** | Address plotting / pin-drop widget | Catalog §3 · RUNTIME_NOTES embeds | **Owner call 2026-07-04: not needed now.** Registry key `map` stays reserved; revisit on demand |
| 2 | **Save & Resume (whole feature)** | `draftManager`, `Form_Draft__c`, submitBar "Save & Finish Later", resume links, expiry purge job | Catalog §4 · Schema `settings.draft` · DATA_MODEL_DELTA §3 · RUNTIME_NOTES guest drafts | **Owner call 2026-07-04: v2.** Do NOT create `Form_Draft__c` in v1; `settings.draft.enabled` stays `false`. Security rules are pre-written for when it lands |
| 3 | **Theme Deletion Safety** | Apex validation rule / trigger blocking **hard-delete** of `Theme_Definition__c` records whose Ids are referenced inside active `Form__c.Design_Config_JSON__c` drafts | This row (owner-added 2026-07-04) | v1 posture already covers most of it: **published forms are immune** (resolved token snapshot) and `Is_Active__c` soft-delete is the sanctioned removal path. The trigger hardens the hard-delete edge for drafts — build as P2-era hardening in v2 |
| 4 | **Survey i18n** (`translationService` + Translation Map) | Per-language authored copy for unbound surveys | Catalog "Localization" note | Bound forms auto-translate via platform; survey demand not there yet |
| 5 | **Visitor-adaptive dark mode** | Per-form opt-in, `resolved.darkTokens` appended at publish | ARCH §4.4 · Schema §5 | Forms render as designed (closed decision); door open by construction |
| 6 | **Element-level repeater** | Repeating field-group INSIDE a section | Catalog §3 formRepeater note | Section-level covers known cases; payload keys by container id so the same engine composes later |
| 7 | **Multi-object / grandchild records** | Nested repeaters, composite forms | [../redesign/](../redesign/) multi-object deep-dive | Needs its own submission-engine design round |
| 8 | **Per-field field-state color overrides** | Override focus/error colors on ONE field | Catalog §1 note (review Rec 1) | Theme-level ships in v1; per-field is rare-need bloat |
| 9 | **`Spec_JSON__c` 131k overflow** | ContentVersion overflow storage for giant specs | DATA_MODEL_DELTA §2 | Build when a real form hits the cap — don't preclude, don't pre-build |
| 10 | **CAPTCHA integration** | Third org-configured spam tier | RUNTIME_NOTES spam | Honeypot + server rate-limit ship in v1; CAPTCHA when abuse demands |
| 11 | **Survey analytics (phases 2–3) + sentiment** | Aggregation dashboards, Agentforce sentiment | Form-vs-Survey model notes | After the runtime proves itself |

**Rules of the ledger:** an item leaves this list only by (a) being scheduled into a named phase of
a version plan, or (b) being explicitly killed. Adding an item here requires pointing to where its
spec lives (write the spec first, park it second).
