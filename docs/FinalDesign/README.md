# FinalDesign — where things live

The source of truth for the rebuild. Three places:

## Core (this folder)

| Doc                                                                | What it's for                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| [FORM_SPEC_SCHEMA.md](./FORM_SPEC_SCHEMA.md)                       | The form spec: every field a saved form can hold          |
| [RUNTIME_NOTES.md](./RUNTIME_NOTES.md)                             | Runtime rules (security, guests, native components). Law. |
| [DATA_MODEL_DELTA.md](./DATA_MODEL_DELTA.md)                       | Objects and fields                                        |
| [ARCHITECTURE_LAYOUTS_THEMES.md](./ARCHITECTURE_LAYOUTS_THEMES.md) | How layouts and themes work                               |
| [COMPONENT_CATALOG.md](./COMPONENT_CATALOG.md)                     | Every component and what it does                          |
| [BUILD_PHASES.md](./BUILD_PHASES.md)                               | The phase plan (P0–P7)                                    |
| [PENDING_WORK.md](./PENDING_WORK.md)                               | Everything still to do before ship, in order              |
| [DEFERRED.md](./DEFERRED.md)                                       | Parked items and why                                      |
| [GUEST_SITE_SETUP.md](./GUEST_SITE_SETUP.md)                       | How to set up the public site                             |

## [specs/](./specs/) — contracts you still build against

Studio IA, builder surfaces, canvas rules, keyboard, Design panel layout, layout refinements, preview
session, record context, survey object, guest/prefill/lookup, hosting adapters, and plans that are
still open (file upload, guest file upload, record-page edit).

## [archive/](./archive/) — done or dead

Shipped implementation plans, finished reviews and audits, proof write-ups, old HTML mockups and
session logs. Kept for history; nothing here is current.

**Rule:** when a plan ships, move it to `archive/`. When a spec stops binding, move it too.
