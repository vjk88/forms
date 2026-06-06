# Native Surveys — Business & Feature Overview

**Product:** Native Forms & Surveys for Salesforce
**This document:** The **Surveys** half of the product — what a Survey is, how it differs from a Form, every feature, the design thinking (especially the data model and analytics strategy), and an honest map of what's built vs. planned.
**Companion documents:** `FORMS_BUSINESS_OVERVIEW.md`, `PRODUCT_ROADMAP_IMPROVEMENTS.md`
**Status legend:** ✅ Built & deployed · 🟡 Partially built · ⛔ Not yet built (called out inline)

> **Read this first:** Surveys and Forms are two faces of one product and **share the same drag-and-drop builder, versioning, security model, design-token styling, and conditional-visibility engine.** This document focuses on what makes a Survey *different*. For the shared builder mechanics, see the Forms document — they are not repeated here.

---

## 1. What a Survey is, and why it's a separate thing

A **Survey** captures a varying set of questions where you **don't want a Salesforce field (or object) per question**. Think CSAT after a case closes, NPS, event feedback, research questionnaires. The answers are opinions and ratings, not business records.

**The defining test:**
> *"Do these answers need to live as native fields on a business object, with validation and automation?"* → that's a **Form**.
> *"Are these opinion/feedback questions that vary survey-to-survey?"* → that's a **Survey**.

This bright line is a core product decision. It means a "generic form not tied to an object" simply **is** a Survey — which removes a confusing configuration axis. **Storage is implied by type, never asked:**

| | Form | Survey |
|---|---|---|
| Bound to a Salesforce object? | Always (required) | No — answers go to a generic store |
| Where submissions land | Real record on the Primary Object | `Form_Response__c` + `Form_Response_Answer__c` |
| Object selection | Required write target | Optional **context record** the response links to |
| Reporting | Standard object reports | Normalized answer store + (planned) analytics layer |
| Storage choice in the UI | None — implied | None — implied |

---

## 2. Why native Surveys are valuable

The same "100% native, data never leaves Salesforce" advantages as Forms (see Forms doc §2) apply — uniquely important for surveys because **survey responses are often linked to customers and cases** and carry sentiment that companies are sensitive about sending to third-party survey vendors. On top of that:

- **Every response is linked to CRM context** (a Contact, plus optionally an Account/Case/Opportunity/etc.), so feedback is never an orphaned data island — it's attached to the customer record it's about.
- **One builder for both** Forms and Surveys means no second tool to learn.
- **A planned analytics layer** turns heterogeneous surveys into comparable, reportable metrics (and, later, AI sentiment) — natively, without exporting to an external analytics product.

---

## 3. The survey data model

**Definition** reuses the Form objects: `Form__c` (with `Form_Type__c = 'Survey'`) → `Form_Version__c` → `Form_Page__c` → `Form_Section__c` → `Form_Element__c`. A survey is authored in the exact same builder as a form.

**Responses** use a generic, EAV-style answer store:
```
Form_Response__c            one submission
 └─ Form_Response_Answer__c one answer per question
```

**`Form_Response_Answer__c`** is typed to keep answers queryable and reportable — it has separate `Text_Value__c`, `Numeric_Value__c`, `Date_Value__c`, `DateTime_Value__c`, `Boolean_Value__c`, `Selected_Options_JSON__c` (for multi-select), and `Lookup_Reference_Id__c` columns, plus `Element_Key__c` / `Form_Element__c` to tie the answer back to the question. Storing each answer in the right typed column (rather than everything as text) is what later makes numeric scoring and aggregation possible.

**`Form_Response__c`** carries submission metadata (`Submitted_By__c`, `Submitted_Date__c`, `Status__c`, `IP_Address__c`, `Session_Id__c`, `Completion_Time_Seconds__c`) and — importantly — the **record links** below.

### 3.1 Survey responses are always linked to a CRM record ✅ (schema)

A core decision: **a Survey Response should always be tied to at least one Salesforce record** so feedback has context. The implementation uses the most native, most report-friendly approach — **concrete lookup fields on `Form_Response__c`**:

- `Contact__c` — the respondent (the default link)
- `Account__c`, `Case__c`, `Lead__c`, `Opportunity__c`, `Campaign__c` — common context objects
- `Form__c` / `Form_Version__c` — which survey
- **Generic fallback:** `Related_Record_Id__c` + `Related_Record_Type__c` for any object **without** a dedicated lookup (e.g., a custom object) — the "do both" approach the design intentionally chose.

**Design thinking:** Concrete lookups beat a single polymorphic/text reference because they preserve **referential integrity** and **native reporting/roll-ups** (you can report "average CSAT by Account" out of the box). A custom polymorphic lookup can't be created declaratively, and a text-Id-only approach throws away reporting — so the product ships concrete lookups for the common objects **plus** the generic text pair as a catch-all. The survey declares its context object; when the survey is distributed, the link/URL carries the record Id and the matching lookup is populated (this dovetails with the planned guest-render + URL-prefill work).

> **Status:** the schema (all the lookups + the generic pair + FLS in the admin permission set) is **built ✅**. The **runtime that actually writes `Form_Response__c` and populates these links is ⛔ not built yet** — it arrives with the survey submission path / guest-render work. Today the builder can author surveys; the response-capture runtime is the main remaining piece.

---

## 4. Survey-specific authoring features

### 4.1 Survey question types ✅ (builder/palette)

In **Survey mode**, the palette's Components tab surfaces survey-specific question types in addition to the normal fields and display blocks:

