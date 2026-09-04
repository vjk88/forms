3# Pending Work — everything between here and ship

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

## 1 · Snapshot

| Phase                                               | State                                                   |
| --------------------------------------------------- | ------------------------------------------------------- |
| P0–P3 — skeleton, 7 layouts, theme system, builder  | **Done**, gate-passed                                   |
| P4 — element widgets                                | **Partial** (§3)                                        |
| P5 — guest runtime & hardening                      | **Partial** — Phase A shipped; hardening has holes (§2) |
| Surveys — S1–S6, SO-1…SO-4, R1 feedback             | **Done**, org-verified                                  |
| Studio Settings drawer + Studio Actions (#214–#218) | **Done**                                                |
| P6 — creation & templates                           | **Partial** (§3)                                        |
| P7 — cutover & legacy deletion                      | **Not started**                                         |
| 2GP packaging + Security Review                     | **Not started**                                         |

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

### 3.1 File upload is a visible stub — highest-visibility gap

[finalElementRenderer.html:295](../../force-app/main/default/lwc/finalElementRenderer/finalElementRenderer.html#L295)
renders an upload icon and the literal text **"File upload arrives with a later step."** There is
no `ContentVersion` write anywhere in the submit path (verified: `ContentVersion` appears only in
the asset/design-mode and package-dependency classes, never in `FinalSubmitService`).

This is the only place a user can read an unfinished promise in shipped UI. The old build solved
it and the approach is preserved: base64-on-submit, atomic insert via `FirstPublishLocationId`
inside the submit savepoint, ~4.3 MB cap ([[project-file-upload]]).

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

1. **File upload (§3.1)** — the only unfinished promise a user can read in shipped UI, and the
   approach is already proven.
2. **Accessibility pass (§4.1)** — small, bounded, and currently contradicts a stated product promise.
3. **Open the packaging track (§2.3 + §2.4)** — namespace, 2GP, legacy purge. Longest pole, and the
   namespace decision constrains everything downstream, so start it before it's urgent.
4. **Server-side validation (§2.1)** — pull forward the moment the packaging track starts moving;
   it must land before the package goes for review.

**Why validation isn't first** (owner call, 2026-09-03): it's frequently mistaken for a live
security hole, and it isn't — see §2.1 for what the allow-list already enforces. Its real trigger
is Security Review, which is gated behind packaging that hasn't started. Sequenced on timing rather
than on how alarming the title sounds. It stays a hard gate on shipping, just not a standing risk.

Rate limiting (§2.2) can ride the broader guest-hardening pass. The polish backlogs (§4) are real
work but block nothing.

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
