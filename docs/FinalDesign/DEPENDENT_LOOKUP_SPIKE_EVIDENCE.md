# Slice 0 evidence — what `lightning-record-picker` actually does

Run 2026-09-11 against `rev-5e-dev-ed`, API 61.0, throwaway `c/finalLookupSpike`
driven by Playwright. This is the gate
[IMPL_PLAN_DEPENDENT_LOOKUP](./IMPL_PLAN_DEPENDENT_LOOKUP.md) §3 requires before
substantial development. Observed behaviour, not documentation.

Fixtures are the stock dev-org sample data: **Edge Communications** (Rose
Gonzalez, Sean Forbes) and **United Oil & Gas Corp.** (Arthur Song, Avi Green,
Lauren Boyle, Stella Pavlova). Searching `S` under each account is the proof —
an unfiltered search for `S` would return Sean, Stella and Siddartha Nedaerk
together.

## Host results

| Host                                                       | Result                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Internal Lightning app page (`/lightning/n/Final_P0_Test`) | **PASS.** Filter, dependency, clear, validity all confirmed below. |
| Studio host — Lightning Out inside Visualforce             | **PASS.** Mounted, searched, and filtered. Zero console errors.    |
| Logged-in Experience Cloud (LWR)                           | **NOT TESTED — no test user exists.** See "Open gate".             |

The Studio result is the significant one: the plan budgeted for a _simulated_
preview in case the native picker could not run under Lightning Out. It can.
Proof page `/apex/FinalLookupSpikeOut` (aura dependency app `c:finalLookupSpikeOut`)
mounted two pickers, fired `ready`, searched Accounts, and then returned exactly
`Sean Forbes / CFO` for contact search `S` with the Account filter applied. No
simulated preview is needed, and no custom search provider is needed for Studio.

## Confirmed behaviours

1. **The filter is honoured.** `S` under Edge Communications returned only
   `Sean Forbes`. The same search under United Oil & Gas Corp. returned only
   `Stella Pavlova`.
2. **A filter change on a live instance re-queries.** The generation counter
   stayed at 0 across the whole run — the component was never remounted. Passing
   a new `filter` object identity was enough.
3. **A stale selection SURVIVES a filter change.** After switching Edge →
   United Oil, the contact picker still displayed `Sean Forbes` and still
   reported his Id. **The control never validates its own value against the
   current filter.** This is the direct evidence for the plan's §5 rule that
   dependency changes must clear the child ourselves, and for §7's warning that
   setting a value does not prove membership.
4. **`disabled` preserves the existing value.** Clearing the Account disabled
   the contact input but left `Sean Forbes` displayed and selected.
5. **`displayInfo.additionalFields` renders.** Options showed `CFO` and
   `SVP, Production` beneath the name.
6. **`matchingInfo.primaryField` with `mode: 'startsWith'` matched as documented.**
7. **The `ready` event fires** on mount, once per instance.
8. **A selected picker shows a pill, not a typeable input.** Clearing is a button
   titled `Clear <label> Selection`. Any test or focus logic that assumes a
   permanently typeable input is wrong.

## Two plan assumptions corrected

The plan says: _"Do not assume a native `checkValidity()` exists or that native
`reportValidity()` returns a boolean."_ On this org, at API 61, both exist and
both return real booleans. A required, empty, untouched picker returned `false`
from both; a non-required one returned `true`.

The full public method surface is:

```
blur  checkValidity  clearSelection  focus  reportValidity  setCustomValidity
```

**`clearSelection()` is public.** The dependency engine can clear a child
directly and does not need the remount-by-key trick for the ordinary clear path.
Remount stays reserved for a genuine identity/generation change (new policy,
new respondent token), where discarding queued native events is the point.

`finalRecordLookup` still owns a wrapper-defined validity result, because it must
also account for pending policy state and `unavailableMessage` — states the
native control knows nothing about. But it can now delegate to the native
booleans instead of defending against their absence.

## Open gate

**Logged-in Experience Cloud (LWR) is unverified.** The org has no community
user: the only non-standard active user is the TestSite guest. Licenses are
available (Customer Community Plus, 20 unused), so this is a fixture problem,
not a platform limitation. Creating one requires a contact-enabled portal user
and a profile, which is org configuration this spike did not make.

What is at risk there is GraphQL search under a portal user's permissions, not
the component contract, which items 1-8 establish independently of host. Do not
release authorable filters to an Experience Cloud audience until this is run.
Anonymous guests are unaffected: `finalLookup` refuses lookup entirely for them.

## Throwaway artifacts

These are committed only so the outstanding LWR gate can be run without
rebuilding the rig. **Delete them once that gate closes** — nothing in the
product imports any of them.

- `lwc/finalLookupSpike/`
- `aura/finalLookupSpikeOut/`
- `pages/FinalLookupSpikeOut.page` (+ meta)
- `flexipages/Final_Lookup_Spike` and `tabs/Final_Lookup_Spike`
  The temporary `c:finalLookupSpike` entry on the `Final_P0_Test` flexipage was
  already reverted and redeployed after slice 1.
