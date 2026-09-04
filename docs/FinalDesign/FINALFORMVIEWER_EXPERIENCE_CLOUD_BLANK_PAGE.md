# finalFormViewer — blank page on Experience Cloud tab-away/tab-back

**Status:** **RESOLVED.** Option B shipped 2026-07-19 (commit `8322481`, on `main`) and live-verified on the guest site 2026-09-03 — see §8.
**Reported:** 2026-07-19, on `https://rev-5e-dev-ed.develop.my.site.com/`
**Component:** `c/finalFormViewer` (the P0 rebuild viewer, freshly exposed to Experience Cloud — see commit `4419ca4`, 2026-07-11)

---

## 1. Symptom

The community page renders the form correctly on first load. Navigate away to another tab/page within the site and come back, and the page goes blank — no error banner, nothing. Never seen before; this is the first time `finalFormViewer` has been placed on an Experience Builder page.

## 2. Console evidence

Captured from the live site on the second (broken) render:

```
⚠ An iframe which has both allow-scripts and allow-same-origin for its sandbox
  attribute can escape its sandboxing.
✖ Uncaught TypeError: Failed to construct 'HTMLElement': Illegal constructor
    at new i (elements.js:1:205)
    at new u (elements.js:1:854)
    at Zp.upgrade (lwr_bootstrap_locker:17:3200)
    at Zp.scheduleOrUpgrade (lwr_bootstrap_locker:17:2913)
    at new r (lwr_bootstrap_locker:17:4458)

⚠ An iframe which has both allow-scripts and allow-same-origin for its sandbox
  attribute can escape its sandboxing.
✖ Uncaught TypeError: Cannot read properties of undefined (reading 'getDefinition')
    at i.connectedCallback (lwr_bootstrap_locker:17:4814)
    at i.insertBefore (lwr_lwc:10:15345)
    at Object.ie [as insert] (lwr_lwc:10:10437)
    at et / is / ge / Je / fs / no (lwr_lwc:8:...)
```

