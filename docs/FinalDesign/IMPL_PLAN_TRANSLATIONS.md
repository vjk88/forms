# Translations for respondent forms (DEFERRED #4)

Owner 2026-11-19. Plan only, no code yet. Scope is what **respondents** see on Forms, Surveys and Freeform.
The Studio (builder screens) stays English.

## Rulings (owner, 2026-11-19)

| Topic | Ruling |
|---|---|
| Form types | All three: Form, Survey, Freeform |
| Picking the language | All three ways: **automatic** (signed-in user's Salesforce language; guest's browser language), a **link parameter** (`?lang=fr`), and a **switcher** on the form |
| How authors enter translations | **Export / import a file** from the Studio (in-Studio editing is not in v1) |
| Built-in words (Next, Submit, errors) | **Salesforce Custom Labels**, translated by admins in Setup → Translation Workbench |
| Shipped languages | **English only.** Admins add any other language themselves |
| Right-to-left (Arabic, Hebrew) | **Later.** v1 swaps text only, no mirrored layouts |
| Response language | **Yes:** a `Language__c` field on the response records |

## Today (verified 2026-11-19)

- No translation code anywhere: no `@salesforce/label`, no `@salesforce/i18n`, no language detection.
- Built-in words are hard-coded English in the respondent components, for example `finalSubmitBar.js` 54-62
  (`'Submit'`, `'Next'`, `'Back'` when the author left them blank) and messages in `finalFormViewer` and
  `finalElementRenderer`.
