# Form Spec Schema — the JSON everything consumes

> **Status: approved design for the rebuild.** The single serialized shape parsed by the builder
> preview, the published runtime, and the draft/answer pipeline. Companions:
> [ARCHITECTURE_LAYOUTS_THEMES.md](./ARCHITECTURE_LAYOUTS_THEMES.md) (layers, token contract) ·
> [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md) (who owns each attribute) ·
> [RUNTIME_NOTES.md](./RUNTIME_NOTES.md). Authored 2026-07-03.

## 0 · The two rules that prevent drift

1. **One serializer, one parser.** The builder's live preview and the published guest runtime parse
   the SAME spec shape through the SAME code path. The old build's "gallery looks finished, live
   form looks half-baked" disease was exactly this rule not existing.
2. **Compile on publish.** The builder edits the L1 data-model records; **Publish compiles records →
   one immutable spec JSON** (this schema) stored on a version record. The runtime fetches ONE blob —
   no N-query guest loads, no live drift when builder data changes, and the resolve-at-publish token
   snapshot (§5) rides in the same artifact. Draft preview assembles the same shape in memory via the
   same serializer.

## 1 · Lifecycles

| Artifact | Contains | Mutability |
|---|---|---|
| **Draft spec** (in-memory, builder) | Everything below EXCEPT `resolved` | Rebuilt on every edit |
| **Published snapshot** (version record) | Everything below INCLUDING `resolved` | **Immutable** — re-publish creates a new version |

Version records are never edited in place. "Fix the live form" = edit records → publish again.

## 2 · Versioning & forward compatibility

- `specVersion` (integer) at the root. Bumped ONLY for breaking shape changes.
- **Parsers ignore unknown keys** — additive evolution needs no version bump.
- The runtime carries a tiny **upgrade chain** (`v1→v2→…`) applied at load; published snapshots are
  never migrated in storage.
- Same append-only spirit as the token contract: never rename or repurpose an existing key.

## 3 · Top-level shape (annotated)

