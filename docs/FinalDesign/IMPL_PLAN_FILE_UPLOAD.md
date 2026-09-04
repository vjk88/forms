# Implementation Plan — File Upload (PENDING_WORK §3.1)

> **Status:** PROPOSED FOR OWNER REVIEW — no implementation authorized yet.
>
> **Scope:** replace the `file` element stub with a working upload path: renderer UI → viewer
> payload → atomic `ContentVersion` inside the submit savepoint. Plus the builder drop-block that
> schema §4.1 requires and which **does not exist today**.
>
> **Supersedes** an earlier draft plan (external, `.gemini/…/implementation_plan.md`). That draft
> had the right architecture but missed four written laws and silently crossed a phase boundary;
> §1 records exactly what changed so the corrections aren't lost.

## 1 · What changed from the draft, and why

| #   | Draft said                                                             | Governing law                                                                                                                           | Revision                                                                                               |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | `SYSTEM_MODE` insert for `Posture.GUEST` — guest upload shipped inline | **BUILD_PHASES P4**: _"file upload … validated in internal user contexts only during P4; guest-upload capabilities are deferred to P5"_ | Split into **Slice 1 (internal)** and **Slice 2 (guest, owner-gated)**. §3                             |
| 2   | Size cap only                                                          | **RUNTIME_NOTES** guest-upload guardrails are _mandatory_: _"enforce size **and file-type** caps"_                                      | Server-side **file-type allow-list**, derived from the published spec. §4.3                            |
| 3   | Per-file cap only                                                      | **RUNTIME_NOTES §Submit payload caps**: _"the submit payload as a whole needs a server-side size check too"_                            | Aggregate payload cap alongside the per-file cap. §4.3                                                 |
| 4   | No builder changes                                                     | **Schema §4.1 v1 law**: _"No file elements inside repeatable sections — the builder blocks the drop"_                                   | **Slice 1a builds the block.** It is currently unenforced — see §2.                                    |
| 5   | `~4.3 MB (4,500,000 bytes)`, unit unstated                             | 6 MB synchronous Apex heap                                                                                                              | Cap defined explicitly against the **base64 string**, and **measured**, not assumed. §4.4              |
| 6   | `files: [{elementId, name, fileName, base64, contentType}]`            | Schema §8 defines `{elementId, name, base64}`                                                                                           | Drop `fileName`/`contentType` from the wire; derive type **server-side**. §4.3                         |
| 7   | Read files from `payload.files` _with a fallback to_ `payload.answers` | —                                                                                                                                       | Single channel: top-level `files` only. A second source of truth is where an allow-list gets bypassed. |

## 2 · The builder gap is real (verified 2026-09-03)

Schema §4.1 states the builder blocks file elements from repeatable sections, because _"a flat
`files` array keyed by `elementId` can't attach entry 1's file vs entry 2's to the right child
record — and ~4.3 MB base64 × N entries is a heap bomb."_