- Choice answers are stored by **value**, never by label (#361), so a translated label never changes what is
  saved or reported. This is what makes the whole plan safe.
- Bound field labels on Forms already come from Salesforce in the signed-in user's language. Guests get the
  site's language, not their browser's (see Limits).

## Design

### 1. Where translations live: in the spec, keyed by Ids

The form spec gains:

```json
"languages": { "default": "en_US", "available": ["en_US", "fr", "de"], "showSwitcher": true },
"translations": {
  "fr": { "el:q_123.label": "Votre nom", "el:q_123.opt:yes": "Oui", "page:p1.name": "Début" }
}
```

- **Keys come from Ids that already exist** (element, section and page Ids, choice values), so authors never
  create keys. Key forms: `form.title`, `page:<id>.name`, `sec:<id>.title`, `el:<id>.<prop>` (label,
  helpText, caption, placeholder, leftLabel, rightLabel, content, alt, errorMessage),
  `el:<id>.opt:<value>`, `el:<id>.row:<rowId>`, `el:<id>.col:<value>`, `bar.submit|next|back`,
  `done.title|message` (thank-you page).
- **Step 1 of the build is the exact inventory** of every author-written text property in
  `FORM_SPEC_SCHEMA.md` and in the renderers. Any property missed there stays English, so the inventory gets
  a jest test that fails when a renderer reads a new text property not on the list.
- A missing translation falls back to the default-language text. It is never blank.
- Published specs carry `translations` in the frozen snapshot, so guests need no extra fetch. Large forms with
  many languages may hit the existing `{"overflow":true}` ContentVersion path. That path already exists; add a
  test for it.

### 2. One swap point at runtime

- New logic module `c/finalTranslate` (no UI):
  - `resolveLanguage({ param, chosen, userLang, browserLangs, available, fallback })`: the first match wins:
    `?lang=` → the switcher choice (kept for the tab session) → signed-in user's language
    (`@salesforce/i18n/lang`) → each guest browser language in order (exact match first, then base language:
    `fr-CA` → `fr`) → the form default.
  - `localizeSpec(spec, lang)` returns a copy of the spec with the text swapped.
- `finalFormViewer` calls `localizeSpec` once, before rendering. **No renderer changes**, so every layout and
  question type gets translations for free.
- Switching language keeps every answer (answers are values) and stays on the current page.

### 3. The switcher

- A small language menu in the form header, shown only when `available` has 2 or more languages **and** the
  author left "Show language menu" on (default on).
- Options use each language's own name ("Français", "Deutsch"), via `Intl.DisplayNames`.
- Restyle only, per DESIGN_SYSTEM §0. It needs a mock first (header space differs across the 8 layouts).

### 4. Built-in words → Custom Labels

- Move every built-in respondent string into Custom Labels named `Final_Run_*` (about 60, counted in step 1).
- **Catch:** Custom Labels resolve to the *running user's* language. For guests that is the site guest user,
  so browser language and the switcher would not change them. Fix: a cacheable, guest-safe Apex method
  `FinalRuntimeLabels.forLanguage(lang)` that returns the label map using
  `System.Label.get(namespace, name, lang)` (with `translationExists` to fall back to English). The viewer
  loads it once per language.
- English ships. Admins translate in Translation Workbench, and the guide tells them how.

### 5. Authoring: export / import file

In the Studio **Settings drawer**, a new **Languages** section:

- **Default language** (picklist of the org's active languages) and **Languages offered** (add or remove).
- **Show language menu on the form** (toggle).
- **Download translation file:** a CSV (UTF-8 with BOM so Excel opens accents correctly). Columns: `Key`,
  `Where` (readable path: "Page 1 › Section 2 › How satisfied…? › Option"), `Default text`, then one
  column per language. Existing translations are filled in.
- **Upload translation file:** a summary before saving: "212 texts · French 212/212 · German 180/212 ·
  3 rows changed in English since you downloaded". Unknown keys are listed and ignored. Nothing saves until
  the author confirms (inline confirm, DESIGN_SYSTEM 5.17).
- **Stale text:** the file carries a short hash of each default text. On upload, a row whose default text
  changed since the download is flagged, so authors know to re-check it.
- **Publish warning** (`FinalPublishWarnings`): "German is missing 32 translations; they will show in
  English". This is a warning, not a block.

### 6. Response language

- New field `Language__c` (Text 10, the language code) on `Form_Response__c` (Survey) and
  `Form_Submission__c` (Freeform), set by `FinalSubmitService` from the language the respondent saw. It is
  validated against the form's `available` list; anything else stores the default.
- Forms write straight to the bound record, so there is no response record to hold it. Out of scope.
- Add the field to the survey report type so results split by language.

## Limits (say them in the guide)

- **Bound field labels for guests** follow the site's language, not the browser's. Authors who need
  otherwise can type a translated label override in the file (the export includes bound labels as optional
  rows).
- Picklist values shown from Salesforce (bound picklists) are translated by Salesforce for signed-in users
  only. Same rule.
- No right-to-left layout in v1.
- Theme photos and uploaded images are not per language. Alt text is.

## Build order (one PR each)

1. **Built-in words:** Custom Labels `Final_Run_*` with an English copy in `c/finalTranslate` (jest and
   fallback; a sync test keeps the XML, the JS and the Apex name list identical); the label method lives on
   the already guest-accessible `FinalGuestController.runtimeLabels(lang)` instead of a new class. Without a
   link parameter, labels follow the running user's language (standard Salesforce, the same as bound field
   labels). `?lang=` / `c__lang=` swaps only the built-in words in PR 1. Automatic browser language waits
   for PR 2, so a guest never gets French buttons on English questions.
2. **DONE 2026-11-19 (PR 2).** In the Studio (authoring) the preview ignores the author's own and browser language; only `?lang=` changes it. Server messages other than the closed message stay default-language for now. **Author text inventory, spec translations, swap:** the text-property inventory and its guard test;
   `languages` / `translations` in the spec schema, `localizeSpec`, the full `resolveLanguage` order limited to
   the form's `available` languages, viewer wiring, the publish snapshot and overflow test.
   Respondent-facing **server** messages (e.g. `FinalAnswerValidator` "required") take the language from the
   submit payload and use `System.Label.get` here too.
3. **REPLACED (owner 2026-11-20): an in-app Translate screen** (mock: `mocks/translate-screen-mock.html`,
   approved). No file round-trip; an agency file (XLIFF) only if a customer asks.
   - **3A groundwork:**
     - Validation rules get stable ids, so `el:<id>.msg:<ruleId>` survives reordering.
     - `translationSources {lang: {key: fingerprint}}` drives the "changed in English" flag.
     - `listTexts` entries carry where-labels and a rich-text flag.
     - Helpers: `translationStatus` / `setTranslation` / `pruneTranslations`.
     - A guard test fails when a renderer reads an author text field missing from `TEXT_KEYS`.
   - **3B the screen:**
     - A Translate mode next to Build / Design.
     - Languages on the left (progress, add, remove).
     - The grid: English vs language, Done / Missing / Check, search, All / Needs work / Done.
     - Rich-text rows use the Studio's rich-text editor.
     - Preview in <language>.
     - The "language menu on the form" toggle waits for PR 4 (the switcher).
   Superseded scope, kept for the record: **file round-trip:** the Languages section in the Settings drawer, CSV export and import with the
   summary and stale flags, publish warning.
4. **Switcher + response language:** mock → switcher, `Language__c` on both response objects, report type
   column.

## Tests

- **Jest:**
  - `resolveLanguage` order and fallbacks (`fr-CA` → `fr`, unknown → default);
  - `localizeSpec` swaps every inventoried property and falls back per key;
  - the inventory guard;
  - CSV export/import round-trip, including commas, quotes, line breaks and accents;
  - switching language keeps answers and the page.
- **Apex:**
  - `FinalRuntimeLabels` returns English when no translation exists, and is callable as guest;
  - the submit path stores `Language__c`, coerced to the default when not offered.
- **Org (Studio host + a guest link):**
  - a French survey via `?lang=fr` and via a French browser;
  - the switcher on 2 layouts;
  - a published guest form shows French without a republish of the theme;
  - a response shows `Language__c = fr`.

## Done when

All four PRs are merged, checked on `/apex/FinalStudio` and on the public site, and DEFERRED #4 is marked
done in the last PR.