Both errors are each immediately preceded by the sandboxed-iframe warning — i.e. the runtime is standing up a fresh isolated execution context (LWR's Locker sandbox) on the second navigation, twice.

## 3. Root cause

`finalFormViewer` renders its page-navigation shell as a **dynamic component**, not a plain tag:

```html
<!-- finalFormViewer.html:33-34 -->
<lwc:component
    lwc:is={navCtor}
    ...
```

`navCtor` is resolved via a lazy `import()` in the layout registry:

```js
// finalLayoutRegistry.js
scroll:   { load: () => import('c/finalNavScroll') },
stepper:  { load: () => import('c/finalNavStepper') },
tabs:     { load: () => import('c/finalNavTabs') },
accordion:{ load: () => import('c/finalNavAccordion') },
rail:     { load: () => import('c/finalNavRail') },
oneAtATime:{ load: () => import('c/finalNavOneAtATime') },
splitHero:{ load: () => import('c/finalNavSplitHero') }
```

`<capability>lightning__dynamicComponent</capability>` in `finalFormViewer.js-meta.xml` is only required for this `lwc:is` pattern — confirming this is the mechanism in play.

**The `_loadedKey` guard is the likely trigger for reuse of a stale class reference:**

```js
// finalFormViewer.js:113-139 (_load)
const key = `${formId}|${versionId}`;
if (key === this._loadedKey) {
  return; // skips re-running _apply() — navCtor is NOT re-derived
}
```

If the component instance survives the tab-away/tab-back navigation (rather than being destroyed and freshly recreated — plausible under LWR's page-level caching), `connectedCallback` re-fires but `_load()` short-circuits on the unchanged `formId`/`versionId` key, so `_apply()` never re-runs and `navCtor` keeps pointing at a class object constructed against the **old** iframe/Locker realm. When LWC then tries to reinsert/upgrade a custom element using that stale class against the **new** realm's registry, the browser refuses (`Illegal constructor`), and LWC's own internal registry lookup for that class comes back empty (`getDefinition` undefined).

Supporting evidence this is specific to the dynamic-construction path, not LWC/LWR in general: the sibling static children in the same template — `c-final-page-frame`, `c-final-form-header`, `c-final-after-submit`, `c-final-submit-bar` — are all ordinary statically-imported tags going through LWC's normal element-upgrade path, and none of them break across this same navigation.

**This is new territory for the codebase** — grepped for `lwc:is`, `lwc:dynamic`, `Illegal constructor`, `getDefinition`, `bfcache`, `page caching`: no prior mentions anywhere in the repo or docs. Confirmed via `git log` that `finalFormViewer`'s Experience Cloud targets were added today (commit `4419ca4`) — first time this pattern has ever been exercised through LWR's SPA navigation.

## 4. Fix options

### Option A — Go fully static

Replace `<lwc:component lwc:is={navCtor}>` with a static `lwc:if`/`lwc:elseif` chain, one branch per layout, all 7 nav primitives statically imported at the top of the file. Removes the `lwc:is` dynamic-construction path entirely — sidesteps the bug class outright, same mechanism the already-working static siblings use.

**Real cost (corrected — see §5 for the walk-back on an earlier "negligible" claim):**

| Component          | JS  | HTML | CSS | Total lines                                    |
| ------------------ | --- | ---- | --- | ---------------------------------------------- |
| finalNavScroll     | 39  | 17   | 20  | 76                                             |
| finalNavStepper    | 143 | 58   | 245 | 446                                            |
| finalNavTabs       | 114 | 46   | 158 | 318                                            |
| finalNavAccordion  | 90  | 43   | 62  | 195                                            |
| finalNavRail       | 159 | 65   | 295 | 519                                            |
| finalNavOneAtATime | 233 | 73   | 184 | 490                                            |
| finalNavSplitHero  | 365 | 120  | 395 | 880                                            |
| **Total**          |     |      |     | **2,924 lines / 85.5 KB raw / ~17 KB gzipped** |

Today (lazy), a visitor pays for exactly one of these (2.5–26.5 KB raw depending on their form's layout) plus one extra network round-trip mid-render. Static means every visitor always pays the full ~17 KB gzipped, with no extra round-trip. Against the LWR runtime + base Lightning components + the always-loaded `finalLayoutZones` → `finalSectionRenderer` → `finalElementRenderer` chain (never lazy, loads regardless of layout choice), ~17 KB is secondary but not nothing — especially for a guest-facing embed on an external site where every KB and round-trip counts more than inside the LEX shell.

### Option B — Fix the actual stale-reference mechanism, keep lazy loading

Force `navCtor` (and the rest of `_apply()`'s state) to always re-resolve fresh on every `connectedCallback`, instead of trusting a cached instance-field value across a reconnect. Cheap, small change, preserves the lazy-load savings.

**Risk:** effectiveness depends on whether the real root cause is "our own stale reference across a surviving instance" (fixed by this) vs. a deeper platform-level module-cache-outlives-the-iframe issue (not fully fixed by this alone). Only confirmable by live testing on the actual site.

### Option C — Disable Experience Builder page/route caching for the site

Forces full teardown/rebuild on every navigation. Rejected — site-wide performance hit for a page-specific bug.

## 5. Correction made mid-conversation

Initial recommendation (before quantifying) understated the cost of Option A — only JS line counts were checked (1,135 lines total), HTML/CSS were skipped. Real total is 2,924 lines / 85.5 KB raw / ~17 KB gzipped, roughly 2.5x the JS-only figure and in the range the owner's own estimate ("~2000 lines") flagged. Recommendation revised accordingly (see §6).

## 6. Resolution — Option B, shipped

Option B was implemented and merged the same day the bug was reported: commit
`8322481` _"fix: LWR blank page — re-resolve lwc:is navCtor on reconnect (Option B)"_,
2026-07-19, on `main`.

**The change** — `finalFormViewer.js` `connectedCallback` + `_refreshNavCtor()`:

- A `_connectedOnce` instance flag distinguishes the first connect (where the
  normal `_load()` → `_apply()` path owns `navCtor`) from every _re_-connect.
- On reconnect, `navCtor` is set to `undefined` — unmounting the stale element —
  and then re-resolved through `getLayout(type).load()`, so the **current** realm
  supplies the class.
- A `catch` sets a visible "This form could not be loaded." instead of the silent
  blank page, if the chunk fails to load at reconnect.
- Spec, answers, and page position are untouched by the refresh: only the nav
  element remounts.

**Why answers and position survive the remount** (both re-verified in §8):

- Position lives on the viewer, not the nav — `currentPageIndex` is an `@api`
  property the viewer passes down, so the remounted nav is handed it back.
- Answers live in the viewer's `answers` store, and `visiblePages` re-hydrates
  every element from it on every render. That hydration path was independently
  hardened after this fix, when the external audit org-reproduced the sibling
  symptom (native inputs remounting BLANK after **Back** on plain forms,
  2026-08-02) — so the reconnect remount rides on a repro-proven path.

**Option A was not needed** and stays documented above as the fallback if a
deeper platform-level module-cache issue ever surfaces.

**Blast radius:** `finalFormViewer` is the only `final*` component using `lwc:is`
(the sole other repo hit is the legacy `formLayoutEngine`, which dies at P7), so
no other shipping component carries this bug class.

---

## 7. Side-thread: testing the form on external (non-Salesforce) websites

> ⚠️ **SUPERSEDED (2026-09-03) — read this box before acting on §7.** Everything
> below was written on 2026-07-19, when the guest path did not exist yet. It has
> since been built and shipped: **Phase A** delivered `FinalGuestController` +
> `c/finalGuestHost`, and [GUEST_SITE_SETUP.md](./GUEST_SITE_SETUP.md) is the
> current setup guide. §8's verification loaded a published survey as a genuine
> anonymous visitor, so the "not built" premise below is simply out of date.
> **Do not use `c/formViewer` for guest testing** — that legacy workaround is
> obsolete and dies at P7. §7 is kept for history only; the embed cautions in it
> (clickjack allow-listing, third-party cookies) do still apply and are carried
> forward in GUEST_SITE_SETUP.md §6.

Prompted by wanting to validate embedding before committing to a real build-out.

### Key finding _(as of 2026-07-19 — no longer true, see the box above)_: guest/anonymous access is NOT built for `finalFormViewer`

`FinalSpecController.cls` (backs `finalFormViewer`) is `with sharing`, `WITH USER_MODE`, and its own header comment states: _"P0 scope: INTERNAL users only... the guest-facing delivery path arrives in P5 as a separate guarded `without sharing` family."_ An anonymous visitor on an external site hits a wall immediately — this is unbuilt work, already tracked as **DEFERRED #20**, not a config toggle.

### But a guest-safe path already exists — on the older `c/formViewer`

`FormViewerController` (backs `c/formViewer`, the earlier "new respondent experience" component, already Community-exposed) branches transparently on user type:

```apex
// FormViewerController.cls
if (UserInfo.getUserType() == 'Guest') {
    return FormViewerGuest.getGuestViewerForm(formId);
}
```

Same branch exists in `submitViewerForm`. `FormViewerGuest.cls` is described in the code as "explicitly-elevated, hard-gated... kept separate so the elevation surface stays minimal and auditable." This means **`c/formViewer` can be used today for a real, representative anonymous-embed test** — no new backend work, no throwaway insecure spike — while `finalFormViewer`'s equivalent guest path is still pending.

### Step-by-step test plan (given, not yet executed)

1. Confirm the site allows public/Guest access (Setup → Digital Experiences → site → Administration → Login & Registration / Public Access).
2. Grant the Guest User profile read access to `Form__c` / `Form_Version__c` and whatever the target object is — check `FormViewerGuest.cls` for exactly what it expects before granting broadly.
3. Place `c/formViewer` on an Experience Builder page, configured with the test `formId`.
4. Grab the live guest-facing page URL, e.g. `https://rev-5e-dev-ed.develop.my.site.com/.../that-page?formId=XXXX`.
5. Check Clickjack Protection / CSP Trusted Sites (Setup → Digital Experiences → site → Administration → Security & Privacy) — allow framing from the specific external test domain if needed (`frame-ancestors`).
6. Build a throwaway external test page — plain HTML (or CodePen), on an actually-different domain (localhost / GitHub Pages / scratch Netlify), with:
   ```html
   <iframe
     src="https://rev-5e-dev-ed.develop.my.site.com/.../that-page?formId=XXXX"
     width="100%"
     height="800"
   ></iframe>
   ```
7. Open it in an **incognito** window (not just logged-out) — avoids a stray Salesforce session cookie making it look falsely guest-authenticated.
8. Watch Network/Console: confirm Apex calls resolve without an auth challenge, and that submit actually creates a record.

### Known risk to watch for

**Third-party cookies.** Even on the guest path, LWR sites may still set session-tracking cookies (CSRF/rate-limiting). Safari/Chrome increasingly block third-party cookies by default — if the iframe renders but submit silently fails, check this before assuming a code bug.

**Status: plan given, not executed — and now obsolete; see the box at the top of §7.**

---

## 8. Live verification (2026-09-03)

Ran against the real guest site, headless Chromium, no Salesforce session — a
genuine anonymous visitor.

|        |                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Survey | **CSAT Pulse** `a05hk000000pmLxAAI` (Published, `Public_Guest`, layout `oneAtATime`)                                                                                       |
| URL    | `https://rev-5e-dev-ed.develop.my.site.com/form?formId=a05hk000000pmLxAAI`                                                                                                 |
| Site   | LWR `TestSite1` — no URL path prefix, so it serves at the domain root. Both `/form` **and** `/` host `finalGuestHost`, which is what makes an in-site round trip possible. |

**Results — all green:**

| Check                                          | Result                                               |
| ---------------------------------------------- | ---------------------------------------------------- |
| Same viewer instance reconnected               | **YES** — the `_refreshNavCtor()` path genuinely ran |
| Page blank after navigating back               | **no** — full render                                 |
| `Illegal constructor` / `getDefinition` errors | **0**                                                |
| Typed answer survived the reconnect            | **yes**                                              |
| Console errors, total                          | **0**                                                |

### The two traps that produce a false result

1. **A page refresh does not reproduce this bug.** F5 tears the instance down and
   rebuilds it — the path that always worked. The bug requires a _client-side_
   route change so the instance survives into a rebuilt realm. Reloading and
   seeing the form proves nothing. With no nav links on the form page, the
   reliable trigger is to inject an anchor and click it (the LWR router
   intercepts same-origin anchors), then use the browser **Back** button:

   ```js
   const a = document.createElement('a');
   a.href = '/?formId=a05hk000000pmLxAAI';
   a.textContent = 'GO';
   a.style.cssText =
     'position:fixed;top:0;left:0;z-index:99999;background:#ff0;padding:8px';
   document.body.appendChild(a);
   ```

2. **Verify instance identity, or the whole test is meaningless.** `_refreshNavCtor()`
   only fires when a _surviving_ instance reconnects (`_connectedOnce` already
   true). If LWR builds a fresh instance, a green result merely says "a first
   render works," which was never in doubt. Stamp a marker property on the live
   `c-final-form-viewer` DOM element before navigating and assert it is still
   there afterwards.

   A third, smaller trap: **`innerText` does not include a textarea's typed
   value**, so asserting answer survival against page text yields a false
   "answer lost". Read the field `value` properties directly.

### Residual gap

CSAT Pulse is one page / one section, so it renders as a **single screen**. The
blank-page fix and answer survival are fully covered; the _page-position_ half of
the claim is only lightly exercised, because there was no page 2 to be on. To
close that, publish a multi-page survey with the public link ON and re-run the
same procedure.
