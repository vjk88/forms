# Data Model Delta — kept · changed · added · retired

> **Status: approved design for the rebuild.** The data model is the KEPT layer (L1) — this doc is
> the small delta the rebuild needs, verified against the actual objects in `force-app/main/default/objects/`
> (not assumed). Companions: [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md) (what the blobs contain) ·
> [RUNTIME_NOTES.md](./RUNTIME_NOTES.md) (guest access rules). Authored 2026-07-03.

## 1 · Kept as-is (the solid core)

| Object | Role |
|---|---|
| `Form__c` | Form root (see field delta §2) |
| `Form_Page__c` / `Form_Section__c` / `Form_Element__c` | The structure tree the builder edits. **`Form_Section__c` already carries the repeater fields** — `Is_Repeatable__c`, `Min/Max_Repetitions__c`, `Parent_SObject_API__c`, `Relationship_Name__c` — load-bearing for spec §4.1, kept ✓. A repeater's elements are ordinary `Form_Element__c` rows bound to the CHILD object's fields |
| `Form_Version__c` | Published snapshot home (see field delta §2) |
| `Form_Response__c` | Response header — record links (Contact/Case/Lead/…), session, status ✓ already built |
| `Form_Response_Answer__c` | Answer store — **`Element_Key__c` already matches the spec's element-id keying** ✓; typed value columns ✓ |
| `Form_Template__c` | Gallery templates (§7 creation) |
| `Element_Lookup_Mapping__c` | Lookup config support |

## 2 · Changed (field-level delta)

### `Form_Version__c` — becomes the compile-on-publish artifact
| Change | Why |
|---|---|
| **Add `Spec_JSON__c`** (LongTextArea 131,072) | THE published spec blob (FORM_SPEC_SCHEMA) incl. the `resolved` token snapshot. One blob = one-query guest load |
| **Add `Engine_Version__c`** (Number) | Pins which themeEngine produced `resolved` (spec §5) |
| Deprecate `Schema_Snapshot__c` / `Layout_Spec__c` / `Layout_Config__c` / `Layout_Mode__c` | Three-way spec split was the old build; the new spec is ONE document. Deprecate = stop writing, keep until legacy cutover (§5) |
| Keep `Is_Active__c`, `Version_Number__c`, `Published_By__c`/`Published_Date__c`, `Change_Notes__c` | Already right |

> **131k overflow rule:** if `Spec_JSON__c` exceeds the LongTextArea cap (giant forms), the publish
> action stores the spec as a `ContentVersion` attached to the version record and `Spec_JSON__c`
> holds `{"overflow": true}`. The runtime loader handles both. Don't build this until a real form
> hits the cap — just don't *preclude* it.

### `Form__c` — draft-side config consolidates
| Change | Why |
|---|---|
| **Add `Design_Config_JSON__c`** (LongTextArea) | The draft-side home of the spec's `layout` + `theme` + `header` + `submit` + `settings` blocks. Structure lives in the child records; publish compiles both into `Spec_JSON__c` |
| Deprecate `Global_Styles_JSON__c` / `Layout_Config__c` / `Layout_Mode__c` | Superseded by `Design_Config_JSON__c` |
| **Retire `Submission_Storage__c`** | The storage axis was removed from the model ([[project-form-vs-survey-model]]) — `Form_Type__c` (kept ✓) is the only axis |

### `Form_Section__c` — one addition
| Change | Why |
|---|---|
| **Add `Config_JSON__c`** (LongTextArea) | Section presentation without dedicated fields: style preset + explicit surface values (spec §4 `surface`) and repeat presentation (style / add-remove labels / entry label template). The repeat *binding* stays in the existing dedicated fields above |

### `Form_Response_Answer__c` — two additions
| Change | Why |
|---|---|
| **Add `Label_Snapshot__c`** (Text 255) | Question text at submit time (spec §8) — analytics stay honest after questions are reworded |
| **Add `Entry_Index__c`** (Number) | Which repeat entry a survey answer belongs to (spec §4.1/§8) — without it, two entries' answers to the same question are indistinguishable. Null for non-repeated answers |

## 3 · Added (the two genuinely new objects)

### `Theme_Definition__c` — custom themes (ARCH §4.2: user-created can't hide)
| Field | Type | Notes |
|---|---|---|
| `Name` | standard | Theme name shown in `themeGallery` |
| `Properties_JSON__c` | LongTextArea | Exact ARCH §4.1 property shape — same pipeline as built-ins |
| `Base_Theme__c` | Text | Built-in key it was forked from ("Start From") |
| `Tags__c` | Text | Gallery filter chips |
| `Is_Active__c` | Checkbox | Soft delete — forms may still reference it |

Sharing: org-wide **ReadWrite for internal** (themes are meant to be shared across builders).
**Guests: zero access** — published forms carry resolved tokens in the snapshot, so the runtime
never reads this object.
**Deletion posture (v1):** `Is_Active__c` soft-delete is the sanctioned removal path; published
forms are immune regardless (snapshot). Hard-delete blocking when a draft's
`Design_Config_JSON__c` references the theme = v2 hardening ([DEFERRED.md](./DEFERRED.md) #3).

### `Form_Draft__c` — save & resume — **DEFERRED to v2: do NOT create in v1** ([DEFERRED.md](./DEFERRED.md) #2)
| Field | Type | Notes |
|---|---|---|
| `Form_Version__c` | Lookup | The published version being answered |
| `Resume_Token_Hash__c` | Text(64), **unique External Id** | **SHA-256 of the token — the raw token is NEVER stored** (a DB/report leak must not leak resume URLs). Apex hashes the presented token and does an indexed equality query |
| `Payload_JSON__c` | LongTextArea | Spec §8 draft payload (id-keyed answers) |
| `Respondent_Email__c` | Email | Only if collected in-form (RUNTIME_NOTES email rules) |
| `Expires_On__c` | Date | Purge date — scheduled cleanup is MANDATORY (PII) |
| `Last_Saved__c` | DateTime | |

Access: **guest profile gets zero object CRUD.** Create/read exclusively through the guarded
`without sharing` Apex path, token-gated to exactly one row (RUNTIME_NOTES).

## 4 · Retired

| Object | Disposition |
|---|---|
| `Z_Form__c` / `Z_Form_Version__c` / `Z_Form_Submission__c` | Legacy z-prefix — delete at cutover (never referenced by the rebuild; [[feedback-no-z-components]]) |
| `Spec_History__c` | Old builder history persistence. The rebuild's `historyManager` is an **in-memory, Build-mode stack** (catalog §5) — evaluate for delete at cutover; nothing new writes it |

## 5 · Migration & cutover posture

- **Parallel build, no in-place migration.** New components read/write the new fields; deprecated
  fields stop being written but aren't dropped until the legacy builder/player are deleted.
- Existing published forms keep rendering through legacy until their form is re-published through
  the new pipeline (re-publish = compile to `Spec_JSON__c`).
- Field/object deletes happen in ONE cleanup pass at the end (BUILD_PHASES final phase), never
  mid-build.

## 6 · Access-control summary (per the Salesforce skill: 2GP/AppExchange posture)

| Actor | Path |
|---|---|
| Builder (internal) | CRUD on structure + config objects via `USER_MODE` Apex — FLS/sharing enforced |
| Internal respondent | Read published `Spec_JSON__c`; submit via `USER_MODE` where possible |
| Guest respondent | **Zero direct object access.** Named `without sharing` Apex: fetch spec by published version, submit, draft-by-token, file insert — each with RUNTIME_NOTES guardrails |