```jsonc
{
  "specVersion": 1,

  "form": {
    "id": "a0X…",                    // form record Id
    "name": "Contact Us",
    "type": "form",                  // "form" (object-bound) | "survey" (answer-store)
    "targetObject": "Case",          // forms only; null for surveys
    "saveMode": "create",            // "create" | "update"
    "updateTarget": null             // ONLY when saveMode="update": { "source": "sourceRecord"|"urlParam", "param": "recordId" }
                                     // v1 posture: update mode is INTERNAL-audience only — guest+update is
                                     // deferred until RUNTIME_NOTES specs a token-gated pattern (never a raw
                                     // record Id in a URL). (UIUX review #26)
  },

  "settings": {
    "availability": {
      "status": "active",            // "active" | "closed"
      "opensAt": null,               // ISO datetime or null
      "closesAt": null,
      "responseCap": null,           // integer or null
      "closedMessage": "This form is no longer accepting responses."
    },
    "spamProtection": "honeypot",    // "none" | "honeypot" | "captcha"
    "prefill": {
      "source": "urlParams",         // "urlParams" | "sourceRecord" | "none"
      "autofillRules": []            // form-level prefill rules (catalog §4 formViewer)
    },
    "draft": {                       // v2 — Save & Resume DEFERRED (DEFERRED.md #2); always enabled:false in v1
      "enabled": false,
      "storage": "record",           // "record" | "local"
      "expiryDays": 30,
      "delivery": "link"             // "email" | "link"
    },
    "completion": {                  // After Submit (owner FormBuilder port, screenshots 2026-07-09;
                                     // rendered by c/finalAfterSubmit — display in P2, EXECUTION in P3)
      "mode": "screen",              // "screen" (thank-you page) | "toast" (success toast + go)
      "message": "<p>Thanks!</p>",   // rich text (screen); default thank-you when absent
      "autoRedirect": false,         // screen only — toast ALWAYS redirects
      "redirectTo": "record",        // "record" (the new/updated record) | "url" — shared by
                                     // screen auto-redirect AND toast
      "redirectUrl": null,           // when redirectTo="url"
      "redirectDelay": 5,            // seconds (screen auto-redirect)
      "actionButton": true,          // screen: the Continue button
      "buttonLabel": "Continue",
      "buttonGoesTo": "record",      // "record" | "url"
      "buttonUrl": null,
      "showSummary": false,          // v2 (deferred — response summary on the screen)
      "allowAnother": false          // v2 (deferred — "submit another response")
    }
  },

  "layout": {
    "type": "stepper",               // layoutRegistry key (ARCH §2.2) — scroll|stepper|tabs|accordion|rail|splitHero|oneAtATime
    "options": {                     // THIS primitive's presentation options (catalog §2) — shape varies by type
      "placement": "top", "mode": "numbered", "navigation": "gated", "showStepCount": true
    },
    "zonesDefault": {                // layoutZones defaults; pages may override
      "arrangement": "single",       // "single" | "twoCol" | "grid" | "bento"
      "gap": "md",
      "collapse": "standard",        // "early" | "standard" | "late" — CONTAINER-width constants in the
                                     // engine; raw px never crosses the wire (UIUX review #12)
      "collapseOrder": "source"
    },
    "maxWidth": "medium"             // narrow|medium|wide|full — structural, so it lives here.
                                     // NO "density" key (UIUX review #22): density is a THEME property
                                     // (ARCH §4.1); form-level density = theme.overrides.density — the one
                                     // cascade, never a second plumbing path. Rule of thumb: in the ARCH
                                     // §4.1 theme shape → override via theme.overrides; not in it → layout.
  },

  "theme": {
    "source": "builtin",             // "builtin" | "custom"
    "name": "editorialIvory",        // builtin catalog key OR custom-theme record Id (two value domains —
                                     // "source" disambiguates). If a custom theme record is deleted
                                     // post-publish: guests are safe via `resolved`; the BUILDER falls back
                                     // to the base theme + a warning (UIUX review nit)
    "overrides": {                   // SPARSE theme-property deltas (ARCH §4.3) — same shape as a theme
      "palette": { "accent": "#0d9488" },
      "radius": "round"
    }
  },

  "resolved": {                      // PUBLISHED SNAPSHOT ONLY — never present in drafts
    "tokens": { "--c-accent": "#0d9488", "--c-radius": "14px" /* … full contract */ },
    "engineVersion": 1,              // themeEngine version that produced it
    "resolvedAt": "2026-07-03T10:00:00Z"
  },

  "header": {
    "style": "standard",             // standard|minimal|none — "hero" RETIRED (owner 2026-07-05):
                                     // hero features live EXCLUSIVELY in splitHero's brand pane
                                     // (its config rides layout.options; catalog §2)
    "arrangement": "stacked",        // stacked|logoBeside|textOnly|inline|centered
    "title": "Contact Us",
    "description": "We reply within a day.",
    "logo": { "url": "…", "versionId": "068…" },
    "brandName": "Acme Outdoors",    // no logo → typeset wordmark in --c-font-display; logo wins when both set
    "bgImage": { "url": "…", "versionId": "068…" },
                                     // painted at the BOTTOM of the header surface (was "banner"). The color
                                     // veil above it is --c-header-bg — theme cascade (palette.headerBg +
                                     // headerBgOpacity composed to rgba by the engine), NOT keys here.
                                     // Kills the two-owners-for-one-opacity bug (UIUX review #28).
    "highlight": { "text": "Closes Friday!", "variant": "badge", "icon": null, "dismissible": false }
  },

  "submit": {
    "label": "Submit",
    "alignment": "right",            // left|center|right|stretch
    "placement": "sticky",           // inline|sticky
    "nextLabel": "Next", "backLabel": "Back",
                                     // NO "showProgress" key (UIUX review #5): progress is nav chrome and
                                     // the chosen primitive owns it — one indicator, never doubled.
    "saveDraft": { "show": false, "label": "Save & finish later" }
  },

  "pages": [ /* §4 */ ]
}
```

## 4 · Pages → sections → elements

