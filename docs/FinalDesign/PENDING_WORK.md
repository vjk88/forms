# Pending Work — everything between here and ship

**Compiled:** 2026-09-03 · **Last commit at time of writing:** `47fc433` (2026-08-16, PR #218)
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

| Phase                            | State           | Exactly what is missing                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** Walking skeleton          | **Done**        | —                                                                                                                                                                                                                                                                                                                                             |
| **P1** All seven layouts         | **Done**        | — all seven nav primitives ship                                                                                                                                                                                                                                                                                                               |
| **P2** Full theme system         | **Done**        | —                                                                                                                                                                                                                                                                                                                                             |
| **P3** The builder               | **Done**        | Nothing functional. _Naming note:_ `pageManager` and `bindingPicker` were never built as standalone components — page chips live in `finalBuilderCanvas`, binding lives in `finalPropertyPanel`. **Absorbed, not skipped.** The F8 checklist is closed: `pageValidity` is read by all seven navs.                                             |
| **P4** Element widgets           | **Partial**     | `formLookup` (= Phase D), `formSignature`, `formVideo` — **never built**. `fileUpload` is **internal only** (Slice 1); guest is Slice 2. `formRepeater` renders **stacked-only**.                                                                                                                                                             |
| **P5** Guest runtime & hardening | **Partial**     | **Rate limiting** (#20) · **guest file upload** · **classic-form prefill** · the **F13 asset-URL decision** (below). Already built: the guest controller family, honeypot, availability windows, `finalAfterSubmit`, and the answer store with `Label_Snapshot__c` + `Entry_Index__c`. **The security-review gate has never been attempted.** |
| **P6** Creation & templates      | **Partial**     | The **form template gallery** is a placeholder; `Form_Template__c` exists but holds **1 record**, so seeding is effectively undone. **Theme-coherence prune** not done. Already built: creation gallery, Form/Survey fork, and working survey templates (CSAT/NPS/Event).                                                                     |
| **P7** Cutover & deletion        | **Not started** | All of it: re-publish surviving forms, flip app/Experience consumers, delete 63 legacy LWCs + ~25 legacy Apex classes, drop deprecated fields and retired objects, docs sweep.                                                                                                                                                                |

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
- **`formLookup`** — not built. This is **Phase D** of the guest/prefill/lookup program
  ([GUEST_PREFILL_LOOKUP_SPEC.md](./GUEST_PREFILL_LOOKUP_SPEC.md)), v1 = Core + dependent.

### 3.3 Half-built

- **Repeater (DEFERRED #19)** — every repeat style renders **stacked**; table and tile-modal fall
  back. Per-entry validation gating and inline per-entry failures are deferred; entries validate at
  the database on submit. Repeat answers ride one consolidated `repeat:{sectionId}` answer, so
  repeat elements cannot drive visibility rules.
- **Prefill Phases B + C** — surveys have record-aware prefill via SO-4 tokens, but **classic forms
  have no prefill at all**.

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
findings outrank items here: builder-canvas keyboard operability (an authoring surface with **zero**
keyboard support) belongs above the matrix ring in §4.1, and its Studio contrast fix is the same
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

1. ~~**File upload (§3.1)**~~ — **Slice 1 DONE 2026-09-03** (internal). Slice 2 (guest) awaits a go.
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
   between sections/pages (§9.3). **DONE — org-verified 2026-09-06.**
2. **No failure message names the wrong operation, and none is invisible at any width** — a failed
   publish must not say "Save failed", and the status must survive below 1100px with a real Retry
   (§9.1, §9.2). **DONE — org-verified 2026-09-06**, failure path induced and recovered (see §9.2).
3. **Testing a rule does not require re-entering its inputs** — preview state survives an ordinary
   edit and a mode switch (§9.4). **DONE — org-verified 2026-09-06** (see §9.4).
4. **No shipped surface advertises unbuilt functionality** — the template shelf and the Autofill
   "later slice" line (§3.4, §9.1).
5. **Studio chrome meets 4.5:1 for small text** (§9.5) — not because a written promise covers it
   today, but because shipping a form builder whose own buttons fail the bar its theme editor
   enforces on customers is indefensible.

The **F13 asset-URL decision (§1)** is a decision, not a build, and should be made before anything
guest-facing ships with a built-in theme image.

---

## 8 · Recently CLOSED — do not re-open

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

| Finding                                                              | Why it's small                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLUEPRINT — structure only; the preview is the truth` → "Structure" | One string, `finalBuilderCanvas.html:4`                                                                                                                                                                    |
| Autofill "prefill mapping arrives with a later slice"                | One string, `finalFieldPalette.js:222`                                                                                                                                                                     |
| **A failed PUBLISH reported "Save failed" — FIXED 2026-09-06**       | Publish failures now carry their own message and retry; draft-save state stays independent. Org-verified 2026-09-06: real failure induced, correct copy, Retry recovered AND persisted the edit. See §9.2. |
| Duplicate Availability heading + the submission-service sentence     | Copy deletion                                                                                                                                                                                              |
| Delete-control accessible names                                      | Contextual `aria-label`                                                                                                                                                                                    |
| Copy: "answer store", "every answer becomes a field"                 | Wording only                                                                                                                                                                                               |

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

**Still pending:** Corners/Spacing as
current-value segmented controls instead of Rounder/Sharper + Airy/Dense nudges (the values already
exist in `finalDesignPanel`) · Availability date/time stacked, with timezone and a plain schedule
summary · Simple-mode rich-text toolbars collapsed until focused · consolidate the duplicated
customization chrome · Advanced Palette helper text neutralised behind a "More" disclosure · library
name as a link with fewer competing row buttons · Logic-index jump scrolling to the **Visibility**
section rather than the top of the inspector.

### 9.3 Real features — days each

Library **search + sort + version-vs-lifecycle** (`finalFormsLibrary.html` has **zero** search
today) · preview **fit / 100% / expand** controls · **pane splitters** with remembered widths ·
**typed rule operators and value editors** (every source currently gets the same operator list —
`finalRuleEditor.js:151` — and a bare text input at `finalRuleEditor.html:128`) · creation step
reorder with progress and focus/scroll restoration · **record picker for invitations** — but this
should share **Phase D's custom lookup**, not duplicate it.

**Keyboard operability in the builder canvas — BUILT AND ORG-VERIFIED 2026-09-06.** It ranked
highest here because `finalBuilderCanvas` had **zero** keyboard handlers and zero `tabindex`, in the
template _and_ imperatively: there was no infrastructure to extend, so selection, focus management
and Move up/down/to-section were built from nothing.

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

### 9.5 The one that looks easy and isn't

**"Correct contrast on small teal buttons" is listed Priority 1 / "Studio styling", which reads
like a find-and-replace. It is not.** `#0d9488` is hardcoded **54 times across 11 component
stylesheets**, and there is **no studio chrome token layer** — `--st-*` and `--studio-*` both return
nothing. A blind replace across 11 files is how you get a half-migrated palette.

Done properly — the review's own recommendation — it means introducing semantic studio tokens and
then migrating. That is a **days** item, not an afternoon.

**Do it once, with §4.3's chrome-accent unification** (gallery indigo `#6366f1` vs studio teal). Both
touch the same eleven files; running them separately pays the migration cost twice.

The measured facts, for whoever picks this up: white on the current `#0D9488` is **3.74:1** — below
the 4.5:1 WCAG floor for small text, and used on top-bar buttons, the preview device selector and
the Design mode selector. `#0F766E` measures **5.47:1**. The Design panel already warns respondents
about this exact colour while the Studio uses it on its own chrome.