**That block does not exist.** `file` is a palette **block**, not a field
([finalFieldPalette.js:128](../../force-app/main/default/lwc/finalFieldPalette/finalFieldPalette.js#L128)),
and the canvas gatekeeper waves blocks through unconditionally:

```js
// finalBuilderCanvas.js:298-303
// §1: content blocks land anywhere (into field sections, or as a
// sibling BEFORE another block — the drop handler decides which).
if (kind === 'palette-el' || kind === 'palette-rep') {
  return true;
}
```

The repeater guard one branch below applies only to `palette-field`. So a `file` block can be
dropped **into** a repeatable section today. Nothing downstream catches it, because until now
nothing consumed file answers at all. **Building the runtime without the block turns a dormant
authoring gap into live data corruption**, which is why it is Slice 1a and not a follow-up.

## 3 · Slicing, and the one decision needed

### Slice 1 — internal audience only (P4-conformant, no ruling needed)

Everything in §4. `Posture.INTERNAL` only; a guest submit carrying `files` is **rejected**, not
silently ignored, so the boundary is observable rather than mysterious.

### Slice 2 — guest upload (needs an explicit owner "go")

> **DECISION REQUIRED.** BUILD_PHASES defers guest upload to P5 _"when guest-safe server-side
> handlers are built."_ Phase A has since shipped that family (`FinalGuestController` as the single
> hard-gated surface), so the precondition is now **met** — this is no longer blocked, it's
> unscheduled. But guest upload means anonymous visitors writing `ContentVersion` records into the
> org: storage exhaustion, malware parking, and free file hosting are all real, and none are
> theoretical for a public URL. Slice 2 therefore ships the full mandatory guardrail set (§5) or it
> does not ship.

**Recommendation:** build Slice 1 now, and take Slice 2 as its own PR with §5 in full. A form
builder whose upload works only for logged-in users is admittedly half a feature — but the half
that's missing is precisely the half that needs the hardening budget, and bundling them hides that.

## 4 · Slice 1 — the work

### 4.1 [MODIFY] `finalBuilderCanvas.js` — the §4.1 drop block

- In `_sectionAcceptsDrag`, before the blanket `palette-el` allow at line 302: if the drag is a
  **`file`** palette block and the target section `sec.repeat` is truthy, return `false`.
- The palette drag payload must therefore carry the block's `type`; if it doesn't already, extend
  `_setDrag` to include it (check before assuming).
- Rejection feedback = **native no-drop cursor only**. No toast, no flash — CANVAS_RULES §1 is
  explicit and the existing rejections all behave this way.
- Same guard on the reorder path (`kind === 'element'`), so an existing file element can't be
  _moved_ into a repeater after the fact.

**Jest:** a `file` block over a repeatable section is refused; over a plain section is accepted; an
existing file element cannot be dragged into a repeater.

### 4.2 [MODIFY] `finalElementRenderer` — the UI

**`.html`** — replace the stub at line 295 with: the standard label row (label, required asterisk,
helptext, caption) matching sibling elements; a drop zone wrapping a visually-hidden
`<input type="file">`; the attached-file list (icon, truncated name, formatted size, remove button);
and an inline error region. Follow the existing element markup conventions rather than inventing new
ones.

**`.js`** — `handleFilePick` / `handleFileDrop` / `handleFileDragOver` / `handleFileDragLeave` /
`handleFileRemove`; `FileReader.readAsDataURL` → base64; client-side size and type checks (**UX
only — never the enforcement point**, cf. PENDING_WORK §2.1); dispatch `valuechange` with
`{ elementId, value: files }` so answers land in the viewer's store like every other element.
Honour `accept` and `multiple` from element config, defaulting closed.

**`.css`** — `.file-dropzone` (dashed `--c-field-border`, `--c-input-bg`, drag-over accent via
`--c-accent` / `--c-focus-ring`), `.file-list` / `.file-item`, responsive rules. **Themed tokens
only** — no hardcoded colors, per the token-type contract.

**Accessibility** (not optional — this is guest-facing surface under the WCAG 2.1 AA posture):
the drop zone is keyboard-reachable and activates on Enter/Space; remove buttons have accessible
names naming _which_ file; size/type errors announce via the existing inline-error pattern with
`aria-describedby`; drag-and-drop is never the only route to attach a file.

### 4.3 [MODIFY] `FinalSubmitService.cls` — `attachFiles`

Signature: `attachFiles(Id parentId, Map<String,Object> spec, Map<String,Object> payload, Posture mode)`
— called inside the **existing** savepoint in both `run` and `runSurvey`, so a file failure rolls
the record back with it.

Order of operations, each failing closed:

1. **Posture gate** — Slice 1: `mode == Posture.GUEST` with a non-empty `files` → reject.
2. **Aggregate size** — sum of all base64 lengths ≤ `MAX_PAYLOAD_B64_CHARS`, checked **before**
   decoding anything.
3. **Allow-list** — walk the spec's pages/sections collecting element ids of `type == 'file'`. Any
   entry whose `elementId` isn't in that set is rejected. (Same law as the field walk: the
   published spec is the allow-list.)
4. **Repeat guard** — a `file` element found inside a section carrying `repeat` is rejected
   server-side too. Slice 1a stops it being _authored_; this stops a spec that predates the block,
   or was hand-edited, from being _submitted_.
5. **Per-file size** — each base64 length ≤ `MAX_FILE_B64_CHARS`.
6. **File type** — extension parsed **server-side from `name`**, matched against the allow-list
   resolved from the element's published `accept` config, with a hard deny-list backstop for
   executable/script types regardless of what the author configured. **The client's `contentType`
   is never trusted and never read.**
