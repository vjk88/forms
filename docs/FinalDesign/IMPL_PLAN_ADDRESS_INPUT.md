# Address question with address search (replaces DEFERRED #1 Maps)

Status: **PLAN, awaiting go-ahead** (2026-11-21). Mock: [mocks/address-input-mock.html](./mocks/address-input-mock.html)
(owner: "Looks good, plan it").

## Rulings (owner, 2026-11-21)

1. **No maps** (#1 stays dropped). New input instead: an **Address** question.
2. Salesforce's built-in lookup (`lightning-input-address show-address-lookup`) is assumed not to
   work for us: its docs say it isn't supported in Experience Builder sites or Lightning Components
   for Visualforce (our public site and the Studio preview), and Maps and Location Settings is
   reportedly unavailable in Developer Edition. **We build our own address search.**
3. **Bring your own key, any provider.** The customer gets their own API key. v1 ships adapters for
   **Google Places and Loqate**. **Mapbox is dropped from v1** (owner, after the spike: Mapbox only takes
   its key in the web address, which a Named Credential can't fill). Any other provider, Mapbox
   included: the customer writes an Apex class against our `global` interface.
9. **The key is entered in Setup**, following the Settings screen's steps as mocked, not pasted into
   our screen (owner, after the spike showed both are possible).
4. **Survey + Freeform only.** Forms keep their object's separate address fields.
5. **Guests can search**, switched on **per question**, with a cap on searches.
6. **Required** means **Street, City and Country**; State / Province and Zip / Postal code stay optional.
7. Author options on the question: label, help, required, and **Address search on/off**. Nothing else in v1.
8. Setup lives on a **new org-wide Settings tab**; Address search is its first section.

## What the respondent sees (mock A/B)

- A search box ("Search for an address") above five fields: Street (2 lines), City, State / Province,
  Zip / Postal code, Country.
- Typing 3+ characters (after a 300 ms pause) lists up to 5 matches; picking one fills the fields.
  The fields stay editable, and typing the address by hand always works.
- A provider "group" result (Loqate returns e.g. a whole street or building) opens its addresses
  instead of filling.
- The provider's credit line sits under the list ("Results by Google"). **Check in slice 3:** Google's
  terms may require their logo image rather than text when no Google map is shown.
- When search is off, not set up, failing, or over its cap: no search box, or a one-line note
  ("Address search isn't available right now. Type the address below."). **Never a blocked form.**
- The same on every host: Lightning pages, the Studio preview and the public site.

**Engineering call, said plainly:** the five fields are five `lightning-input` base components, not
`lightning-input-address`. Its docs say `required` "displays a red asterisk on every address field"
and isn't enforced, so it can't show ruling 6 (three required, two optional). Without its lookup,
it offers nothing the five inputs don't. The look is the same SLDS input look; the respondent theme
styles them like every other field.

## Architecture

```
browser (c/finalAddressInput)          Apex                               provider
  search box ──suggest(text, session)──▶ FinalAddressController (signed in)
                                        FinalGuestController.addressSuggest (guest: ticket + caps)
                                          └▶ FinalAddressService ─▶ FinalAddressProvider adapter
                                                                     └ callout:Final_Address_<X> ─▶ API
  pick ───────details(id, session)────▶ same path ─▶ normalized FinalAddressResult
```

- **The key never reaches the browser.** Each provider has a packaged **External Credential + Named
  Credential** pair; the admin pastes the key into the External Credential's principal in Setup.
  No CSP Trusted Sites or Remote Site Settings are needed, because the browser never calls the
  provider.
- **Session billing.** The browser makes a random session id when the search box gets focus and sends
  it with every suggest and with the details call (Google bills one session per address).
- **Guard rails in `FinalAddressService`:**
  - queries are trimmed to 100 characters and need 3 or more
  - results are capped at 5, and every part is stripped of markup and cut to the lengths below
  - provider errors become plain codes: `FINAL_ADDR:NOT_SET_UP`, `NO_KEY` (provider chosen, no key entered yet; measured: the platform says "Field Final_Address_Google.Key does not exist"), `KEY_REFUSED`, `NO_ACCESS`,
    `DOWN`, `LIMIT`
  - **the question must exist on the form's published spec with search switched on**, so the
    endpoint can't be used as a free geocoder for anything else.

### The plug-in interface (packaged, `global`)

```apex
global interface FinalAddressProvider {
    List<FinalAddressSuggestion> suggest(FinalAddressQuery q);       // text, sessionToken, container
    FinalAddressResult details(String id, String sessionToken);
}
// FinalAddressSuggestion: id, title, subtitle, isGroup (Loqate containers)
// FinalAddressResult: street, city, province, provinceCode, postalCode, country, countryCode,
//                     latitude, longitude
```

Adapters: `FinalAddressGoogle` (Places API (New): `places:autocomplete` + place details with a field
mask; key in the `X-Goog-Api-Key` header), `FinalAddressLoqate` (Capture Interactive Find/Retrieve; key in the POST body;
groups via `Container`). "Your own": `Type.forName(className)` must implement the interface, or
Settings refuses to save it.

### Settings storage

- New **protected List custom setting `Final_Settings__c`**, one record named `org`:
  `Address_Provider__c` (None / Google / Loqate / Custom) and `Address_Apex_Class__c`.
  This is the same pattern as `FinalLinkSecret__c`.
- Read by everyone through `FinalAddressService` (server side only). Written only by
  `FinalSettingsController`, which requires a new custom permission `Final_Manage_Settings`
  (granted in `Form_Builder_Admin`).

### Access

- New permission set **`Final_Address_Search`**: access to the three External Credential principals
  plus `FinalAddressController`.
  - The admin assigns it to the public site's guest user and to the signed-in users who fill forms.
  - `Form_Builder_Admin` gets the same principal access, so Test connection and the Studio preview work.
- The Settings screen's step 3 says this; Test connection names a missing assignment
  (`NO_ACCESS`: "This user can't use the key yet. Assign the Final Address Search permission set.").

### Guest caps (fixed in v1; no settings UI)

- Guest search calls carry the page's bot-check ticket.
  - New `FinalGuestTicket.verifySigned(ticket, formId)` checks signature, form and expiry only. There is
    no proof of work or 2-second wait, and the ticket isn't used up; that still happens only on submit.
- Per ticket: **30 suggests and 5 picks** (Platform Cache counters in `local.FinalGuest`, keyed by a
  hash of the ticket).
- Org-wide guest ceiling: **3,000 searches per hour** (one cache counter). It protects the customer's
  bill if someone mints tickets in a loop.
- **Fail closed** for caps: if the cache is unavailable, search answers `LIMIT` and the respondent
  types the address. This is unlike the replay marker, which fails open, because a cap that isn't
  enforced spends money.
- Signed-in users: no cap (licensed users, Studio authors).

## The answer

- The value in the browser and in the payload is an object:
  `{street, city, province, provinceCode, postalCode, country, countryCode, latitude, longitude}`.
  Latitude and longitude are only kept when the parts came from a pick and weren't edited afterwards.
- Lengths (server and browser alike, matching Salesforce's standard address fields):
  - street 255
  - city 40
  - province 80
  - postal code 20
  - country 80
  - codes 10
- The server re-sanitises the payload: unknown keys are dropped, strings only, and latitude/longitude
  must be in range.
- **Storage:** new field **`Value_JSON__c`** (Long Text 32768) on `Form_Response_Answer__c` and
  `Form_Submission_Answer__c` holds the parts. `Text_Value__c` holds the formatted address (one line
  per part), so reports and list views read well. Freeform's `Answer_Type__c` gets a new value
  **`Address`**. Today a Map value would fall through to `String.valueOf` (Apex map text), so this
  is an explicit branch in `FinalSubmitService.writeUntypedValue` / `writeTypedValue`.
- **Blank** = every part empty. **Required** = street, city and country filled. Server
  (`FinalAnswerValidator.requiredFailure` + `isBlank`) and browser
  (`finalExpressionEngine.validateElement`) change together (browser parity).
  - The error names the first empty part: "Where should we send…: City is required." In the blocked
    list it shows as the question name, like other browser checks.
- **Hidden answers excluded:** unchanged; an address hidden by a rule is dropped from the payload
  like any answer.

## Studio

- **Palette:** new **Address** item (`utility:location`, "A postal address, with optional address
  search"). It goes in Survey's single list and Freeform's "Questions" group.
- **Mint:** `questionAddress` becomes `type: 'field'`, `config.inputType: 'address'`, and
  `config.addressSearch: true` when the org has a provider (otherwise false).
  - Lists to extend, from the code map: `finalBuilderCanvas` labels / `SURVEY_QUESTION_TYPES`,
    `FinalSubmitService` `answerTypeOf` / `valueKind`, `FinalPublishWarnings`, `finalSurveyMapping`,
    `finalPropertyPanel`, `finalFormViewer`, and the server spec allow-list if it checks `inputType`.
- **Inspector (mock C):** the existing label / help / required, plus an **Address search** toggle with
  its hint.
  - Not set up: the toggle is off and disabled, with "No address search is set up for your
    organisation, so people type the address. An admin can set it up on the Settings tab."
  - The Validation editor's pattern presets are hidden for Address.
- **Renderer:** a new `isAddress` getter and template branch drawing a new **`c/finalAddressInput`**.
  The search listbox is a small new ARIA combobox modelled on `finalLookup`. That one is tied to
  record search, so its markup and keyboard handling are copied, not imported.
- **Rules:** an Address question as a rule source offers **is empty / is not empty** only
  (`OPERATORS_BY_TYPE.address`). The engine's blank check uses the same "every part empty" rule.
- **Freeform mapping (mock D):** `describeQuestions` lists an Address question as several sources:
  - "Answer: Shipping address → City", and so on for each part
  - value `answer:<key>.city`, answerType `Text`
  - latitude and longitude are `Number`
  - **Country code** suits State/Country picklist code fields

  `FinalMappingRules.valueOf` / `answerValue` read the part from `Value_JSON__c`.
  `COMPATIBLE` is unchanged.
- **Submission reader:** an `Address` case shows the formatted lines.
- **Translations:** new runtime labels in all four places (labels XML, `defaults.js`, `finalTranslate.js`
  imports, `RUNTIME_LABEL_NAMES`):
  - the five part names
  - "Search for an address"
  - "No matching addresses"
  - "Address search isn't available right now. Type the address below."
  - "{part} is required."

## Settings tab (mock E)

- New tab **Final Settings** with LWC `finalSettings` (Studio tokens, top bar → rail → pane). The
  rail's first and only section is Address search.
- It holds:
  - the Provider dropdown
  - the provider's three numbered setup steps, naming its External Credential
  - an Apex class box for "Your own"
  - **Test connection**, a real suggest for "1 Market St" run as the admin
  - **Save**

  Test connection's result uses the Saved/Failed wording from the design system. If a pattern is
  missing, it's added to DESIGN_SYSTEM.md in the same PR.

## Slices (one branch + PR each)

0. **Spike: DONE 2026-11-21** (throwaway Spike_Echo credential + classes + permission set, all deleted
   afterwards). Findings:
   - External + Named Credentials (Custom protocol, one named principal) **deploy to this Developer
     Edition org**.
   - A stored key **is filled into a header** (`AuthHeader` parameter with
     `{!$Credential.<Ext>.Key}`) **and a body** (`allowMergeFieldsInBody`), signed in or as a guest.
   - **It is not filled into the web address**: the merge text is sent literally, encoded or not.
     So Mapbox was dropped.
   - **A guest user can call out.** It needs a permission set holding: the principal access, **Read
     on User External Credentials** (`UserExternalCredential`; without it the callout fails with
     "You don't have read permissions on the User External Credential object") and the Apex class.
     `Final_Address_Search` therefore includes that object permission. Signed-in users need it too.
   - Apex can save a key into the credential (`ConnectApi.NamedCredentials.createCredential`), and
     nobody can read it back. Not used, by ruling 9.
   - The site only runs Apex its published pages already use (a new class got "The Apex request is
     invalid"), so guest address calls go through `FinalGuestController`, as planned.

   Original questions, for the record:
   - Does a merge field resolve in the **URL query** of a Named Credential callout? Salesforce
     documents headers and bodies only, and Mapbox takes its token in the URL.
   - Can the guest user call out once given principal access?
   - Do External Credentials deploy to this Developer Edition org?

   **If Mapbox can't keep its key in a credential, that's a product call for the owner**, not a
   silent fallback.
1. **Infra: BUILT (branch feat/address-search-infra).** Apex names: `FinalAddressService.AddressException` (Apex requires the "Exception" suffix), constant `LIMIT_REACHED` holds code `LIMIT` (`LIMIT` is reserved).
   - interface, Google adapter, `FinalAddressService`, `FinalAddressController`
   - credentials metadata, `Final_Settings__c`, permission set and custom permission
   - Apex tests with `HttpCalloutMock`, for each error code and the "question must have search on"
     check
2. **Settings tab: BUILT (branch feat/address-settings-tab).** `finalSettings`, `FinalSettingsController`, custom permission `Final_Manage_Settings`, tab `Final_Settings`. Google gets 4 steps after the UX review (billing on, no "Websites" key restriction, the parameter named exactly `Key`, the permission set). Verified on the LEX tab: NO_KEY message, Saved, field errors for a blank or unusable Apex class, 200% zoom.
3. **The question: BUILT (branch feat/address-question).** Verified in the Studio preview with a throwaway canned provider (deleted afterwards): search, keyboard pick, group drill-down, two-line street, required stars.
   - palette, mint, inspector, renderer and `finalAddressInput`
   - storage (`Value_JSON__c`, `Answer_Type__c`)
   - validation on both sides, rules, submission reader, labels

   Verified in the Studio preview and a LEX page with a real Google key.
4. **Guest search:** `addressSuggest` / `addressDetails` on `FinalGuestController`, `verifySigned`, caps. **BUILT (branch feat/address-guest-search).**
   Verified on the public site after a site publish.
5. **Freeform mapping of parts.**
6. **Loqate adapter** (groups included).

Each UI slice runs the uiux-flow-reviewer gate and ships before/after photos.

## Tests

- **Apex:**
  - each adapter against recorded JSON (`HttpCalloutMock`): suggest, details, group, key refused, 5xx
  - the service's trimming, sanitising and question check
  - guest caps, including the cache being unavailable (fail closed)
  - validator required/blank and length parity cases
  - submit storage for survey and freeform
  - mapping of each part
- **Jest:**
  - `finalAddressInput`: debounce, minimum characters, keyboard and listbox ARIA, pick fills,
    an edit drops latitude/longitude, error modes show the note, never blocking
  - inspector toggle disabled state
  - rule operators
  - engine parity
  - labels sync
- **Live:**
  - Studio preview
  - a LEX page
  - the public site as a guest, including reaching the cap
  - a Freeform submission mapping City to `MailingCity`

## Not in v1 (parked as DEFERRED rows when this ships)

- Address on object-bound Forms.
- Default country.
- Limiting results to countries.
- Hiding parts.
- State/Country dropdowns.
- Prefill / Autofill of an address.
- Rules on individual parts ("Country equals US").
- Deliverability checks.
- A guest cap setting on the Settings tab.
