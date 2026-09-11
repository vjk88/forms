# Pending Work — everything between here and ship

**Compiled:** 2026-09-03 · **Last commit at time of writing:** `47fc433` (2026-08-16, PR #218)
**Last updated:** 2026-09-09, current through **PR #254**. Since #245: forms on record pages
(#246–#248, #250), explicit record context replacing `saveMode` (#252 — **breaking**), per-field
submit errors restored for forms (#253) and surveys (#254), plus two written-but-unbuilt plans
(#251). All org-verified in a browser — see §8, including four separate defects a fully green
suite did not see.
**Ship definition:** a managed 2GP AppExchange package **with Surveys** ([[project-ship-definition]]).
Companions: [BUILD_PHASES.md](./BUILD_PHASES.md) (what's in scope) · [DEFERRED.md](./DEFERRED.md)
(consciously parked) · [PRODUCT.md](../../PRODUCT.md) (the promises).

> **How this was compiled — and how to keep it honest.** Every claim below was checked
> against code, the org, or git history on 2026-09-03, not read off a ledger row. That
> matters because this document's immediate predecessor was a status header that had been
> wrong for six weeks: [FINALFORMVIEWER_EXPERIENCE_CLOUD_BLANK_PAGE.md](./FINALFORMVIEWER_EXPERIENCE_CLOUD_BLANK_PAGE.md)
> said "fix NOT yet implemented" while the fix had shipped the same day the doc was written
> (it was untracked, so nothing forced it to keep up). **A status line is a claim. Re-verify
> before acting on anything here, and if you close an item, edit this file in the same PR.**

---

## 1 · Snapshot — what each phase is still missing

Phases are [BUILD_PHASES.md](./BUILD_PHASES.md)'s. "Missing" here means **verified absent on
2026-09-05**, not "unmentioned in a doc" — each row was checked against the components, objects and
org rather than against a status header.

| Phase                            | State           | Exactly what is missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** Walking skeleton          | **Done**        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **P1** All seven layouts         | **Done**        | — all seven nav primitives ship                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **P2** Full theme system         | **Done**        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **P3** The builder               | **Done**        | Nothing functional. _Naming note:_ `pageManager` and `bindingPicker` were never built as standalone components — page chips live in `finalBuilderCanvas`, binding lives in `finalPropertyPanel`. **Absorbed, not skipped.** The F8 checklist is closed: `pageValidity` is read by all seven navs.                                                                                                                                                                                                                                                                                     |
| **P4** Element widgets           | **Partial**     | `formSignature`, `formVideo` — **never built**. `formLookup` is **no longer "never built"** (2026-09-07): a single-target reference field renders a real `lightning-record-picker` and can drive Autofill; polymorphic references and DEPENDENT/filtered lookups are still absent — see §3.2. `fileUpload` is **internal only** (Slice 1); guest is Slice 2. `formRepeater` renders **stacked-only** (and is BLOCKED on edit forms). **NEW 2026-09-09:** a form can now sit on a **record page**, load that record's values and save back to it (#247/#248/#250/#252) — org-verified. |
| **P5** Guest runtime & hardening | **Partial**     | **Rate limiting** (#20) · **guest file upload** (design now written — see §3.1) · the **F13 asset-URL decision** (below). ~~classic-form prefill~~ **partly CLOSED**: a classic form's personalized-link Autofill context now resolves for guests (`FinalGuestLinkTest.classicFormPersonalizedLinkAutofillContext`, passing 2026-09-09). Already built: the guest controller family, honeypot, availability windows, `finalAfterSubmit`, and the answer store with `Label_Snapshot__c` + `Entry_Index__c`. **The security-review gate has never been attempted.**                     |
| **P6** Creation & templates      | **Partial**     | The **form template gallery** is a placeholder; `Form_Template__c` exists but holds **1 record**, so seeding is effectively undone. **Theme-coherence prune** not done. Already built: creation gallery, Form/Survey fork, and working survey templates (CSAT/NPS/Event).                                                                                                                                                                                                                                                                                                             |
| **P7** Cutover & deletion        | **Not started** | All of it: re-publish surviving forms, flip app/Experience consumers, delete 63 legacy LWCs + ~25 legacy Apex classes, drop deprecated fields and retired objects, docs sweep.                                                                                                                                                                                                                                                                                                                                                                                                        |

**Surfaced 2026-09-05 — P5 F13, asset URLs, no decision on record.** Built-in theme images snapshot
`/resource/formThemeAssets/…` paths into published `resolved.tokens`, but Experience Cloud serves
static resources under a **site base path**, and `FinalGuestController` does no URL rewriting
(verified). A published form using a built-in theme image can therefore show **broken images to
guests**. BUILD_PHASES §P5 and [CODE_REVIEW_FINDINGS.md](./CODE_REVIEW_FINDINGS.md) §191 both say
"decide at P2/P5"; neither records a decision. Either rewrite per-audience at publish, or serve
theme assets from a guest-safe channel. Cheap to decide, annoying to discover in Security Review.

**Codebase shape today:** 53 `final*` LWCs and ~45 `Final*` Apex classes are live. Beside them
sit **63 legacy LWCs** (`formPlayer`, every `shell*`, all `z*`) and **~25 legacy Apex classes**,
all still untouched per the parallel-build rule — P7 exists to delete them.

---

## 2 · Ship blockers — gated on packaging, not on today

**Read the gating before you read the list.** None of these are live defects in the running app.
Every one of them blocks the **package** — and Security Review sits behind packaging, which hasn't
started. So "blocker" here means _this cannot ship for review in its current state_, not _this is
on fire_. Sequence them against the packaging track (§7), not against the calendar.

### 2.1 No server-side answer validation (DEFERRED #24)

Required / pattern / range checks run **client-only** for both forms and surveys. A crafted POST
skips them. Verified 2026-09-03: `FinalSubmitService.cls` contains no required/pattern/range walk.

**What the server already enforces — the important half is covered.** The **published spec is the
allow-list**: the field walk only ever maps fields the spec binds, so a submitter can never name an
object or a field that isn't already in the form. Availability windows, survey response caps, and
the honeypot are all enforced server-side, and `FinalSpecDescribeValidator` checks object/field
existence plus CRUD and FLS. Nobody reaches your other objects through this endpoint. The
allow-list architecture did the heavy lifting.

**So this is a data-integrity gap, not a security hole.** Two things actually bite:

1. **"Required" is a promise a caller can decline.** A field marked required in the builder but
   _optional in the schema_ lands as null on a hand-crafted POST. The database only catches fields
   that are genuinely required at the schema level or Master-Detail — in a form builder, the
   minority. Downstream Flows, reports, and automation written on the assumption "the form requires
   it, so it's always populated" then meet nulls they never handled. For surveys, required
   questions come back unanswered and the analysis silently assumes that can't happen.
2. **Pattern and range checks have no schema equivalent at all.** "Email matches this shape",
   "rating 1–5", "age 18–65" live _only_ in the form spec. Nothing downstream enforces them unless
   the admin hand-writes a Salesforce validation rule — which defeats the point of the form builder.

**Why it's on this list anyway:** client-side-only enforcement is a known AppExchange Security
Review checklist item that reviewers test with crafted payloads. It's not a judgement about
exploitability in this app; it's a pattern they fail packages for.

**Scope when it comes up:** one shared walk over the spec's §7 rules, reused by both submit paths.
Realistic minimum is `required` plus type/range coercion; patterns and cross-field rules can follow.

#### Evaluate first: can the platform enforce any of this for us? (UI API angle)

**Parked for the build, not decided.** Raised by the owner 2026-09-03 — _look at this when §2.1
comes up_, don't pre-build against it.

**Where it came from.** Standard Lightning record pages enforce required fields **server-side**
because their saves go through the **UI API** (a Salesforce-hosted REST API — the enforcement runs
on their servers, not in the browser). The red asterisk in the DOM is a _mirror_ of a rule the
server re-checks on its own. Our spec's `required` is the **only** copy of its rule, which is the
entire difference. Salesforce has the same gap one tier down: **page-layout required is not
enforced by raw Apex DML either** — mark a field required on a layout, insert it from Apex, and it
sails through. We are structurally in that tier.

**What already holds today** (verified 2026-09-03): our submit does real Apex DML —
`Database.insert(records, true, AccessLevel.SYSTEM_MODE)` for guests, `insert as user` internally —
so **schema-level required fields, validation rules, triggers, and flows all still fire**. The
unenforced layer is only the one we invented: spec-level `required`, `pattern`, `min`/`max`.

**Tensions to check before betting on UI API** (recorded so the evaluation starts informed, not so
it starts biased):

- UI API is a REST/wire API for LWC; it is **not callable from Apex**, and our submit is Apex.
- Guest-user support for UI API is limited — and guest is our primary published surface.
- Submit is an **atomic parent + repeat-children DML inside a savepoint**; that transaction shape
  is awkward to express through record-at-a-time UI API calls.
- Most decisively: our `required`/`pattern`/`min`/`max` live in `Spec_JSON__c`, **not** in layout
  metadata — so there is nothing for the platform to enforce _from_. UI API can only enforce rules
  Salesforce already knows about.

**The escape hatch that exists right now, regardless:** for any field that genuinely must never be
null, an admin can mark it **required at the schema level** or write a **validation rule** — then
it is enforced through every channel (UI, Apex, REST, Bulk) no matter what our code does. Arguably
the correct home for a hard business rule anyway: the builder's `required` means _"prompt the user
for this"_, while the schema means _"this may not be null"_.

### 2.2 No rate limiting (DEFERRED #20)

Honeypot, availability windows (`closed`/`opensAt`/`closesAt`), and survey response caps are all
enforced server-side. The **rate-limit and time-trap** layers were never built — verified by grep
across all Apex: zero throttle logic. Also still open: response caps for **classic forms**, whose
submissions are arbitrary business records the platform can't count generically.

### 2.3 Packaging has zero groundwork

`sfdx-project.json` has `"namespace": ""` and no package config of any kind. Per the ship
definition this is the longest pole in the project, ending with Security Review. Nothing about it
gets cheaper by waiting, and the namespace decision constrains everything downstream.

### 2.4 P7 cutover never started

63 legacy LWCs + ~25 legacy Apex classes ship in the package unless deleted. The `final*` prefix
was chosen precisely to make this a search-and-destroy pass. Includes dropping deprecated fields
and retired objects (DATA_MODEL_DELTA §4).

---

## 3 · Unfinished features

### 3.1 File upload — **Slice 1 BUILT 2026-09-03** (internal); guest still open

**Design added 2026-09-08:** [Guest uploads and larger attachments implementation plan](./IMPL_PLAN_GUEST_FILE_UPLOAD.md)
covers staged native transport, larger-file limits, guest admission, final submission, cleanup,
and platform verification. **2026-09-09:** the owner authorized implementation without deployment;
the isolated [batch-1 transport proof](./GUEST_UPLOAD_PROOF_HANDOFF.md) is prepared locally.
The native org gate is still pending. Production Slice 2 remains unimplemented.

The stub is gone. Internal file upload works end to end: drop zone + keyboard-reachable picker,
answers on the normal `valuechange` channel, and an atomic `ContentVersion` insert via
`FirstPublishLocationId` inside the submit savepoint, with a server-side allow-list, size caps and
extension checks. Plan and full detail: [IMPL_PLAN_FILE_UPLOAD.md](./IMPL_PLAN_FILE_UPLOAD.md).

Two things came out of it that are still live:

- **Guest upload is NOT built** (Slice 2). A guest submit carrying `files` is rejected outright,
  deliberately, so the boundary is observable. It needs the mandatory guardrail set — count caps,
  abuse limits (which is where §2.2's rate limiting actually bites), and a cleanup story — and an
  explicit owner "go".
- **The size cap is ~880 KB per submission, measured** — not the ~4.3 MB everyone remembered. The
  submit path holds the base64 three times over against a 6 MB heap. That accepts documents and
  web-sized images but **not** a typical phone photo. Raising it means leaving the synchronous path
  entirely (chunked pre-submit upload or an async finaliser), which is a design, not a constant.
  See IMPL_PLAN_FILE_UPLOAD §4.4 for the measured table.

**ORG-VERIFIED 2026-09-06.** The renderer was driven in a real browser on a real respondent render
(guest site, production LWS — not jsdom): the drop zone renders, a file attaches, the row shows
`qa-proof.txt · 27 B` (correct for a 27-byte file, so the size maths holds outside tests), and the
hint reads **"Any file type · up to 879 KB"** — the measured cap surfacing honestly to respondents.
Submitting as a guest returned **"This form cannot accept file uploads."** — the Slice-1 boundary
firing server-side, previously only asserted in Apex tests — and the savepoint held: **0 Contacts
and 0 ContentVersions** were created by the rejected submit. QA form: `a05hk000001KptpAAC`.

> **Gotcha that nearly produced a false result — worth knowing before any guest QA.**
> The first guest run showed the OLD stub, _"File upload arrives with a later step"_, while the
> internal Studio showed the new control. Same org, same deployed component. **An Experience Cloud
> site serves its own published bundle: deploying an LWC does not update the site until the site is
> republished** (`sf community publish --name TestSite`). Anyone verifying guest behaviour against a
> site that has not been republished since the deploy will draw confident, wrong conclusions — the
> first reading here was "file upload is broken for guests", and it was simply stale.

**Also fixed in passing:** schema §4.1's "the builder blocks the drop" for file elements in
repeatable sections was never implemented — `file` is a palette _block_, and the canvas waved blocks
through. It is enforced now, in the builder and again server-side.

### 3.2 Widgets never built

Confirmed against the renderer's supported types (`field, text, image, divider, spacer, file,
scale, nps, rating, yesNo, imageChoice, likert, ranking, matrix`):

- **`formSignature`** — not built (reuses the file path, so it follows §3.1).
- **`formVideo`** — not built (iframe embeds; needs CSP degradation).
- **`formLookup`** — **Phase D v1 is BUILT and org-verified (2026-09-11).** Core half shipped
  2026-09-07; the dependent half shipped in four slices, PRs #264-#267, against
  [Reusable lookup and dependent filters](./IMPL_PLAN_DEPENDENT_LOOKUP.md). Part of the
  guest/prefill/lookup program ([GUEST_PREFILL_LOOKUP_SPEC.md](./GUEST_PREFILL_LOOKUP_SPEC.md)).
  - **What an author can now do:** open a reference field's **Lookup results** section in the
    Studio and say what each result shows, what searching matches on, and which conditions narrow
    the list, in sentences rather than JSON. Publish refuses a filter it cannot recompile.
  - **What a respondent now sees:** a dependent lookup is blocked until its parent is answered
    (_"Choose Account first."_), narrows to the parent once given, and is **cleared** when the
    parent changes. Org-verified end to end: Edge Communications offered only Sean Forbes, United
    Oil only Stella Pavlova, and the child cleared on the switch.
  - **What the server does:** `FinalLookupPolicy` recompiles the filter from the authoritative spec
    at submit and re-checks every selected id for object, readability and membership in USER_MODE,
    before the savepoint opens. A missing controlling answer DISABLES a lookup rather than widening
    it. Guests get a flat refusal with no field named.
  - **Shape and limits:** `element.lookupConfig` v1, [FORM_SPEC_SCHEMA §4.2](./FORM_SPEC_SCHEMA.md)
    — up to 10 direct-field conditions, all/any, no traversal or formulas. Dates, multi-select
    picklists, long/rich/encrypted text and list operators are deferred.
  - **STILL NOT built:** the **Screen Flow adapter** (slice 5, `finalLookupFlow`) — owner deferred
    it, so the lookup is not yet reusable outside Forms. **Polymorphic** references remain out
    (`lightning-record-picker` targets one object). Lookup Autofill for **guests** stays refused by
    design (`FinalAutofillValidator` rejects a `guestAllowed` lookup mapping).
  - **OPEN GATE:** logged-in **Experience Cloud** is unverified — the org has no community user, so
    the host spike could not be run there. Licences are available; this is a fixture problem, not a
    platform limit. **Do not release authorable filters to an Experience Cloud audience until it is
    run.** Anonymous guests are unaffected (lookup is refused for them outright). Evidence and the
    throwaway spike rig: [DEPENDENT_LOOKUP_SPIKE_EVIDENCE.md](./DEPENDENT_LOOKUP_SPIKE_EVIDENCE.md).
  - **Org landmine found while building this:** the org has **phantom fields** that the Apex
    compiler accepts but that do not exist at runtime — describe omits them and SOQL refuses them.
    `Job_Application__c.Related_Contact__c` (field file untracked in the repo, never deployed) and
    the standard `Contact.HasOptedOutOfEmail` both behave this way. A class referencing one deploys
    clean and fails only when the query runs. **Check runtime describe, not the compiler and not the
    repo, before writing a fixture.**

### 3.3 Half-built

- **Repeater (DEFERRED #19)** — every repeat style renders **stacked**; table and tile-modal fall
  back. Per-entry validation gating and inline per-entry failures are deferred; entries validate at
  the database on submit. Repeat answers ride one consolidated `repeat:{sectionId}` answer, so
  repeat elements cannot drive visibility rules.
- **Prefill Phases B + C** — surveys have record-aware prefill via SO-4 tokens, but **classic forms
  have no prefill at all**.
  **Design added 2026-09-07:** [Autofill rules implementation plan](./IMPL_PLAN_AUTOFILL_RULES.md)
  specifies personalized-link and authenticated lookup-driven Autofill, including a basic
  lookup selector, authoring, runtime behavior, permissions, and tests. Design only; this
  does not close the implementation or verification work above.

### 3.4 Creation & templates (P6)

- **"Start from a template" (DEFERRED #15)** — still a placeholder. Verified at
  [finalCreationGallery.html:139](../../force-app/main/default/lwc/finalCreationGallery/finalCreationGallery.html#L139):
  _"coming next — for now, start from a layout"_. Note the nuance: **survey** templates (CSAT / NPS /
  Event) do exist and work; it is the **form** template gallery that is unbuilt. Owner call:
  _"we will talk about Start from a template later."_
- **Theme-coherence prune pass** — the gallery's theme/skin roster still needs the coherence pass
  ([[project-gallery-themes-coherence]]); some entries don't make sense together.

---

## 4 · Polish backlogs

**#25 and #27 overlap heavily on the matrix widget and should be worked as one pass.**

**The 2026-09-05 Studio UX review adds a second, larger polish backlog — see §9.** Two of its
findings outrank items here: builder-canvas keyboard operability (now built; see §9.3)
belongs above the matrix ring in §4.1, and its Studio contrast fix is the same
refactor as §4.3's chrome-accent unification.

### 4.1 Accessibility — the sharpest items

PRODUCT.md commits to **WCAG 2.1 AA** on the guest-facing runtime, so these are promise-breaking,
not cosmetic:

- **Matrix dot ring fails WCAG 1.4.11** — measured 1.79:1 light / 2.39:1 dark against a 3:1
  requirement. Fix: a `--c-control-ring` token via `color-mix` toward `--c-text`, or a 2px ring.
- **Matrix roving tabindex still missing** — a 3×4 matrix presents 12 tab stops. Verified
  2026-09-03: `tabindex={item.tabIndex}` exists only on the **scale** family (`handleScaleKey`);
  matrix has none. `handleScaleKey` is the pattern to borrow. Recurring issue #11.
- Unselected-star and classic-NPS-passive contrast; `aria-required` on custom groups; NPS
  end-label semantics.

### 4.2 Interaction / UX (#25, #27)

Ranking needs 44px targets, touch drag, a drop indicator, and `aria-live` announcements; rating
needs hover-preview fill; matrix needs a sticky header and a clearer dot affordance; unify the
single-vs-multi selected grammar across chips/cards/tiles; fix bold-on-select reflow; likert narrow
stacking + SVG emoji faces; image-choice per-option upload with alt text (a publish gate).

Two vocabulary/consistency items: the primary action jumps left→right between screens 1 and 2 in
split arrangements (pin Next right when Back is absent), and **tabs say "Page N" while steppers say
"Step N"** for the same virtual pages — pick one.

Also `settings.onePerScreen` goes silently inert on scroll layouts; a one-line Layout-area hint
closes it.

### 4.3 Studio fast-follows (#18)

- Suppress the theme gallery's PREVIEW-IN row in picker mode (needs an `@api` flag on
  `finalThemeGallery`) — it contradicts "uses your current layout" now that Layout has its own picker.
- **Unify the chrome accent** — gallery/layout selection is indigo `#6366f1`, studio chrome is teal
  `#0d9488`. Wants a small shared chrome-token scale (**not** `--c-*`, reserved for themed surfaces).
- `finalGalleryPicker` focus trap + initial focus on heading + restore to trigger on close.
- **"Paginated / Nav-driven" is jargon → "Stepped / Guided".** Still present, verified at
  [finalGalleryPicker.js:31](../../force-app/main/default/lwc/finalGalleryPicker/finalGalleryPicker.js#L31).

### 4.4 Survey starter report + dashboard (#26)

The report **type** and `Survey Analytics` folder **are deployed and live**. Only the starter
Score-by-Topic report and dashboard XML are missing, after an 8-round fight with the metadata API
(columns validate but `groupingsDown` on the same keys throws; deploys are atomic; `CreatedDate`
isn't exposed). **The escape hatch is known:** click-build the chart in the org once (~60 seconds),
`sf project retrieve -m Report:Survey_Analytics/...`, and copy the exemplar XML.

---

## 5 · Decisions waiting on the owner

None of these are blocked on engineering — they're blocked on a ruling.

| #   | Item                        | What's needed                                                                                                                      |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 21  | **Split Hero progress bar** | Owner: _"we need to talk about"_ it. Placement, sizing, how it sits against the pane's brand blocks. Still untalked.               |
| 16  | **OneAtATime header CSS**   | Padding + progress-indicator treatment judged not acceptable; tabled 2026-07-06. Companion to the parked stepper 3-state reskin.   |
| 22  | **Progress-bar groove**     | Kept with _"I will remove it the moment I don't like it."_ Removal recipe is pre-written: flip 4 track backgrounds to transparent. |
| 15  | **Form template gallery**   | _"We will talk about it later."_ Needs the template data model ported to the FinalDesign spec shape.                               |
| 28  | **Guest writeback**         | Tabled — customer-side Flow triggers on `Form_Response__c` cover the need. Revisit only if customers reject the Flow path.         |

---

## 6 · Housekeeping

The working tree carries **8 modified and ~30 untracked files**, all stale leftovers rather than
work in progress. Worth a deliberate pass:

- `SetupAuditTrail1783267934505.csv` — a 448 KB org audit dump sitting in the repo root.
- Five generated test objects + a new app and tab, untracked (`scripts/generate_test_objects.js`).
- **Two legacy files have drifted** against the parallel-build rule: `formViewer.js-meta.xml` gained
  a `lightning__Tab` target, and `FormPageTrigger.trigger` lost its trailing newline. Academic,
  since P7 deletes both — but it's drift.

---

## 7 · Recommended order

Ordered by what the product is missing **today**, with the packaging-gated items sequenced against
the packaging track instead of ahead of it.

0. **Two loose ends from this week, both small** — (a) verify the `{!recordId}` sentinel on a **real
   record page**; only the refusal case has been exercised, and it is the primary use case of
   #252. (b) Make the **F13 asset-URL decision** below — it is a decision, not a build, and
   published forms with a built-in theme image may be showing guests broken images today.
1. ~~**File upload (§3.1)**~~ — **Slice 1 DONE 2026-09-03** (internal). Slice 2 (guest) now has a
   written design ([IMPL_PLAN_GUEST_FILE_UPLOAD.md](./IMPL_PLAN_GUEST_FILE_UPLOAD.md)); implementation
   authorized 2026-09-09, with the isolated transport-proof batch prepared locally and org proof pending.
2. **Accessibility pass (§4.1)** — small, bounded, and currently contradicts a stated product promise.
3. **Open the packaging track (§2.3 + §2.4)** — namespace, 2GP, legacy purge. Longest pole, and the
   namespace decision constrains everything downstream, so start it before it's urgent.
4. **Server-side validation (§2.1)** — pull forward the moment the packaging track starts moving;
   it must land before the package goes for review.

**Why validation isn't first** (owner call, 2026-09-03): it's frequently mistaken for a live
security hole, and it isn't — see §2.1 for what the allow-list already enforces. Its real trigger
is Security Review, which is gated behind packaging that hasn't started. Sequenced on timing rather
than on how alarming the title sounds. It stays a hard gate on shipping, just not a standing risk.

Rate limiting (§2.2) can ride the broader guest-hardening pass.

### 7.1 Two gates, not one — "blocks nothing" was measured against the wrong bar

Until 2026-09-06 this document had a single axis: **does it block cutting the package.** Everything
else inherited "blocks nothing" by default. That is accurate against the packaging gate and
misleading against the one a buyer actually applies, so §9 items kept reading as optional polish
while describing an authoring surface you cannot drive from a keyboard, a publish failure that
names the wrong operation, and a preview that forgets the inputs you are testing with.

Two gates from here:

| Gate                | Meaning                                   | Contents                    |
| ------------------- | ----------------------------------------- | --------------------------- |
| **Packaging-ready** | Can be submitted for Security Review      | §2                          |
| **Customer-ready**  | A release a paying admin would not resent | §2 **plus** the items below |

**Customer-ready acceptance criteria** — none of these block a package; all of them block a release
worth charging for:

1. **Every primary authoring action is reachable without a mouse** — select, reorder, delete, move
   between sections/pages (§9.3). **Reorder + select + delete: DONE, org-verified 2026-09-06.**
   **Move BETWEEN sections/pages by keyboard: knowingly NOT met** — the owner rejected both the
   action bar and the context menu that carried it, so cross-container moves are drag-only. Alt+↑/↓
   covers reordering among siblings. See [BUILDER_KEYBOARD_SPEC.md](./BUILDER_KEYBOARD_SPEC.md).
2. **No failure message names the wrong operation, and none is invisible at any width** — a failed
   publish must not say "Save failed", and the status must survive below 1100px with a real Retry
   (§9.1, §9.2). **DONE — org-verified 2026-09-06**, failure path induced and recovered (see §9.2).
3. **Testing a rule does not require re-entering its inputs** — preview state survives an ordinary
   edit and a mode switch (§9.4). **DONE — org-verified 2026-09-06** (see §9.4).
4. **No shipped surface advertises unbuilt functionality** — **half met.** The Autofill "later
   slice" line is **gone** (2026-09-07, §9.1); the **template shelf placeholder remains** (§3.4).
5. **Studio chrome meets 4.5:1 for small text** (§9.5) — not because a written promise covers it
   today, but because shipping a form builder whose own buttons fail the bar its theme editor
   enforces on customers is indefensible.

The **F13 asset-URL decision (§1)** is a decision, not a build, and should be made before anything
guest-facing ships with a built-in theme image.

---

## 8 · Recently CLOSED — do not re-open

- **Forms on record pages, and submit errors that name the field (2026-09-08/09, PRs #246–#254).**
  A form can now sit on a record page, load that record's values and save back to it, and a
  rejected save lands on the question that caused it instead of one generic sentence.
  - **Record context is EXPLICIT and this was BREAKING (#252).** The viewer no longer declares a
    public `recordId` or silently consumes the page record. Two configured inputs —
    `existingRecordId` (blank = create, an id = edit, `recordId`/`{!recordId}` = the page's record,
    anything unresolvable = **blocked, never a silent create**) and `surveyContextRecordId`.
    `saveMode` no longer selects the runtime operation; `c__recordId` is no longer consumed.
    **Any placement relying on the old automatic behaviour now CREATES instead of editing, and
    surveys lose context until configured.**
  - **Per-field submit errors, restored from the old build (#253 forms, #254 surveys).** Guests
    deliberately get none of the detail — a public form must not become a probe for an org's
    validation rules.
  - **NOT verified:** the `{!recordId}` sentinel resolving on a real `standard__recordPage`. The QA
    host is an App Page, so only the refusal case was exercised.

- **THE PATTERN WORTH READING BEFORE YOU TRUST A GREEN RUN (2026-09-07/11).** Five separate defects
  shipped or nearly shipped with the whole suite green. None were caught by tests; every one was
  caught by opening a browser.
  1. **A guest defect hid behind 787 passing tests** — the guest-projected spec shape had zero
     coverage, so personalized links filled **nothing** (#244).
  2. **A false-passing Apex test** asserted on a field the org does not have (#243). `FieldDefinition`
     lists `Job_Application__c.Related_Contact__c`; **SOQL says it does not exist. SOQL is the truth.**
  3. **`DmlException.getDmlFieldNames` answers differently by context** — `"LastName"` in an Apex
     test, `"Last Name"` (the LABEL) in a live LWC request. The first cut of #253 mapped by API name
     only: Apex green, 841 Jest green, and the real submit routed nothing to any field.
  4. **A survey with a connected record could not be submitted at all** — `_surveyLoading` was
     cleared only by the `.catch()`, never the success path, so the failure path recovered and the
     happy path did not (#254, shipped in #252 the day before, 843 tests green over it).

  5. **A dependent lookup kept its stale record, with 942 tests green (2026-09-11, #267).** The
     adapter was correctly refusing a selection stamped with a retired filter generation; the
     remount that gives the respondent a live control to select in again had not been built. Every
     viewer test dispatched `valuechange` from the ADAPTER, which skips that guard entirely, so no
     test in the suite could ever have reached the bug. **A test that enters below the component
     it is meant to protect proves nothing about it.**

  **Working rule: for anything touching a real Salesforce surface, a green suite is necessary and
  never sufficient.** Test the projection, not just the authored spec; enter the chain where a
  respondent enters it, not below the guard you are testing; and remember a metadata deploy does
  not reach guests without an Experience site publish.

  **And a schema landmine the org keeps re-arming:** it carries **phantom fields** the Apex compiler
  accepts but that do not exist at runtime. `Job_Application__c.Related_Contact__c` (item 2 above)
  and the standard `Contact.HasOptedOutOfEmail` both compile, both deploy, and both fail only when
  a query runs. Check runtime describe before writing a fixture — not the compiler, not
  `FieldDefinition`, and not the repo.

- **Autofill Rules — BOTH halves built and browser-verified (2026-09-07, PRs #241–#245).** The
  program is real, not just green: **(a) authenticated lookup** — a single-target reference field
  renders a `lightning-record-picker`, picking a record fills the mapped destinations, and clearing
  it clears what Autofill owned while preserving anything the respondent typed (org-verified in the
  Studio: Title cleared, a hand-typed Phone survived); **(b) personalized guest link** — verified as
  a genuinely anonymous visitor on the live site, with the negative controls holding (a mapping left
  `guestAllowed:false` did not fill, its value appeared nowhere in the page, and no source field API
  names reached the client).
  **Two traps this run left behind, both worth respecting:**
  1. **A guest defect can hide behind a fully green suite.** Every autofill test fed the
     _authenticated_ spec shape; the _guest-projected_ shape (`runtime.autofill`, destination ids
     only, no `from`) had zero coverage, so a bug that made personalized links fill **nothing**
     passed 787 tests. Fixed in #244 with a two-destination regression test. **When a feature has a
     guest projection, test the projection, not just the authored spec.**
  2. **`sf project deploy` does not reach guests.** The LWR site serves a pre-compiled bundle
     (`webruntime/view/<hash>/prod/…`); an LWC change is invisible on the guest site until the
     Experience site is **republished**. A deploy that "did nothing" is almost always this.
     Removed in #245: `FinalAutofillController.resolveLinkForUser`, an `@AuraEnabled` endpoint no LWC
     ever called — with its accepted consequence recorded as **DEFERRED #30**.
- **Experience Cloud blank page on tab-away/tab-back** — **RESOLVED.** Option B shipped in
  `8322481` (2026-07-19); live-verified on the guest site 2026-09-03 (same instance reconnected, no
  blank page, zero bug-signature errors, typed answer survived) and recorded in PR #219. The doc
  had claimed otherwise for six weeks because it was untracked. Residual: the verification survey
  was single-screen, so _page-position_ survival across a reconnect is only lightly covered —
  publish a multi-page survey with the public link ON to close that.
- **Guest access for `finalFormViewer`** — built and shipped in Phase A (`FinalGuestController` +
  `c/finalGuestHost`). Any doc still saying guest access is unbuilt, or recommending the legacy
  `c/formViewer` for guest testing, is stale.

---

## 9 · Studio UX review (2026-09-05) — findings not covered above

Source: [FINALFORMSTUDIO_UX_REVIEW_2026-09-05.md](./FINALFORMSTUDIO_UX_REVIEW_2026-09-05.md).
**11 of its specific `file:line` and contrast claims were independently verified; all 11 held**,
including both contrast ratios recomputed from the hex values (3.743:1 and 5.472:1). Treat its
findings as load-bearing.

Only §4.3's four studio fast-follows overlapped what this document already tracked, so nearly all
of it is new. Effort tiers below are grounded in what the code actually looks like, not in how the
review ranked them.

### 9.1 Trivial — an hour or less each

| Finding                                                                           | Why it's small                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLUEPRINT — structure only; the preview is the truth` → "Structure"              | One string, `finalBuilderCanvas.html:4`                                                                                                                                                                                                                                                                                                                                             |
| ~~Autofill "prefill mapping arrives with a later slice"~~ — **CLOSED 2026-09-07** | The placeholder is gone: `finalFieldPalette`'s `isStub` now returns `false` and the Autofill tab is a real authoring surface. Nothing on that tab advertises unbuilt work any more                                                                                                                                                                                                  |
| **A failed PUBLISH reported "Save failed" — FIXED 2026-09-06**                    | Publish failures now carry their own message and retry; draft-save state stays independent. Org-verified 2026-09-06: real failure induced, correct copy, Retry recovered AND persisted the edit. See §9.2.                                                                                                                                                                          |
| Duplicate Availability heading + the submission-service sentence                  | Copy deletion                                                                                                                                                                                                                                                                                                                                                                       |
| **Arrangement hint names a control that layout doesn't have** (found 2026-09-07)  | `buttonArrangement`'s hint is the static string "How Back / **Next** / Submit line up" (`finalDesignRegistry.js`), but on one-at-a-time and Split Hero · Conversational there is no Next — the control directly above it reads "Continue button label". PR #239's Next/Continue split is what made it wrong. One string; needs to vary with `ownsAdvance`, or drop the button names |
| Delete-control accessible names                                                   | Contextual `aria-label`                                                                                                                                                                                                                                                                                                                                                             |
| Copy: "answer store", "every answer becomes a field"                              | Wording only                                                                                                                                                                                                                                                                                                                                                                        |

### 9.2 Small and contained — about half a day each _(provisional)_

> **These tiers measure blast radius, not total cost.** Each was grounded in how localized the
> change is — which is why §9.5 caught a "Priority 1 styling" item that is really days of work. But
> a small diff can carry a large testing surface, and three below almost certainly do: \*\*save status
>
> - Retry** (the button is trivial; retry semantics, queued-change handling and conflict recovery
>   are not), **collapsing the rich-text toolbars** (selection preservation and focus management in a
>   rich-text control is reliably worse than it looks), and **the Logic-index scroll\*\* (landing focus
>   correctly without stealing it is the hard half). Treat these as planning categories, not commitments.
>   The §9.1 string changes genuinely are an hour.

**Save/publish recovery — built and DEPLOYED 2026-09-06.**
`finalFormStudio` keeps draft status and Retry visible at narrow widths and in the settings drawer.
Draft saves are serialized and coalesce newer edits; an older response cannot acknowledge a newer
revision. A failed request retains the current specification for retry. Publishing waits for draft
saving, temporarily prevents edits, and reports its own errors. A cleanup failure after successful
publication can retry cleanup without publishing another version. A failed save before history
navigation leaves the editable draft available. Jest regression coverage includes concurrent edits,
failure/retry, publish sequencing, cleanup recovery, and stale responses after changing forms.
This is per-instance request ordering; cross-tab/multi-user conflict detection is not added.

> **ORG-VERIFIED 2026-09-06 — closed.** Jest 70 suites / 662 tests green (11 new; baseline 28 in
> this component, now 39), ESLint clean, deployed to `revclouddev`. The failure path — the whole
> point of the change, and the one thing previously only simulated — was then induced for real by
> aborting the `saveDraft` Apex call at the network layer, in the Studio, at a **1000px** viewport:
>
> | Check                                      | Result                                                                              |
> | ------------------------------------------ | ----------------------------------------------------------------------------------- |
> | Status visible below the old 1100px cutoff | **yes** — it was previously `display:none`                                          |
> | Message                                    | "Draft couldn't be saved. Your edits are still here."                               |
> | Old misleading "Save failed" copy          | **gone**                                                                            |
> | Retry control                              | present — **"Retry save"**                                                          |
> | Clicking Retry once the outage cleared     | → "✓ All changes saved"                                                             |
> | Did the edit actually persist?             | **yes** — draft v2 written with **2 pages**, i.e. the "+ Page" edit that had failed |
>
> The last row is the one that matters: Retry sent the LATEST spec and the data genuinely landed,
> rather than the label merely flipping to green.

**Still pending:** Corners/Spacing —
**this one changed shape on 2026-09-06, read before acting.** The review asked for current-value
segmented controls _replacing_ the Rounder/Sharper + Airy/Dense nudges. PR #239 **deleted the
nudges without replacing them**, so Simple now has no radius or density control at all; both live
in Advanced (radius under _Page & form › Form appearance_, density under _Size & spacing_). The
review's complaint — nudge buttons that never showed the current value — is gone. The open question
is narrower: does Simple deserve segmented Corners/Spacing back, or is Advanced the right home?
**Owner decision, not a build task.** · Availability date/time stacked, with timezone and a plain
schedule summary · rich-text toolbars collapsed until focused — **now Advanced too, not just
Simple**: Advanced's default-open Brand & header stacks three permanent toolbars (Title,
Description, Brand name) and pushes the rest of the section below the fold (org-observed
2026-09-07) · consolidate the duplicated customization chrome (confirmed on screen 2026-09-07) ·
Advanced Palette helper text neutralised behind a "More" disclosure · library name as a link with
fewer competing row buttons · Logic-index jump scrolling to the **Visibility** section rather than
the top of the inspector.

### 9.3 Real features — days each

Library **search + sort + version-vs-lifecycle** (`finalFormsLibrary.html` has **zero** search
today) · preview **fit / 100% / expand** controls · **pane splitters** with remembered widths ·
**typed rule operators and value editors** (scoped below) · creation step reorder with progress and
focus/scroll restoration · **record picker for invitations** — but this should share **Phase D's
custom lookup**, not duplicate it.

#### Typed rule operators and value editors — BUILT AND ORG-VERIFIED 2026-09-06

Every source used to get the same operator list and a bare text input regardless of what it was.
Now the editor types both halves off the source's subtype.

**Shipped.** `finalStudio.ruleIndexMap` gained an **additive** `inputType` key — `type` stays
collapsed so it keeps matching `finalFormViewer`'s own `_ruleTypeIndex` and `lintVisibility` is
untouched (the engine's build-time/runtime agreement is the whole point of that module). The editor
reads `inputType` to pick operators and the value control.

| Source subtype                              | Operators offered                                        | Value control          |
| ------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| number                                      | equals · notEquals · **greaterThan · lessThan** · blanks | `input[type=number]`   |
| date / datetime                             | equals · notEquals · **greaterThan · lessThan** · blanks | date / datetime picker |
| checkbox                                    | equals · notEquals only                                  | **Yes/No selector**    |
| picklist, text, textarea, email, phone, url | equals · notEquals · **contains** · blanks               | `input[type=text]`     |
| file, unknown, every `record:` row          | all seven (untyped)                                      | `input[type=text]`     |

`contains` is kept everywhere a source can hold multiple values (owner ruling). The blank operators
are dropped for checkbox because a Salesforce checkbox is never null. `record:` rows stay untyped
because `lintVisibility` exempts them on purpose.

**Two safety behaviours, both org-verified**, because the same silent-divergence trap that deferred
the picklist dropdown applies to operators too:

- A saved rule holding an operator the subtype no longer offers keeps that operator **visible**,
  labelled "(not valid here)", instead of letting the select resolve to its first option and rewrite
  the rule on the next unrelated edit.
- Repointing a rule's **source** repairs both halves: an operator the new subtype drops resets to
  `equals`, and a value the new control physically cannot display is cleared. A value the new
  control _can_ display is kept.

**Verification.** Full suite 71 Jest suites / **694 tests** (9 new). In the org, the real editor was
driven across **8 subtypes** — text, textarea, email, phone, picklist, number, date, datetime — each
asserted on its exact operator list and rendered control, plus both repair paths
(`greaterThan → equals` on repoint; `"Bob"` cleared into a number input, `"42"` kept) and `isBlank`
still hiding the value control.

> **`checkbox` is jest-verified only — not org-verified.** No object in `revclouddev` exposes an
> accessible Boolean to the running user: Contact's only three (`IsDeleted`, `IsEmailBounced`,
> `IsPriorityRecord`) are non-updateable system fields, and `Job_Application__c` has none.
>
> **Corrected 2026-09-06:** an earlier version of this note blamed missing FLS on the generated test
> objects. The real reason is that **their fields were never deployed** — `Property_Inspection__c`
> describes **0 custom fields** in the org, and the field metadata exists only as untracked local
> files under `force-app/main/default/objects/`.
>
> **Owner ruling 2026-09-06 — do NOT chase this.** Those five generated objects
> (`Property_Inspection__c`, `Event_Feedback__c`, `Hardware_Request__c`, `Work_History__c`, and the
> already-in-use `Job_Application__c`) are **out of scope for this project**: not to be deployed, not
> to be committed, left untracked. So the "deploy a test object to get a Boolean field" route is
> **closed**, and this gap stays open by decision rather than by oversight. If checkbox ever needs
> org verification, it needs a Boolean field that arrives some other way.
>
> Residual risk is small — the Yes/No control is a `<select>`, the same element as the source and
> operator selects that ARE org-verified in this component — but it is **not** the same as having
> seen it render, and this note exists so nobody re-derives that in three weeks.

#### Two follow-up fixes — 2026-09-06 (owner-supplied, org-verified)

**1. An empty checkbox comparison rendered as "Yes".** A new rule starts with `value: ''`, which
matched neither `true` nor `false`, so the native select fell back to displaying its first option
while the stored rule held `''`. That is exactly the silent-divergence trap this section warns
about, shipped inside the guard against it. The bool control now leads with a **"Choose Yes or No"**
placeholder that owns the empty value, and a saved-but-invalid value is preserved visibly as
`<value> (not valid here)` — the same treatment already given to stale operators.

**2. `canDisplay` trusted `Number()` and `Date.parse()`, which are laxer than the controls.** Both
accept values a native input then blanks, so the check kept them and re-created the divergence it
existed to prevent. It now builds a detached `<input>` of the target type and asks the browser
directly. Three cases the old check got wrong:

| Value                  | Target control   | `Number()` / `Date.parse()` | Native control |
| ---------------------- | ---------------- | --------------------------- | -------------- |
| `0x2a`                 | `number`         | parses as 42 → kept         | blanks it      |
| `2026-09-06T12:30:00Z` | `date`           | parses → kept               | blanks it      |
| `2026-09-06`           | `datetime-local` | parses → kept               | blanks it      |

**Org-verified** (`revclouddev`): a direct probe confirms `document.createElement` sanitization is
**not blocked by LWS** in the Studio's realm, and all seven repoint cases behave — `0x2a`,
`2026-09-06T12:30` → date, `2026-09-06` → datetime, `2026-02-30` and `" 42 "` all cleared, while
`-2.5` and the leap day `2024-02-29` are kept. Suite: 71 suites / **717 tests**. The checkbox
placeholder itself remains jest-only for the reason above.

Original scope note, kept for context:

**In scope (~1 day + tests/verification).** Filter operators by source type, and give the value
control a type: **Yes/No selector** for checkbox, **numeric input** for number/rating, **date
picker** for date, **text input** otherwise. This needs only `inputType` — no option lists — so it
carries no data-model risk.

- **`contains` stays (owner ruling 2026-09-06).** Do not drop it when filtering operators by type:
  multipicklist and multi-select choice questions depend on it, and removing it would silently
  break saved rules.
- **`record:` sources (SO-3) stay untyped.** `lintVisibility` deliberately exempts them — _"type
  coercion is the SERVER's describe-driven job"_ — so leave them on the text input rather than
  crossing a boundary that was drawn on purpose.

**Already built, don't re-scope it:** the value input is _already_ omitted for `isBlank` /
`isNotBlank` (`finalRuleEditor.js:137` `needsValue`, with `handleRuleField` nulling the stored
value on operator switch). And `lintVisibility` already warns _"greater/less-than needs a numeric
value or a date source"_ — this work makes that check preventive instead of after-the-fact.

**Out of scope — picklist/choice dropdown is DEFERRED** (owner 2026-09-06: authors keep typing the
value as text for now). See [DEFERRED.md](./DEFERRED.md) #29 for what it would take and the
data-loss trap that makes it more than "add a dropdown".

Enabling facts for whoever picks either up, so they aren't re-derived: option lists are **already
in the spec** — `finalFormStudio.js:1481` copies describe options onto `element.config.options`
when a field is added, and survey questions carry their own in the same `{value,label}` shape. The
gap is that `ruleIndexMap` (`finalFormStudio.js:1134`) flattens every source to `type: 'field'`
except date/datetime, so the editor can't see the granular type. Widening it feeds `lintVisibility`,
whose 444-line suite needs a regression pass.

**Keyboard operability in the builder canvas — BUILT AND ORG-VERIFIED 2026-09-06.** It ranked
highest here because `finalBuilderCanvas` had **zero** keyboard handlers and zero `tabindex`, in the
template _and_ imperatively: there was no infrastructure to extend, so selection, focus management
and Move up/down/to-section were built from nothing.

**Subsequent owner-requested revisions — BOTH SHIPPED AND ORG-VERIFIED (PR #232, then #233).**
Two designs were tried and rejected in sequence, and this paragraph previously described the second
one as if it were current — it is not.

1. The permanent action bar was removed (#232): drag-and-drop stays primary.
2. The custom right-click / Shift+F10 menu that briefly replaced it was **also removed** (#233,
   owner: _"remove those right click thing from code"_). Right-click is back to the browser's own
   menu (`contextmenu.defaultPrevented === false`, org-verified).

What survives is keyboard navigation plus **Alt + ↑/↓ to reorder among siblings**. The heading is
now "Structure". A stable keyed wrapper fixes a rendering failure on mixed section/block pages.
[Current behavior, changed files and smoke test](./BUILDER_KEYBOARD_SPEC.md), which records both
rejected designs so neither is re-proposed as a fresh idea.

> **Known gap, deliberately accepted:** "Move to…" was the only keyboard route for moving an item
> **between** sections or pages. Alt+Arrow reorders siblings only, so cross-container moves are
> **drag-only**, and §7.1 criterion #1's "move between sections/pages" clause is knowingly unmet by
> keyboard. The F2 behavior in the original verification table below is superseded; that table
> records the earliest deployed build.

Pages, sections, content blocks and questions now all carry `data-nav` and are reachable by
keyboard, with a real `:focus-visible` outline. Shared `movement.js` gates destinations — and
notably re-enforces schema §4.1 there too (`element.type === 'file' && target.repeat` is refused),
so the new move path cannot route around the drop-block.

**Verified with real keystrokes in the org** — not synthetic dispatches, because keyboard handling
is precisely where LWS has burned this project before (retargeted `composedPath`, constructor
listeners that never fire, [[reference-lws-keyboard-events]]):

| Check                                   | Result                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Arrow keys move focus between questions | `el_ln` → `el_file` → back                                                                             |
| `Alt+ArrowDown` reorders                | order genuinely changed: `["Last name","File upload"]` → `["File upload","Last name"]`                 |
| Focus after a move                      | follows the moved item                                                                                 |
| Live announcement                       | "Last name moved to position 2 of 2."                                                                  |
| `F2` on a focused item                  | opens Move up / Move down / Move to…                                                                   |
| Move to… → `Escape`                     | closes, and focus returns to the Move to… button                                                       |
| Delete control names                    | contextual across every kind — "Remove page 1: One", "Remove section: Upload test", "Remove Last name" |

**Still open in this area:** drag remains the only way to move an item to an arbitrary position
_within_ a section (Move up/down step one place at a time); Move to… targets sections and pages, not
indexes.

**On what grounds it ranks high — corrected 2026-09-06.** An earlier draft of this section justified
it "against PRODUCT.md's WCAG 2.1 AA commitment." That was an overreach, and worth recording so it
is not repeated. [PRODUCT.md](../../PRODUCT.md) §Accessibility scopes that posture explicitly to
_"the published runtime (guest-facing surface)"_, and even its keyboard clause reads "keyboard path
per **nav primitive**" — the respondent's scroll/stepper/tabs, not the builder canvas. The written
promise does not reach the Studio. §4.1's framing is fine (the matrix ring is a runtime widget);
this section's was not.

The finding is not weaker for it, it is more interesting. PRODUCT.md names **"Form designers"** as a
first-class user class alongside form fillers, then extends an accessibility commitment to only one
of them. So the real state of affairs is: **the product has never made an accessibility promise
about authoring, and arrived at that by omission rather than decision.** Authors are typically
employees using this as a workplace tool, and enterprise buyers increasingly ask for conformance
covering a whole product rather than its public surface.

**That scope question is itself an owner decision** — does the WCAG posture extend to authoring?
Until it is answered, this ranks on plain merit: an entire authoring surface is unusable without a
mouse, which is a harder failure than any single widget defect in §4.1.

### 9.4 Needs a spec before it can be estimated

- **Preview session preservation — implemented locally 2026-09-06.**
  [Session contract and org smoke test](./PREVIEW_SESSION_SPEC.md) define pruning and memory ownership.
  Editable Build/Design retain answers, page identity and device; deleted questions, removed choices
  and incompatible bindings prune only affected values. Repeater rows hydrate from the session;
  changing the child object resets that repeater. Files retain existing in-memory objects without
  copying base64 into form data or undo history. Restart clears the session and retains the device.
  History previews remain separate. Guest/published viewers keep their existing behavior.
  Jest covers reconciliation, visible widget hydration, rule changes, mode/history hand-off and
  restart — 71 suites / 677 tests green (was 70/662), ESLint clean.

  **ORG-VERIFIED 2026-09-06 — closed.** Deployed, then driven in the real Studio on a form with a
  text question and a file question. This is the bug the UX review actually reported, so it is the
  one that had to be reproduced rather than simulated:

  | Step                                          | Text answer   | Attached file  |
  | --------------------------------------------- | ------------- | -------------- |
  | Entered in preview                            | `PRESERVE ME` | `preserve.txt` |
  | After **Build → Design**                      | retained      | retained       |
  | After **Design → Build** (the reported repro) | **retained**  | **retained**   |
  | After an ordinary spec edit (`+ Page`)        | **retained**  | **retained**   |
  | After **Restart preview**                     | cleared       | cleared        |

  The file row matters most: uploads shipped one day after the review was written, so preview reset
  had quietly started discarding them too. Both halves of criterion #3 — _survives an edit_ and
  _survives a mode switch_ — now hold in the org.

- **Record-context preview** ("Preview as: Test record", review §3) — must inherit the runtime's
  `USER_MODE`/FLS discipline or it becomes a second, weaker path to record data alongside SO-3/SO-4.
- **"Explain visibility"** author debugging — must never leak into the respondent form.

### 9.5 Studio color consistency and contrast

**DONE — deployed to `revclouddev` and org-verified 2026-09-06.**
The shared CSS-only `finalStudioStyles` bundle consolidates the existing partial `--c-studio-*`
recovery-dialog palette and supplies semantic authoring colors to **23 component stylesheets**.
This includes §4.3's gallery/Studio accent unification, surrounding authoring controls and the
dark Build canvas. The final scope exceeds the 12 stylesheets found by searching only `#0d9488`.

White on primary teal improves from **3.74:1 to 5.47:1**. Muted labels, control boundaries,
dark-canvas guidance and focus indicators now use explicit light/dark tokens. Clipped segmented
controls retain visible inset keyboard focus. Added field rows stay readable without fading their
entire contents. Error/warning/success meanings remain distinct.

**Respondent themes remain independent:** theme catalog/engine, runtime and legacy stylesheets,
theme-thumbnail declarations and existing color expectations in tests are unchanged. No app
JavaScript, templates, drag-and-drop or Alt+arrow behavior changed; no movement menus were added.

**Why the separation actually holds** (two independent mechanisms, both verified):

1. **Disjoint namespaces.** The bundle defines only `--c-studio-*`; the runtime reads only the
   unprefixed `--c-*`. Set intersection of the two name sets is **empty**, so the studio tokens
   inherit harmlessly through the shadow boundary and are simply never read.
2. **A hard boundary.** `finalPageFrame`'s outermost wrapper re-declares both inheritable
   properties the Studio sets on its host — `color: var(--c-text)` and
   `font-family: var(--c-font-body)` — so even those stop at the respondent tree.

No runtime component file appears in the diff, and no component in the runtime tree
(`finalFormViewer`, `finalPageFrame`, `finalElementRenderer`, `finalSectionRenderer`,
`finalThemeEngine`, `finalNav*`, `finalSubmitBar`, `finalFormHeader`, `finalLayoutZones`,
`finalAfterSubmit`) imports `finalStudioStyles`. `finalGuestHost` renders only
`c-final-form-viewer`, so the published/guest surface is untouched by construction.

Validation: **60 contrast pairs**, **24 LWC stylesheets compiled**, **full suite 71 Jest suites /
685 tests green** (an earlier draft of this section said "19 suites / 190 tests" — that was the
changed-components subset, not the suite).

**Org verification (`revclouddev`, headless Chromium):** the decisive test is a live theme switch —
`--c-accent` moved `#0f766e → #9355af` and `--c-page-bg` `#f6f4ee → #01130b` while
`--c-studio-accent` held at `#0f766e`. Respondent text, background, inputs and Submit all painted
from their `--c-*` theme tokens. Also confirmed in-org: contrast sweeps over Build, Design,
property panel, settings drawer, library and creation gallery; the dark canvas; a visible teal
focus ring; drag handles, Alt+↑/↓ reorder and the still-absent context menu (PR #233); console
clean.

> Note: the Studio accent `#0f766e` coincidentally equals theme #1's accent in
> `finalThemeCatalog.js`. That is a **coincidence, not a leak** — the catalog is not in the diff,
> and the theme-switch test above falsifies the leak reading.

[Exact changed files, contrast results and org checklist](./STUDIO_COLOR_CONSISTENCY.md).
The new `finalStudioStyles` bundle must ship with the authoring components.