```jsonc
{
  "id": "pg_k3f9x2mq",               // stable id (§6)
  "name": "Your details",
  "visibility": null,                // rule object (§7) or null = always
  "zones": { "arrangement": "twoCol" },  // sparse override of layout.zonesDefault

  "sections": [
    {
      "id": "sec_p8d2w7rt",
      "title": "Contact",
      "description": null,
      "icon": null,
      "style": "card",               // preset: plain|card|boxed|outline|subtle|flat
      "surface": {                   // explicit values — WIN over the preset (the cascade, ARCH §4.3)
        "bg": null, "border": null, "shadow": null, "padding": "md"
      },
      "columns": 2,                  // 1|2|3
      "collapsible": false,
      "defaultCollapsed": false,
      "visibility": null,
      "repeat": null,                // §4.1 — or { "childObject":"Contact", "relationshipField":"AccountId", "min":1, "max":5, "style":"stacked", "addLabel":"Add", "removeLabel":"Remove", "entryLabel":"Contact {index}" }
                                     // repeat.style: "stacked" | "table" | "tileModal" (mirrors catalog §3)

      "elements": [
        {
          "id": "el_m4t8s6vb",
          "type": "field",           // WIDGET-REGISTRY KEY (catalog §1 note) — see table below
          "binding": { "object": "Case", "field": "SuppliedEmail" },  // null for surveys + content types
          "label": "Email",
          "labelPosition": "top",    // top|left|hidden
          "labelStyle": "default",   // default|uppercase|muted
          "help": null,
          "placeholder": "you@example.com",
          "required": true,          // AUTHORING SUGAR ONLY (UIUX review #24): the serializer compiles it
                                     // into a validation entry at save/publish; the runtime evaluates
                                     // validation entries ONLY — one evaluator, one truth
          "readOnly": false,         // no "disabled" key (UIUX review #16) — read-only covers the real cases
          "defaultValue": null,      // static value or { "fromSource": "Contact.Email" } — element-level
                                     // defaultValue WINS over form-level settings.prefill (UIUX review nit)
          "width": 1,                // columns to span within the section grid
          "inputStyle": null,        // null = theme default; outline|filled|underline
          "validation": [            // §7 validation entries
            { "type": "pattern", "pattern": "^\\S+@\\S+$", "message": "Enter a valid email" }
          ],
          "visibility": null,
          "config": {},              // TYPE-SPECIFIC bag — see below
          "render": null             // COMPILED AT PUBLISH (UIUX review #21): display metadata from field
                                     // describe — { "inputType", "options": [], "maxLength", "scale",
                                     // "precision", "currencyCode", … }. Surveys: written directly by the
                                     // builder (the schema hook for the question-type inventory). Snapshot
                                     // honesty like the label/token snapshots — re-publish refreshes
                                     // describe drift (picklist changes etc.). Display-only; server still
                                     // enforces CRUD/FLS at submit.
        }
      ]
    }
  ]
}
```

**Element `type` = widget-registry key** (exact string). v1 registry:

| `type` | Widget (catalog) | `config` carries |
|---|---|---|
| `field` | native input via `elementRenderer` | picklist options (surveys), scale/format hints |
| `lookup` | `formLookup` §3 | displayFields, filters, dependentOn, allowCreate, recentlyViewed |
| `file` | `fileUpload` §3 | allowedTypes, maxSize, maxFiles, multiple, linkToRecord |
| `signature` | `formSignature` §3 | penColor, thickness, outputType |
| `map` | `formMap` §3 — **v2, deferred** (key reserved) | provider, addressBinding, zoom, allowPinDrop |
| `video` | `formVideo` §3 | source, urlOrId, autoplay, loop, muted |
| `hero` | — **RETIRED** (owner 2026-07-05; hero = splitHero's brand pane, catalog §2) | key reserved — ignore-unknown makes a future body-hero additive |
| `image` / `richText` / `divider` / `spacer` | content blocks | src / html / — / height |

Content types (`image`…`spacer`) have `binding: null` always. Unknown `type` at runtime renders a
placeholder ("unsupported element"), never crashes the form — same ignore-unknown discipline as §2.

### 4.1 Repeatable sections (repeaters)

Repeat lives at **section level only** (owner decision) — a repeating group IS a section; a
"chromeless" repeater is a repeatable section with `Plain` style (the builder's palette sells it as
a first-class **Repeating Group** item, catalog §5).

- **Defined once, instantiated at runtime.** The spec carries the section + its elements ONE time;
  entries are runtime instances and never appear as extra spec nodes.
- **Header info** (title / description) = the section's own fields. **Presentation** (style,
  add/remove labels, entry label) = the `repeat` block. **Binding** = `repeat.childObject` +
  `repeat.relationshipField` — compiled from the section record's `Parent_SObject_API__c` /
  `Relationship_Name__c` (DATA_MODEL_DELTA §1: those fields already exist).
