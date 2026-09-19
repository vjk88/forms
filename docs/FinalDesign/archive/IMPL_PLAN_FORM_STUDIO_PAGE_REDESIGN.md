# Form Studio Page Redesign — Implementation Plan

> **Status:** PROPOSED FOR OWNER REVIEW — no implementation authorized yet.
>
> **Scope:** Salesforce-native `finalFormStudio` shell and the placement of existing Studio controls.
> This plan does not alter the form runtime, answer model, theme engine, builder canvas, or published-spec contract.

## 1 · Outcome

Make Build mode feel like one coherent authoring workspace:

- Questions and blocks remain continuously reachable.
- The blueprint remains the structural editor.
- The live preview remains the rendering truth and keeps at least half of the workspace at normal desktop widths.
- Form-level configuration leaves the permanent palette column.
- A top-bar **Settings** icon opens a compact status menu; selecting an item opens one focused right-side drawer.
- No tabs are introduced for small groups of settings.
- Public access and record invitations have one home and are no longer split between the top bar and the Connected Object card.
- The separately specified Studio **Actions** dropdown remains a separate concern.

## 2 · Current UX assessment

### What is already strong

1. **Blueprint + live preview is the correct model.** The blueprint stays stable across layouts and themes, while `finalPreviewStage` uses the real runtime parser.
2. **Build and Design are distinct, persistent modes.** The user never has to infer which editing context is active.
3. **Palette ⇄ properties swapping is efficient.** Selecting a node reuses the left column without moving the preview.
4. **Autosave, version history, undo/redo, and read-only history are already coherent.** The redesign must preserve these behaviors exactly.
5. **Preview-click selection sync is implemented.** This is the bridge that makes the blueprint and preview feel like one tool.

### What is currently weak

1. `finalConnectedObjectCard` combines three different jobs:
   - persistent survey context,
   - destructive object configuration,
   - record-link/invitation creation.
2. The card permanently consumes the top of the 320px Build palette and pushes the question catalog below the fold.
3. Public access is in the top bar while record-specific access is in the left panel, so related access controls have two homes.
4. Link creation uses a raw 15/18-character record Id, which is technically valid but poor Salesforce-native authoring UX.
5. The Build palette has competing scroll priorities: form configuration first, authoring inventory second.
6. The top bar exposes individual controls but does not group form configuration separately from lifecycle actions.

**Verdict:** the app has a strong builder foundation, but this page is not yet a polished cohesive workflow. The problem is information architecture and control placement, not the blueprint/preview architecture.

## 3 · Locked redesigned information architecture

### 3.1 Top bar

Left to right:

1. Exit
2. Form name
3. Version selector/chip
4. Build | Design
5. Save state or read-only state
6. Flexible spacer
7. Undo
8. Redo
9. **Settings icon**
10. **Actions** dropdown — only when its commands are actually implemented
11. Publish

The current inline **Public link** toggle is removed from the top bar and relocated to **Access & invitations**.

### 3.2 Settings icon behavior

The icon opens a compact dropdown that acts as a status-oriented navigator, not a form and not a tab set.

| Menu item                | Secondary status                                | Availability                                                                     |
| ------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| **Connected object**     | `Account · 2 mappings` or `Not connected`       | Survey only                                                                      |
| **Availability**         | `Accepting responses`, `Scheduled`, or `Closed` | Form and Survey                                                                  |
| **Access & invitations** | `Public access on/off`                          | Form and Survey; invitation tools are Survey-only and require a connected object |

Selecting an item:

1. closes the dropdown;
2. opens a right-side drawer;
3. shows only the selected settings group;
4. moves focus to the drawer heading/close control;
5. restores focus to the Settings icon when closed.

Only one drawer may be open. Escape, the close button, and the backdrop close it.

### 3.3 Build palette

- Remove the expanded `finalConnectedObjectCard` from the palette root.
- Keep `finalFieldPalette` at the top-level authoring surface.
- For Surveys with a connected object, show one compact context row beneath the palette heading:
  - object label/API name;
  - mapped-question count;
  - chevron;
  - click opens **Connected object** in the Settings drawer.
- For Surveys without a connected object, show a compact `Connect an object` row in the same location.
- Forms keep their existing object-bound palette behavior; do not add a duplicate context card.

### 3.4 Settings drawer contents

#### Connected object

- Current object and API name.
- Mapped-question count.
- Change object.
- Disconnect object.
- Existing survivor/casualty confirmation copy and published-response warning remain unchanged.
- No record-link controls in this section.

#### Availability