| Question type | What it captures |
|---|---|
| **NPS Score (0–10)** | The classic 0–10 Net Promoter rating |
| **Likert Scale** | Strongly Disagree → Strongly Agree (5-point) |
| **Star Rating** | 1–5 stars |
| **Long Text Response** | Open-ended free text |

These render as live previews in the builder canvas (the `fieldPreview` component knows how to draw an NPS row, a Likert scale, a star rating, and a textarea). ⛔ Their **runtime rendering and answer-capture into `Form_Response_Answer__c` is not built yet** — it's part of the survey submission runtime.

### 4.2 Everything from the Forms builder

Surveys get the full builder feature set — pages & navigation, sections, columns, display blocks (Display Text, Image, Callout, Spacer, Divider), the header configuration, section header icons, the completion experience, versioning, save/autosave, preview, and the **conditional-visibility engine** (including the Current User / User Profile / Form Settings sources). See the Forms document for how each works. The **Forms/Surveys split is presented as two primary tabs**, and the selected form/survey is preserved per tab.

### 4.3 The Forms-vs-Surveys tab experience ✅

The builder opens on either **Forms** or **Surveys** as a top-level segmented toggle. The form/version selection is preserved when switching tabs (an early bug where selections were lost on tab switch was fixed), and the New dialog rebrands itself ("New Survey", "Survey Title", "Create Survey", survey-flavored copy) based on which tab launched it.

---

## 5. Analytics & sentiment — the strategic differentiator

This is where Surveys become more than a data-collection tool. The challenge: **different surveys ask different questions, stored EAV-style — how do you extract comparable insight and sentiment?** The answer is a planned **normalization layer** so heterogeneous questions roll up to comparable measures. It's designed as three levels (all approved; build sequencing pending the response runtime):

### Level 1 — Structured measures ⛔ (planned)
Tag each **question** with an analytics role and topic (`Analytics_Role` = Score / Sentiment / Category; `Scale_Min`/`Scale_Max`; `Topic`). At submit time, compute a **`Normalized_Score` on a common 0–100 scale** so a 1–5 CSAT and a 0–10 NPS become directly comparable, sliceable by Topic. No AI required. *(This is why answers are stored in typed columns today — it's the substrate for this layer.)*

### Level 2 — Free-text sentiment ⛔ (planned, design pending)
Score open-ended comments into a Sentiment value. The explicit direction: **use an Agentforce prompt template** to generate a sentiment score onto the answer record. Because the product targets the AppExchange and can't assume a customer has any particular AI entitlement, this will be a **pluggable** scorer (Agentforce/Einstein/LLM/manual). The answer-side fields will be left ready; the prompt-template work is a dedicated future effort.

### Level 3 — Cross-survey comparability via a Question Bank ⛔ (planned)
A shared **`Survey_Question__c` bank** so "How satisfied are you?" is the *same* question entity across many surveys — making responses directly comparable by construction, not by post-hoc mapping. The builder UX will let an author **add a question on the fly to a survey AND push it to the bank** for reuse. This is the gold standard for trending sentiment across an entire survey program.

**Reporting shape:** because the store is EAV, dashboards will be fed either custom report types over Response→Answer exposing the normalized fields, or a small materialized "Survey Metric" fact object — making "sentiment by topic across all surveys" a one-click chart.

---

## 6. What's built vs. planned (Surveys) — honest status

| Capability | Status | Notes |
|---|---|---|
| **Authoring a survey** (full builder, pages, sections, display blocks, visibility, completion, versioning) | ✅ | Shares the Forms builder entirely. |
| **Survey question types in the palette + live preview** (NPS, Likert, Star, Long Text) | 🟡 | Appear and preview in the builder; runtime capture not built. |
| **Forms/Surveys tabbed experience + survey-branded create dialog** | ✅ | — |
| **Response data model** (`Form_Response__c`, typed `Form_Response_Answer__c`) | ✅ (schema) | Objects, typed answer columns, metadata fields. |
| **Response↔record linking** (Contact + Account/Case/Lead/Opportunity/Campaign lookups + generic `Related_Record_Id/Type`) | ✅ (schema) | Concrete lookups + generic fallback; FLS granted. |
| **Survey submission runtime** (render question types, write `Form_Response__c` + answers, populate links) | ⛔ | The principal remaining piece for Surveys. |
| **URL-prefilled context link** (e.g., `?caseId=…` populates `Case__c`) | ⛔ | Ties into the guest-render + URL-prefill roadmap. |
| **Guest / public survey distribution** | ⛔ | Needs the separate elevated guest controller. |
| **Analytics Level 1** (normalized scores + topics) | ⛔ | Designed; depends on the response runtime. |
| **Analytics Level 2** (Agentforce sentiment) | ⛔ | Design session pending; answer fields to be left ready. |
| **Analytics Level 3** (Question Bank + add-on-the-fly) | ⛔ | Designed. |
| **Anonymous responses** | ⛔ | A survey-specific notion to model alongside guest access. |

---

## 7. The bottom line for Surveys

The product treats Surveys as a first-class, native sibling of Forms — same builder, same security, same governance — but with a purpose-built **typed answer store**, **always-linked CRM context** (so feedback attaches to the customer it's about), and a **deliberate analytics strategy** (normalized scores → AI sentiment via Agentforce → a shared question bank) that no external survey tool can match while keeping data 100% inside Salesforce. The **authoring side and the data model are built**; the **response-capture runtime and the analytics layers are the headline remaining work** — and the schema has been laid down specifically to make them straightforward to add.
