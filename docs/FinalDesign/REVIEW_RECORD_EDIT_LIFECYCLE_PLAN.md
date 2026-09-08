# Review — IMPL_PLAN_RECORD_EDIT_LIFECYCLE_FIXES

**What this is:** a critique of [IMPL_PLAN_RECORD_EDIT_LIFECYCLE_FIXES.md](./IMPL_PLAN_RECORD_EDIT_LIFECYCLE_FIXES.md),
requested by the owner 2026-09-08. **Opinion only — no code was changed and nothing was opened.**

**Disclosure:** that plan fixes bugs in code I wrote and merged the same day
([IMPL_PLAN_RECORD_PAGE_EDIT.md](./IMPL_PLAN_RECORD_PAGE_EDIT.md), PRs #247/#248). I verified each of
its five findings against the source rather than defend my own work, and **all five are real.** The
criticisms below are of the _plan document_, not of whether the bugs exist.

**Why the bugs got past me — worth stating, because it shapes the plan's value.** I described that
work as "org-verified end to end." I verified **one path**: one record, load, edit, save. I never
switched records, never submitted during a load, never typed during a load, never failed a read. The
claim was true about the walk I took and wrong about what it implied.

---

## Verdict

**Adopt the plan.** Its sequencing is right, it refuses to re-litigate the owner's last-write-wins
ruling, and §1 contains the single sharpest instruction in either document (see
[The one thing to protect](#the-one-thing-to-protect)). The issues below are things to fix _in the
plan_ before anyone implements from it.

---

## Blocking — resolve before work starts

### B1 · The baseline is self-contradictory, and §1's first instruction is already impossible

The header says **"Status: proposed; implementation has not started."** The baseline line says
**"c943ebd, with the existing working-tree changes preserved."**

Verified 2026-09-08: the working tree **already contains the implementation** — 231 changed lines in
`finalFormViewer.js`, a new `recordEditLifecycle.test.js`, and all five lifecycle tests **passing**.
Markers present in the tree that do not exist at `c943ebd`: `_editState` (18), `editGeneration` (12),
`isSubmitBlocked`, `handleEditRecordError`, a `recorderror` binding, and a Retry affordance.

So §1's _"Record the failures before changing production code"_ can no longer be done in the stated
order, and a reader cannot tell whether to apply the plan to `c943ebd` or on top of a tree that
already implements it.

**This is the same failure mode this project keeps paying for** — a status header that is a claim,
and is wrong. It cost six weeks on
[FINALFORMVIEWER_EXPERIENCE_CLOUD_BLANK_PAGE.md](./FINALFORMVIEWER_EXPERIENCE_CLOUD_BLANK_PAGE.md).
**Re-baseline the document before anything else.**

### B2 · §3's "mount the edit reader with a key unique to the request" is not implementable as written

`key` is a **`for:each` directive** in LWC. The edit reader lives inside `lwc:if`
(`finalFormViewer.html`, the `editLoad` block), and **changing a property does not remount a
component**. To get per-request identity the reader must be restructured into a single-item
`for:each` — which is exactly how the Autofill readers are already mounted.

As phrased this reads like a one-line change. It is a template restructure, and whoever picks it up
discovers that mid-implementation. Say so explicitly.

### B3 · §4 flags the hardest problem and then leaves it unspecified

> _"Verify the chosen retry mechanism against the installed platform APIs; remounting alone must not
> be assumed to clear a cached failure."_

The caveat is correct, and it is **the most likely place this work stalls**: LDS caches the error, so
a remount re-reads the failure rather than retrying it. **No API is named.**

If there is no clean refresh path, the entire Retry affordance in §4 collapses and the error state
becomes terminal — which changes the design, not just the implementation. Resolve this before
starting, not during.

---

## Serious

### S1 · The whole data-integrity guarantee ends up client-side, and §6 declines to change that

> §6: _"No Apex code change is currently required."_

Finding 2 — a pending load letting a **static default overwrite a real stored value** — would then be
prevented **only by a browser-side gate**. If that gate regresses, or any other host submits, the
server still writes the defaults over live data.

This codebase already carries a known client-only-enforcement weakness
([PENDING_WORK.md](./PENDING_WORK.md) §2.1, DEFERRED #24). This adds a second one **in the same
shape, on the write path**. The server could refuse an update whose payload it can tell is
unhydrated. Deciding not to is defensible; not discussing it is the gap.

### S2 · No rollback plan for a change whose entire purpose is to block saving

The plan correctly bundles the fixes so no half ships without its guards. The consequence is that a
**false-positive readiness gate means nobody can submit an edit form at all**, with total blast
radius, no kill switch, and no staged rollout named.

For a change that introduces a new way to _prevent_ writes, the failure mode deserves as much
thought as the bug it fixes.

### S3 · §2's in-flight-submit rule silently trades away failure feedback

> _"Prevent its eventual success/error/redirect from changing the newly selected record's UI."_

Correct for safety. But the consequence is that a user can save record A, navigate to B, and **never
learn that the save to A failed.** The plan states the rule without acknowledging it is choosing
silent failure. It needs a deliberate answer — a toast outside the form, a persisted notice, or an
explicit "we accept this" ruling.

### S4 · §4 asks for two incompatible properties

_"Keep inputs usable"_ while announcing _"Loading record…"_ and showing Save as unavailable. The
respondent types into fields that are about to change around them — and §4 then spends a paragraph
specifying merge rules to survive the race it just created.

**A spinner until loaded deletes that class of bug instead of managing it**, and matches standard
Salesforce record behaviour. If there is a reason to prefer the harder path (perceived latency on
slow reads?), the plan should argue it rather than assume it.

---

## Smaller

| #   | Issue                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m1  | **Internal contradiction on repeats.** "Intended behavior" says repeat sections stay unsupported on update forms; §2 then instructs clearing "answers, **repeats**, staged file references…". Dead instruction — repeats cannot exist there.                                |
| m2  | **§2's zero-bound-fields case is in the wrong layer.** An update form binding no fields writes nothing. That belongs in publish validation ("an update form must bind at least one field"), not the runtime state machine.                                                  |
| m3  | **§5 contains a redundant instruction.** _"Discard any pre-hydration work started from static lookup defaults"_ — if §5's own deferral works, there is no pre-hydration work. Either the deferral is incomplete or the line is dead.                                        |
| m4  | **§1's "fold into the existing suites" is weakly justified and already diverged from** — the tree created a separate `recordEditLifecycle.test.js`, arguably the better call since these cases are cross-cutting rather than record-edit-specific.                          |
| m5  | **One acceptance criterion cannot fail.** §6's _"Studio, guest, create mode, reconnect \| Existing supported behavior preserved"_ is a hope, not a test — conspicuously vaguer than the crisp rows above it.                                                                |
| m6  | **§6 browser step 1 names no mechanism** for _"delay its record read."_ This project already has one — `page.route` interception, used to induce the publish-failure banner for PR #227. Uncited, it is the step most likely to be skipped as unstageable.                  |
| m7  | **Files on edit forms get one passing clause.** Repeat sections are explicitly blocked on update forms; whether **file** elements are supported deserves a ruling, not a sub-clause inside a reset list.                                                                    |
| m8  | **Slice 4 is never mentioned.** Authors still cannot switch edit mode on — `saveMode:"update"` must be hand-written into a spec. Fixing lifecycle bugs in an unreachable feature is defensible sequencing, but it should be stated so nobody reads this as "now shippable." |

---

## The one thing to protect

§1's insistence on driving submit assertions through the **published-spec / `getSpec` path**.

Verified: `finalFormViewer` **simulates** submit whenever an inline spec is set —
`if (this.authoring || this._inlineSpec) { … }`. Every test that assigns `el.spec` therefore never
reaches Apex at all, which makes an assertion like _"no `submitForm` invocation"_ **vacuously true**.

**All of my `recordEdit.test.js` cases assign `el.spec` inline.** They are structurally incapable of
catching finding 2. That one instruction is the difference between a regression suite and a
comfortable illusion, and it should survive any edit to this plan.

---

## Recommended order of fixes to the plan

1. **B1** — re-baseline against the working tree; restate what is already implemented and what is not.
2. **B3** — name the LDS retry API, or redesign the error state around not having one.
3. **B2** — restate the reader remount as the template restructure it actually is.
4. **S4** — settle spinner-vs-editable-while-loading; it changes how much of §4 is even needed.
5. **S1 / S2 / S3** — record explicit rulings, even if the ruling is "accepted, no change."
6. Sweep m1–m8.