Edit the already-supported `spec.settings.availability` shape:

- accepting responses / manually closed;
- opens date/time;
- closes date/time;
- response cap;
- closed message.

Rules:

- Blank dates serialize as `null`.
- Response cap is `null` or a positive integer.
- An open date after the close date is an inline validation error and cannot be applied.
- The builder uses the user's locale for entry and serializes ISO values into the spec.
- All changes use the existing spec mutation, history, and debounced autosave path.

#### Access & invitations

**Public access**

- Move the existing `lightning-input type="toggle"` here.
- Preserve the existing confirmation before turning public access on.
- Preserve `FinalStudioController.setGuestAccess`; this remains Form-record state, not versioned spec state.
- Explain the unpublished state inline: public access becomes usable only after Publish and guest hosting are configured.

**Record-specific invitation** — Survey only, connected object required

- Move the current SO-4 Tier 1/Tier 2 controls here.
- Preserve stateless vs tracked behavior, recipient label, single-use, copy, and mass invalidation.
- Rename the primary action to **Create invitation link** for clarity.
- Keep `Manage invitations in Salesforce` as a link to the standard `Survey_Invitation__c` list view; do not build a bespoke invitation manager in this redesign.
- Keep the destructive confirmation for `Invalidate all links`.

**Record selection gate**

- Preferred UX: a Salesforce record picker scoped dynamically to the connected object.
- Before implementation, prove the selected base component works in both supported Studio hosts:
  1. LEX app page;
  2. Visualforce + Lightning Out full-screen Studio.
- If the base picker is not supported in both hosts, do not silently ship a host-specific control. Retain the validated Id input for this release and create a separate, security-reviewed dynamic lookup slice.
- No custom search Apex endpoint is added as part of this UI refactor without a separate owner-approved scope.

#### Spam protection — deferred

Do not render a spam-protection editor in this slice. The submit runtime has no
`settings.spamProtection` contract or CAPTCHA path, so an editor would create a
dead control. A future slice must define and implement submit-path behavior
before adding this menu item.

### 3.5 Studio Actions menu

`DEFERRED.md` #17 defines a separate top-bar **Actions** dropdown:

- Clone Form
- Export Form
- Import Form
- Delete Form

This redesign reserves the top-bar location but does **not** ship non-functional menu items.

Recommended scope decision:

- **This redesign:** omit the Actions button unless those commands are separately approved and implemented.
- **Follow-up:** implement the complete Actions program with fresh-id cloning, import validation, export format/versioning, and delete cascade/response-retention decisions.

## 4 · Component design

### 4.1 Modify `finalFormStudio`

Files:

- `force-app/main/default/lwc/finalFormStudio/finalFormStudio.html`
- `force-app/main/default/lwc/finalFormStudio/finalFormStudio.css`
- `force-app/main/default/lwc/finalFormStudio/finalFormStudio.js`
- `force-app/main/default/lwc/finalFormStudio/__tests__/finalFormStudio.test.js`

Responsibilities retained in the parent:

- form/version loading;
- Build/Design/read-only modes;
- spec/history/autosave ownership;
- public-access Apex call;
- connected-object commit and casualty calculation;
- invitation mint/invalidation Apex calls;
- global overlay/drawer state and focus restoration.

New parent UI state:

- `settingsMenuOpen`
- `settingsDrawerOpen`
- `settingsSection` (`connection | availability | access`)
- trigger element reference for focus restoration

New parent behaviors:

- toggle/close Settings menu;
- open a selected drawer section;
- close on Escape/backdrop;
- close menus when mode/version/form changes;
- prevent configuration edits in read-only history;
- derive menu status text from existing object, public, and spec settings state.

### 4.2 Add `finalStudioSettingsPanel`

New bundle:

- `force-app/main/default/lwc/finalStudioSettingsPanel/finalStudioSettingsPanel.html`
- `force-app/main/default/lwc/finalStudioSettingsPanel/finalStudioSettingsPanel.css`
- `force-app/main/default/lwc/finalStudioSettingsPanel/finalStudioSettingsPanel.js`
- `force-app/main/default/lwc/finalStudioSettingsPanel/finalStudioSettingsPanel.js-meta.xml`
- `force-app/main/default/lwc/finalStudioSettingsPanel/__tests__/finalStudioSettingsPanel.test.js`

Responsibilities:

- render one selected settings section;
- local form validation and progressive disclosure;
- emit intent only;
- never call Apex directly;
- never mutate the received spec object.

Primary events:

- `close`
- `settingschange` with a normalized settings patch
- existing object events relayed unchanged
- `publicchange`
- existing invitation mint/invalidate events relayed unchanged

### 4.3 Split `finalConnectedObjectCard`

Current `finalConnectedObjectCard` owns both object configuration and SO-4 invitation UI. Split responsibilities without changing the parent business logic:

1. Keep `finalConnectedObjectCard` for connected-object selection, casualty confirmation, change, and disconnect.
2. Move lines/behavior associated with SO-4 record links into a new `finalRecordLinkPanel` bundle.
3. Preserve existing custom-event payloads:
   - `mintlink { recordId, tracked, recipient, singleUse }`
   - `invalidatelinks`
4. Move the relevant Jest cases from `finalConnectedObjectCard.test.js` to `finalRecordLinkPanel.test.js`; retain the object-selection tests in the original bundle.

This avoids another large multipurpose component and makes each settings drawer section independently testable.

## 5 · Data and mutation flow

### Spec-backed settings

Availability uses the existing one-truth mutation path:

1. `finalStudioSettingsPanel` emits a validated patch.
2. `finalFormStudio` calls its existing `_mutate` helper.
3. `_mutate` deep-clones the current spec.
4. The patch updates `next.settings` without deleting unknown/future keys.
5. `handleSpecChange` records undo history and arms the existing debounced autosave.
6. Undo/redo restores these settings exactly like canvas and Design edits.

Do not create a second save button or Apex persistence path for spec-backed settings.

### Form-record state

Public access continues through `setGuestAccess`. It must not be inserted into the versioned spec.

### Connected object

Object changes continue through `setContextObject` first, followed by the existing mapping/rule pruning and spec update. The redesign changes its location only.

### Invitations

The existing controller methods remain the source of truth:

- `mintRecordLink`
- `mintTrackedLink`
- `invalidateLinks`

No token, security, revocation, or single-use semantics change in this redesign.

## 6 · Visual and responsive behavior

### Desktop

- Build layout remains palette | blueprint | live preview.
- Palette remains approximately 300–320px including its icon rail.
- Preview remains at least 50% of the workspace at supported wide widths.
- Settings drawer overlays the preview side; it does not permanently resize the blueprint or palette.
- The drawer is approximately 380–400px wide.

### Narrow Studio widths

- Preserve the existing minimum usable blueprint width.
- At widths where all three Build regions cannot remain usable, hide/collapse the preview before compressing authoring controls below accessible sizes.
- Settings drawer may occupy the full available width.
- No horizontal page overflow.

### Styling rules

- Continue the `st-` prefix for shell chrome to avoid LEX global-style collisions.
- New child bundles use unique prefixes.
- Use the existing teal Studio chrome accent; do not couple builder chrome to form theme tokens.
- Use Salesforce base components where they behave consistently in both supported hosts.
- Preserve visible focus, ≥44px touch targets where practical, and readable error/status regions.

## 7 · Accessibility and interaction requirements

1. Settings icon has `aria-label="Form settings"` and synchronized `aria-expanded`.
2. Dropdown uses menu-button keyboard behavior: Enter/Space opens, arrow navigation, Escape closes.
3. Drawer has a labelled heading and modal/drawer semantics appropriate to its implementation.
4. Opening the drawer moves focus inside; closing restores focus to the initiating control.
5. Destructive actions retain confirmations and clear destructive styling.
6. Inline errors use `role="alert"`; success/copy/invalidation notices use polite live regions.
7. Read-only version history allows inspection but disables all mutations, or hides the Settings entry entirely; recommended behavior is hide/disable Settings and keep the existing read-only notice as the one explanation.
8. Background content is not keyboard-interactive while the drawer is modal.

## 8 · Test plan

### `finalFormStudio` Jest

- Settings menu opens/closes and reports the correct `aria-expanded` state.
- Status labels reflect:
  - connected/not connected;
  - mapped count;
  - public/private;
  - open/scheduled/closed;
- Selecting each item opens the correct drawer section.
- Escape/backdrop/close button close the drawer and restore focus.
- Build palette renders immediately without the expanded Connected Object card.
- Survey context row opens the connection section.
- Form mode does not render a duplicate survey connection row.
- Public toggle still confirms on enable and calls `setGuestAccess` with the same payload.
- Object change/disconnect still uses the existing casualty/survivor flow.
- Invitation events still call the same Apex methods and preserve busy/error/notice state.
- Settings close on mode, form, and version changes.
- Read-only history cannot mutate settings.
- Undo/redo covers availability setting changes.

