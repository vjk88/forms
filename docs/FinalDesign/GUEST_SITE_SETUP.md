# Guest form site setup (Phase A2)

How to stand up a public LWR Experience Cloud site that serves final\* forms to
anonymous visitors, and how to embed one in an external website. **Configuration,
not code** — the code (guest controller family, host component, viewer delegate
contract) ships in Phases A1–A2; this is the org setup that turns it on.

Plain language: _guest / anonymous_ = a visitor with the link and **no Salesforce
login**. Everything they can reach runs through ONE hard-gated Apex class
(`FinalGuestController`); nothing else in the app is exposed.

---

## 0. Prerequisites

- The form is **published** (Publish in the studio stamps `Status = Published`).
- Its **Public link** is ON — the studio toggle, or
  `FinalStudioController.setGuestAccess(formId, true)` (Phase A1.5). Publishing
  alone exposes nothing; this second switch is deliberate.

## 1. Create (or reuse) an LWR site

Setup → **Digital Experiences → All Sites → New** → pick a **Build Your Own
(LWR)** template. (An Aura template works too — the server family is host-agnostic
— but LWR is the recommended engine for public forms.) The org already has an LWR
site at `rev-5e-dev-ed.develop.my.site.com`; you can reuse it.

## 2. Turn on public (guest) access

Site → **Administration → Preferences** → check **"Allow guest users to access
public APIs / pages"** (Public Access). Then Builder → **Settings → General →
Public can access the site**.

## 3. Grant the Guest User profile EXACTLY one Apex class

Site → **Administration → Pages → (Guest profile)**, or Builder →
**Settings → Guest User Profile → Apex Class Access**:

- **Add:** `FinalGuestController` — the only class the guest needs. It reads the
  published spec (projected — no field/object names), and inserts the response in
  system mode behind its hard gate.
- **Do NOT add:** `FinalSpecController`, `FinalSubmitController`,
  `FinalStudioController`, or any other class. The guest path is deliberately a
  single, minimal, auditable surface (this matters for the AppExchange Security
  Review).

> Object/field permissions: the guest profile needs **no** CRUD/FLS on the
> target object. `FinalGuestController` inserts in `SYSTEM_MODE` with the
> published spec as the allow-list, so guests own nothing and can name nothing.

## 4. Place the host on a page

Experience Builder → drag **"Final Guest Form Host"** (`c/finalGuestHost`) onto a
page. Set its **Form Id** property, OR leave it blank and pass `?formId=<id>` in
the URL (the URL parameter wins, so one page can serve any form). Publish the
site.

The guest-facing URL looks like:
`https://<your-site-domain>/<page>?formId=a0Xxxxxxxxxxxxx`

A form that isn't published, doesn't have Public link on, or has no active version
renders a single generic **"This form is not available."** — never a reason (no
gate oracle).

## 5. Images

Config images (logo, background) uploaded **while the form was private** are
internal-only until the Public-link toggle re-mints them
(`setGuestAccess(true)` creates the public links, and the guest projection
rewrites the URLs at serve time — Phase A1.5 / A1). If a guest sees a broken
image, confirm Public link was toggled **after** the image was uploaded, or
re-save the toggle to re-mint.

---

## 6. Embedding in an external website (iframe)

> The postMessage height bridge + copy-paste snippet arrive in **Phase A4**. This
> section is the site-side configuration that A4 builds on.

### Allow the embedding domain (clickjacking)

By default Salesforce refuses to be framed. Site → **Administration →
Security & Privacy → Clickjack Protection** (and **CSP / Trusted Sites** for
`frame-ancestors`): add the **specific external domain** that will embed the form.
Framing stays blocked for every other domain — that's the desired posture, not a
limitation.

### Minimal embed (fixed height, no script)

```html
<iframe
  src="https://<your-site-domain>/<page>?formId=a0Xxxxxxxxxxxxx"
  style="width:100%;height:800px;border:0"
  title="Form"
></iframe>
```

A responsive auto-height version (listening for the A4 height message) ships with
Phase A4.

### Known risk — third-party cookies

Even on the guest path, an LWR site may set session/CSRF cookies. Browsers
increasingly block third-party cookies in iframes by default. **If the form
renders but submit silently fails inside an iframe, suspect blocked third-party
cookies before assuming a code bug** — test the same URL top-level (not framed)
to confirm.

---

## Checklist

- [ ] Form published + Public link ON
- [ ] LWR site with public/guest access enabled
- [ ] Guest profile → Apex access → `FinalGuestController` ONLY
- [ ] `c/finalGuestHost` placed, Form Id set (or `?formId=` used)
- [ ] Site published; guest URL loads the form in an incognito window
- [ ] (Embed) embedding domain allow-listed for framing
- [ ] (Embed) submit verified in an incognito iframe (third-party cookies)