- **Elements inside bind to the CHILD object's fields** (`binding.object` = the child) — they're
  ordinary elements otherwise.
- **Rules scope per entry:** visibility/validation referencing elements inside a repeatable section
  evaluate against the *same entry's* values — entry 2's "show if X = Yes" reads entry 2's X.
- **No nesting, ever (v1 law):** a repeater cannot contain a repeater — grandchild records are
  deferred multi-object territory.
- **No file elements inside repeatable sections (v1 law — UIUX review #23):** the builder blocks
  the drop. A flat `files` array keyed by `elementId` can't attach entry 1's file vs entry 2's to
  the right child record — and ~4.3 MB base64 × N entries is a heap bomb. The files entry shape
  reserves `entryIndex` (ignore-unknown = additive) for when this is genuinely wanted.

## 5 · The `resolved` block (resolve-at-publish)

Written by the **publish action only** (ARCH §4.2): it runs `themeEngine.resolveTokens(theme,
overrides)` at publish time and embeds the full token map.

- Guest/live runtime applies `resolved.tokens` directly — **never loads `themeCatalog`, never runs
  the engine**. Recipes stay off the public site; guest bundle stays small.
- `engineVersion` recorded so a future engine change can't silently re-style old published forms.
- Builder preview ignores `resolved` and runs the engine live (that's the point of client-side
  resolution — instant Design-mode feedback).
- **Dark mode: none in v1** — published forms render as designed (ARCH §4.4). If visitor-adaptive
  dark ever ships, it arrives as an appended `resolved.darkTokens` map — additive, no `specVersion`
  bump, still no guest engine.

## 6 · ID rules (load-bearing — drafts, answers, rules all key on these)

- Prefixed, crypto-random, client-generated at creation: `pg_` / `sec_` / `el_` + 8+ random chars.
- **Ids survive rename and move within a form. ANY duplication — element, section, page, or whole
  form — mints fresh ids for every copy** (answers/rules/drafts belong to the original). Two
  sentences, zero ambiguity (UIUX review #25).
- Everything references ids, never labels or positions: visibility rules (§7), draft payloads (§8),
  survey answers (§8), future translation keys.
- Renaming a question therefore never orphans its answers, rules, or drafts.

## 7 · Rule format (visibility + validation)

**Visibility** — declarative, Lightning-record-page pattern (owner decision: never raw expressions
in the spec). Evaluated by `expressionEngine` client-side:

```jsonc
{
  "action": "show",                 // "show" | "hide"
  "logic": "all",                   // "all" (AND) | "any" (OR) | "custom"
  "customLogic": null,              // "1 AND (2 OR 3)" — rule indexes, only when logic="custom"
  "rules": [
    { "source": "el_m4t8s6vb", "operator": "equals", "value": "Yes" }
  ]
}
```

- `source` is an **element id** (works identically for bound forms and unbound surveys).
- Operators v1: `equals` · `notEquals` · `contains` · `greaterThan` · `lessThan` · `isBlank` ·
  `isNotBlank`. Append-only enum.
- **Typing/coercion (define in `expressionEngine`'s spec before it builds — UIUX review nit):**
  `greaterThan`/`lessThan` compare numerically when both sides parse as numbers, as dates when the
  source element is a date type; otherwise the rule is a build-time spec error — never silent
  string comparison.
- **Repeater scoping (UIUX review #27):** elements inside a repeatable section are NOT valid
  `source`s outside that section — build-time spec error, never a runtime guess (which entry would
  it read?). Inside the section, rules read the same entry (§4.1).

**Validation** — array on the element; each entry:

```jsonc
{ "type": "range", "min": 18, "max": 120, "message": "Must be 18–120", "when": null }
```

`type`: `required` | `pattern` | `range` | `custom` (declarative comparison against another
element, e.g. Email == ConfirmEmail via `{ "compareTo": "el_x", "operator": "equals" }`).
`when` = optional visibility-style rule gating when the validation applies. Same `expressionEngine`
evaluates both — one evaluator, build + runtime (catalog §5 note).

## 8 · Answer & draft payloads (what leaves the form)

**Submission payload** (client → submit Apex):

```jsonc
{
  "formVersionId": "a0Y…",           // the published snapshot responded to
  "answers": { "el_m4t8s6vb": "jo@x.com", "el_q2…": ["A","C"] },   // keyed by element id
  "repeats": {                       // repeatable sections (§4.1) — array of entry maps per section id
    "sec_p8d2w7rt": [
      { "el_ph1": "555-0100", "el_ty1": "Mobile" },
      { "el_ph1": "555-0199", "el_ty1": "Work" }
    ]
  },
  "files": [ { "elementId": "el_f…", "name": "…", "base64": "…" } ],   // shape reserves "entryIndex" (§4.1 — unused in v1: file elements can't sit in repeatable sections)
  "meta": { "startedAt": "…", "submittedAt": "…", "language": "en_US" }
}
```

- **Forms:** server maps `answers` → record fields via the snapshot's bindings (server-side mapping —
  the client never names Salesforce fields; RUNTIME_NOTES elevated-context rules apply).

> **The served spec is a RUNTIME PROJECTION (UIUX review #21 — finishes the compile-on-publish
> thought).** Publish stores TWO artifacts on the version record: the **full spec** (with
> `binding` — server-side truth for answer mapping) and a **projection** with `binding` STRIPPED
> from every element and `render` compiled in (like `resolved.tokens`: stored at publish, not
> projected per serve — deterministic and cacheable). The runtime — guest AND internal viewer AND
> builder preview — parses ONLY the projection shape, keeping the one-parser rule honest: answers
> key by element id, so no client ever needs a field name, and §8's "client never names Salesforce
> fields" promise stops contradicting §4. Preview builds the same projection in memory via the same
> serializer (builder has describe access live).
- **Forms + `repeats`:** each entry inserts ONE child record (`repeat.relationshipField` = the new
  parent's Id) **inside the same submit savepoint** — parent + all entries are atomic (the old
  build's `FormSubmitController` already proved this path).
- **Surveys:** each answer becomes an answer-store row: `elementId` + **label snapshot** (question
  text at submit time) + value. The label snapshot keeps analytics honest after questions are
  reworded. Repeated answers additionally carry `Entry_Index__c` — without it, two entries'
  answers to the same question are indistinguishable.

**Draft payload** = the same shape + `resumeToken`, minus `files` (files upload on final submit
only). Resuming = fetch draft by token (RUNTIME_NOTES guardrails) → hydrate `answers` by element id.

**Asset URLs (UIUX review nit):** published snapshots embed image URLs (`logo.url`, header
`bgImage`, page image). Publish must snapshot **stable public URLs** (the config-image-storage
hardening list) — otherwise re-publish becomes the fix for every rotated file link.

## 9 · What this feeds

- **DATA_MODEL_DELTA.md** — the published-version record (spec blob + status), custom-theme record,
  draft record (token + payload + expiry), survey answer-store rows.
- **BUILD_PHASES.md** — P0 walking skeleton parses exactly this schema with one page / one section /
  `field` elements only; every later phase adds blocks without reshaping them.