### `finalStudioSettingsPanel` Jest

- Renders only the selected section; there are no tabs.
- Availability normalizes blanks to `null` and rejects invalid date order/caps.
- Public, object, and invitation events are relayed with exact payloads.
- Conditional Survey/Form visibility is correct.

### Extracted component Jest

- Existing connected-object tests remain green after removing SO-4 markup.
- Existing SO-4 tests move to `finalRecordLinkPanel` and remain behaviorally identical.
- Record picker host-compatibility test is completed before replacing the Id input.

### Existing regression suites

- `finalPreviewStage`
- `finalFieldPalette`
- `finalBuilderCanvas`
- `finalGuestHost`
- Apex tests for `FinalStudioController`, `FinalGuestController`, and survey submission

## 9 · Implementation sequence

### Slice 1 — Shell and navigation

- Add Settings trigger/menu/drawer shell to `finalFormStudio`.
- Remove the permanent expanded card from the palette.
- Add the compact Survey connection context row.
- Preserve all current behaviors in their old components while relocating them.
- Add keyboard/focus behavior and responsive CSS.

**Gate:** no behavior change; Build, Design, preview, selection, versions, autosave, undo/redo, object switching, public access, and link creation all remain functional.

### Slice 2 — Responsibility split

- Add `finalStudioSettingsPanel`.
- Extract SO-4 markup/state from `finalConnectedObjectCard` into `finalRecordLinkPanel`.
- Move public access into Access & invitations.
- Wire all existing events back to `finalFormStudio`.

**Gate:** existing object/link Jest behavior passes with the new component boundaries.

### Slice 3 — Availability editor

- Add a normalized editor for `settings.availability`.
- Route edits through `_mutate` and the existing history/autosave path.
- Add validation and status summaries.
- Keep spam protection out until the submit runtime has a real settings contract.

**Gate:** published guest load/submit behavior respects values authored through the new UI; no manual JSON is required.

### Slice 4 — Record picker compatibility

- Test the preferred Salesforce record-picker control in both LEX and VF + Lightning Out.
- Replace the raw Id input only after both hosts pass.
- If the host gate fails, retain the validated Id input and open a separately scoped dynamic lookup plan.

**Gate:** a selected record Id reaches the existing mint methods unchanged in both hosts.

### Slice 5 — Polish and org verification

- Responsive verification at wide desktop, 1024px-class, and narrow widths.
- Keyboard/focus audit.
- LEX CSS-collision check.
- Visual verification in both Studio hosts.
- Run targeted tests, lint, and formatting verification.

**Gate:** zero layout overlap, no inaccessible background while the drawer is open, and no regression in preview width/behavior.

### Separate follow-up — Studio Actions

Do not mix Clone/Export/Import/Delete backend semantics into the page-layout refactor. Create and approve a separate implementation plan before rendering the Actions button.

## 10 · Verification commands

Run from the repository root:

```powershell
npm run test:unit -- --runInBand --testPathPattern="finalFormStudio|finalStudioSettingsPanel|finalConnectedObjectCard|finalRecordLinkPanel|finalPreviewStage"
npx eslint force-app/main/default/lwc/finalFormStudio force-app/main/default/lwc/finalStudioSettingsPanel force-app/main/default/lwc/finalConnectedObjectCard force-app/main/default/lwc/finalRecordLinkPanel
npx prettier --check "force-app/main/default/lwc/{finalFormStudio,finalStudioSettingsPanel,finalConnectedObjectCard,finalRecordLinkPanel}/**/*.{html,css,js,xml}"
```

If org deployment is approved, deploy only changed paths, never the project globally:

```powershell
sf project deploy start `
  --source-dir force-app/main/default/lwc/finalFormStudio `
  --source-dir force-app/main/default/lwc/finalStudioSettingsPanel `
  --source-dir force-app/main/default/lwc/finalConnectedObjectCard `
  --source-dir force-app/main/default/lwc/finalRecordLinkPanel
```

Add Apex source paths only if the separately approved record-picker work introduces Apex.

## 11 · Owner review decisions

The owner confirmed these decisions before implementation:

1. **Settings menu roster:** Connected object · Availability · Access & invitations. Spam protection is deferred until it has runtime behavior.
2. **Actions scope:** recommended separate follow-up; no dead Actions button in this redesign.
3. **Record picker gate:** preferred base picker only if it works in both LEX and VF + Lightning Out; otherwise retain Id input for this release.
4. **Read-only behavior:** recommended Settings disabled/hidden while viewing a published historical version.
