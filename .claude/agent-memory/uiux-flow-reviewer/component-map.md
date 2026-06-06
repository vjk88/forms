---
name: component-map
description: What each forms LWC does, the builder journey, and the admin-vs-guest UX split
metadata:
  type: project
---

Builder shell = `formDesigner` (1790-line JS, 486 HTML). Top app bar pattern (NOT SLDS tabs for primary nav):
- Left: "FormBuilder Pro" brand, Forms/Surveys pill segmented toggle, form-name dropdown + version pill dropdown.
- Right: icon buttons (history/preview/settings), New Form, New Draft, Save + Publish.
- Below bar: a status strip showing `formDetailText` + save status ("Unsaved changes" / "Saved HH:MM").
- 3-column body grid `300px 1fr 300px`: `fieldPalette` | canvas(`designerCanvas`) | `propertyPanel`. Collapses to 1col under 64rem.

Canvas (`designerCanvas`): sections → elements (each element is a `fieldPreview`). Drag/drop is native HTML5 draggable. Page navigation uses SLDS tabs INSIDE the canvas, with a trailing "Completion" tab and a "+" add-page tab. Completion tab swaps the canvas for an inline visual preview (toast-and-go banner OR screen-mode card) rendered directly in formDesigner.html.

Palette (`fieldPalette`): `lightning-tabset` scoped, two tabs — Components (survey question types + display components) and Fields (search + collapsible Required/All/Related groups, "Added" tag on used fields).

Property panel (`propertyPanel`, 996-line HTML): context-sensitive — renders Page / Form Settings / Header / Section / Element property sets. FLAT vertical scroll, no accordions. Form Settings is the densest (theme, theme tweaks, width, nav style, autofill, captcha, submit label, after-submit + 3 destination sub-blocks).

`newFormDialog`: create modal. name + locked Form Type, Data (object combobox), Experience (radio cards), Advanced (allowed adapters checkboxes). Good progressive structure with section heads.

Player/runtime = `formPlayer` (1481 JS). Wraps `lightning-record-edit-form`. Supports single-page, vertical-nav, wizard. Custom "Render As" controls (toggle/slider/radio/dropdown/checkbox-group) live OUTSIDE the record-edit-form and merge values on submit. Has honeypot + optional CAPTCHA for guests. Container-query responsive (keys off the form's own width, not viewport).

Admin vs guest split: builder is admin-only. Player serves guests with URL-Id prefill; `needsCaptcha`/honeypot only apply to guest/public sessions. After-submit modes: ToastAndGo (toast + navigate) vs Screen (thank-you card, optional auto-redirect + action button).

Journey: New Form modal → pick object/experience → drag fields onto canvas sections → configure via property panel → configure Completion tab → Save (draft) → Publish. Auto-save fires on form/version/tab switch via `autoSaveThen()`.