7. **Insert** — `ContentVersion` with `Title`, `PathOnClient`, `VersionData`,
   `IsMajorVersion = true`, and `FirstPublishLocationId = parentId`, where `parentId` is the record
   _this transaction just created_. Never a client-supplied Id — RUNTIME_NOTES guardrail, verbatim.
   `insert as user` for `Posture.INTERNAL`.

Rejections throw `AuraHandledException` with a **generic** message. Do not name the offending
extension or echo the filename — no gate oracle, consistent with the existing guest posture.

### 4.4 Constants — and the measurement that pins them

One block of constants, one place:

```apex
// Caps are on the BASE64 STRING, matching schema §8's "~4.3 MB base64".
// A base64 char count of N decodes to ~0.75N bytes, and a transaction holds
// BOTH the string and the decoded Blob at peak -- hence the measurement gate.
private static final Integer MAX_FILE_B64_CHARS    = …;
private static final Integer MAX_PAYLOAD_B64_CHARS = …;
```

> **Do not merge with guessed numbers.** Synchronous Apex heap is 6 MB, and at peak the transaction
> holds the base64 String _plus_ the decoded Blob _plus_ the spec JSON _plus_ the payload map. The
> old build's proven ~4.3 MB figure is the starting hypothesis, **not** an established fact for
> this code path. Slice 1 lands with an Apex test asserting `Limits.getHeapSize()` headroom at the
> cap, and the constants are set to whatever that test proves — the draft plan's `4,500,000`
> applied to a _raw file_ would decode to ~6 MB of base64 and breach heap on its own.

### 4.5 Tests

**Apex** (`FinalSubmitControllerTest`): happy path attaches a `ContentVersion` to the new record ·
oversize single file rolls the whole transaction back · aggregate cap rejects · non-`file`
`elementId` rejected (allow-list boundary) · disallowed extension rejected · `contentType` from the
client cannot influence the outcome · guest posture rejected in Slice 1 · **heap headroom asserted
at the cap** · file element inside a `repeat` section rejected.

**Jest**: renderer — dropzone renders, pick emits `valuechange`, remove updates value, oversize
shows inline error and emits nothing, keyboard activation works. Canvas — the three §4.1 cases.
Viewer — `_payload()` emits top-level `files` in schema §8 shape.

## 5 · Slice 2 — guest upload (only on owner "go")

Everything in Slice 1, plus, per RUNTIME_NOTES (all mandatory):

- `SYSTEM_MODE` insert behind `FinalGuestController`'s existing hard gate — no second file route,
  and **`formSignature` must reuse this same path** when it lands.
- **Per-submission file count cap** and a **tighter guest size cap** than internal.
- **Abuse limits** — this is the surface DEFERRED #20's missing rate limiting actually matters on;
  an unthrottled public upload endpoint is a storage-exhaustion vector. Slice 2 should not ship
  ahead of that work.
- A **cleanup story** for files whose parent record is later deleted, so orphaned
  `ContentDocument`s don't accumulate ([[project-config-image-storage]] has the same open TODO).
- Guest-created file **visibility**: confirm what the guest user can and cannot read back after
  insert.

## 6 · Orphan ledger

| Artifact                                           | Disposition                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Stub markup at `finalElementRenderer.html:295-308` | **Deleted** — replaced by 4.2                                                            |
| `COMPONENT_CATALOG` `fileUpload` row               | Update: stub → built (Slice 1, internal)                                                 |
| `PENDING_WORK.md` §3.1                             | Update on merge; §3.2 signature note gains "path now exists"                             |
| `DEFERRED.md` #20                                  | Cross-reference from Slice 2 — rate limiting becomes a prerequisite, not a parallel item |
| Schema §8 `entryIndex` reservation                 | **Stays reserved and unused** — §4.1 law holds, nothing to build                         |
| Draft plan at `.gemini/…/implementation_plan.md`   | Superseded by this file; delete or leave, it's outside the repo                          |

## 7 · Open questions for the owner

1. **Slice 2 go/no-go** (§3) — internal-only now, or fund the guarded guest path in the same pass?
2. **Author-facing type control** — is `accept` exposed in the inspector, or is there a fixed
   product allow-list? §4.3 assumes author-configured **narrowing** within a hard product backstop;
   if the inspector control doesn't exist yet, that's a small addition to Slice 1.
3. **Multiple files per element** — the draft assumed `multiple` is supported. Confirm; it changes
   the aggregate-cap arithmetic and the required-field semantics ("at least one" vs "exactly one").
