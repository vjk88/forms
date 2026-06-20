# Custom Lookup Render — Spec

A respondent-facing record picker (`c/formLookup`) that replaces the native
`lightning-input-field` for Reference fields, so we own the UX *and* make lookups
work for **guests** (native lookups can't search for unauthenticated users).

Status: SPEC (no code yet). Scope locked 2026-06-20:
- Filter sources: **Declarative** (primary) + **Advanced SOQL WHERE** (admin escape hatch).
- Power features (all in): **multi-field display, recently-viewed, inline ＋New, dependent/cascading filter**.
- Audience: **Internal + Guest** from v1.

Related: [[project-visibility-rules]] (declarative pattern reused), [[project-autofill]]
(guest allow-list pattern reused), URL-prefill ([[project-guest-render-url-prefill]]).

---

## 1. Config contract — `element.lookupConfig` (per lookup field, in body JSON)

```jsonc
{
  "targetObject": "Account",            // from the Reference field; explicit (future: polymorphic picker)
  "display": {
    "primaryField": "Name",
    "secondaryFields": ["Industry", "BillingCity"]   // result subtitle / columns
  },
  "searchFields": ["Name"],             // fields the type-ahead matches (LIKE)
  "filter": {
    "source": "declarative",            // "all" | "declarative" | "soql"
    "logic": "all",                     // all | any | custom  (declarative only)
    "rules": [
      { "field": "Industry", "operator": "equals", "value": "Manufacturing" },
      { "field": "OwnerId",  "operator": "equals", "value": "$User.Id" },
      { "field": "ParentId", "operator": "equals", "value": "$field.AccountId" }  // DEPENDENT
    ],
    "soqlWhere": ""                      // when source = "soql" (admin-only, WHERE clause only)
  },
  "behavior": {
    "recentlyViewed": true,
    "allowCreate": false,               // inline ＋New (guest-gated OFF regardless)
    "minChars": 2,
    "maxResults": 8,
    "orderBy": "Name"
  }
}
```

`source: "all"` is the implicit default (no filter rows configured → any accessible record).

## 2. Filter model

**Declarative (primary).** Reuse the visibility-rule operators/UX (field · operator ·
value rows + AND/OR/custom logic). Compiled SERVER-SIDE to a **parameter-bound** SOQL
WHERE; never string-concatenated. Operators map: equals/notEqual → `=`/`!=`,
contains/startsWith → bound `LIKE`, isNull/isNotNull, numeric comparisons, IN.

**Dynamic value tokens** (what makes it powerful):
- `$User.Id`, `$User.<field>` — running user.
- `$field.<apiName>` — another field's current value on the form → **dependent/cascading**
  lookups (Contact filtered by the chosen Account). Resolved from `context` the client sends.
- URL params (mirror URL-prefill).

**Advanced SOQL WHERE.** WHERE clause only — we own `SELECT`+`FROM`, bind the search
term. Admin-only authoring. ⚠️ Security-review sensitive: only ever executed from the
PUBLISHED, server-loaded config (never client-supplied), `WITH USER_MODE`. Guests: only
if declared in the published body and allow-listed.

## 3. Power features
- **Multi-field display** — primary + secondary fields (title + subtitle).
- **Recently-viewed** — show suggestions before the user types (SOSL/recent records).
- **Inline ＋New** — create the target record in a modal if not found. Internal only in
  v1; **guest = off** (create needs elevated, separate review).
- **Dependent/cascading** — via `$field.<api>` filter tokens + `context` (see §5).

## 4. Security architecture (the reason to go custom)

`FormLookupController.searchLookup(formId, fieldKey, term, contextJson)`:
- **Server-derives the config** from the PUBLISHED body (find element by fieldKey) — does
  NOT trust a client-supplied config. Mirrors `allowedAutofillFields`.
- Compiles the filter to bound SOQL; binds `term` and validated `context` values.
- Internal: `WITH USER_MODE`. **Guests** → `FormViewerGuest.guestSearchLookup`, hard-gate
  (Published + Public_Guest) + allow-list (object + the declared filter only).
- `createLookupRecord(...)` — internal `WITH USER_MODE` insert; guest disabled in v1.

## 5. Runtime integration
- `formStudio`: Reference fields get a **`Lookup` renderAs** option → writes
  `element.renderAs='Lookup'` + `element.lookupConfig`. Inspector exposes target/display/
  search/filter-builder/behavior.
- `formSectionRenderer`: `RENDER_KINDS.Lookup = 'lookup'` → renders `<c-form-lookup>`
  instead of `lightning-input-field`; value (record Id) collected via the custom-control
  path in `getValues()`; prefill seeds initial Id + display label.
- **Context for dependent filters**: `formViewer` already threads `enginePrefill` + live
  values down; pass the relevant field values to `c/formLookup` as `context` so the search
  call can resolve `$field.*` tokens. Re-search when a referenced field changes.

## 6. Phased build
- **P1 — Config + builder.** `Lookup` renderAs + `lookupConfig` inspector (target, display,
  search, behavior) + declarative filter builder (reuse visibility-editor pattern) + body
  round-trip. No runtime yet.
- **P2 — Respondent component + internal search.** `c/formLookup` (type-ahead, multi-field
  results, recently-viewed, min-chars/debounce) + `FormLookupController.searchLookup`
  (USER_MODE, declarative compile). Wire renderAs into the renderer + value + prefill.
- **P3 — Dependent filters + SOQL source.** `$field.*` context wiring; SOQL WHERE source.
- **P4 — Guest path + inline ＋New.** `FormViewerGuest.guestSearchLookup` + allow-list;
  ＋New modal (internal). Apex tests across the matrix.
