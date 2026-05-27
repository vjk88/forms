# Native Forms & Surveys App - Architecture Specification

**Version:** 1.1  
**Last Updated:** 2026-05-26  
**Status:** Draft

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Component Architecture](#2-component-architecture)
3. [Apex Service Layer](#3-apex-service-layer)
4. [Expression Engine](#4-expression-engine)
5. [Security Model](#5-security-model)
6. [Performance & Scalability](#6-performance--scalability)
7. [Error Handling](#7-error-handling)

---

## 1. System Architecture

### 1.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    L1 — DEFINITION LAYER                     │
│  ┌──────────────┐     ┌─────────────────┐                   │
│  │   Builder    │────▶│  Publish Engine │                   │
│  │   (LWC)      │     │     (Apex)      │                   │
│  └──────────────┘     └─────────────────┘                   │
│         │                      │                             │
│         ▼                      ▼                             │
│  Form Definition        Schema Snapshot                      │
│  (Custom Objects)       (Frozen JSON)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     L2 — ENGINE LAYER                        │
│  ┌─────────────────────────────────────────┐                │
│  │         formPlayer (Core LWC)           │                │
│  │  • Context-agnostic renderer            │                │
│  │  • Reads definition + schema snapshot   │                │
│  │  • No DML, no UI API calls              │                │
│  │  • Emits FormPayload events             │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    L3 — ADAPTER LAYER                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Internal   │  │     Flow     │  │  Public/Guest    │   │
│  │   Record    │  │    Screen    │  │     Surface      │   │
│  │   Adapter   │  │   Adapter    │  │     Adapter      │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│        │                 │                    │              │
│        ▼                 ▼                    ▼              │
│   LDS/Apex        Flow Variables      Elevated Apex         │
│  (User Context)   (No DML)           (System Context)       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Core Concepts

**Every form is bound to a Primary Object.** When an admin clicks "New Form," the first step is selecting a Salesforce object from the org (Account, Contact, Opportunity, custom objects, etc.). All sections and fields on the form operate in the context of that object. Without a primary object, there is no form.

**Related objects appear as section repeaters.** Child objects related to the primary object (e.g., Contacts on an Account, Line Items on an Opportunity) can be added as repeatable sections. These use `Context_Type__c = Related_Child` and map to a child relationship on the primary object.

**Form elements are either SObject fields or display content.** An element is either:

- A **Field** — bound to a real Salesforce field via `Field_API_Name__c`. The field type, picklist values, and validation all come from the schema snapshot.
- A **Static_Text** — HTML or rich text content (instructions, warnings, legal text) that displays but submits nothing.
- A **Divider** — visual separator between groups of fields.

### 1.3 Form Layout Modes

Forms support two layout modes, configured per form:

**Single Page** — All sections render on one scrollable page. Sections stack vertically. This is the default for simple forms.

**Vertical Navigation** — Sections render as a vertical menu on the left, with the selected section's content on the right. Navigation via menu clicks or Next/Previous buttons. The final step shows the full form in read-only preview mode, with a Save button to submit.

```
┌─────────────────────────────────────────────────────┐
│  Single Page Mode                                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ Section 1: Account Info                       │  │
│  │  [Name] [Industry] [Type]                     │  │
│  ├───────────────────────────────────────────────┤  │
│  │ Section 2: Address                            │  │
│  │  [Street] [City] [State] [Zip]                │  │
│  ├───────────────────────────────────────────────┤  │
│  │ Section 3: Contacts (repeater)                │  │
│  │  [+ Add Row]                                  │  │
│  └───────────────────────────────────────────────┘  │
│                              [Save]                 │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Vertical Navigation Mode                           │
│  ┌──────────┬────────────────────────────────────┐  │
│  │ Sections │  Section 2: Address                │  │
│  │          │                                    │  │
│  │ ✓ Acct   │  [Street _______________]          │  │
│  │ ► Addr   │  [City ____] [State __] [Zip ___] │  │
│  │ ○ Contac │                                    │  │
│  │ ○ Review │        [Previous]  [Next]          │  │
│  └──────────┴────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Vertical Navigation — Final Review Step            │
│  ┌──────────┬────────────────────────────────────┐  │
│  │ Sections │  Review & Submit                   │  │
│  │          │                                    │  │
│  │ ✓ Acct   │  Account Info          [Edit]      │  │
│  │ ✓ Addr   │  Name: Acme Corp                  │  │
│  │ ✓ Contac │  Industry: Technology              │  │
│  │ ► Review │                                    │  │
│  │          │  Address               [Edit]      │  │
│  │          │  123 Main St, SF, CA               │  │
│  │          │                                    │  │
│  │          │        [Previous]  [Save]          │  │
│  └──────────┴────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 1.4 Data Flow

**Publish Phase (Admin Context):**

<<<<<<< ours

```
1. Admin builds form in Builder
   └─> Sections/Elements stored as records

2. Admin clicks "Publish"
   └─> PublishService.generateSchemaSnapshot()
       ├─> Query UI API for all referenced objects
       ├─> Capture field metadata, picklist values
       ├─> Resolve record type scoping
       └─> Generate JSON snapshot

3. PublishService.compileLayout()
   └─> Query sections/elements tree
   └─> Build Layout_Config__c JSON

4. Create Form_Version__c record
   └─> Copy snapshot + layout
   └─> Set Is_Active__c = true
   └─> Deactivate previous versions
```

**Runtime Phase (Any Context):**

```
1. Adapter loads Form_Version__c
   └─> Single query: definition + snapshot + layout
=======
1. Admin builds form in Builder — sections/elements stored as child records
2. Admin clicks "Publish" — `PublishService` queries UI API for all referenced objects, captures field metadata, picklist values, record type scoping, and generates the schema snapshot JSON
3. `PublishService` compiles the layout (sections → elements tree) into `Layout_Config__c` JSON
4. A new `Form_Version__c` record is created with both JSON blobs. Previous active version is deactivated.

**Runtime Phase (Any Context):**
>>>>>>> theirs

1. Adapter loads the active `Form_Version__c` — single query returns definition + snapshot + layout
2. Adapter constructs a `dataContext` (`{ mode, recordId?, seedValues?, user? }`)
3. Adapter passes definition + dataContext to `formPlayer`
4. `formPlayer` renders the form entirely from the snapshot — no runtime UI API calls
5. On submit, `formPlayer` validates client-side, then emits a `FormPayload` event
6. The adapter handles the payload based on context: Internal does DML in user context, Flow outputs to variables, Public does DML in elevated context

---

## 2. Component Architecture

### 2.1 Builder Components (L1 — Definition Layer)

The form builder follows the pattern from the RMTDev `formPageBuilder` component.

**Builder header layout:**

```

┌─────────────────────────────────────────────────────────────────┐
│ [Form ▾] [New Form] [Version ▾] [New Version] │ Preview │ Activate │ Delete │
└─────────────────────────────────────────────────────────────────┘

```

- **Form selector** — dropdown listing all forms in the org
- **New Form** — opens a modal where admin selects the primary object, enters form name, and chooses layout mode (Single Page / Vertical Navigation)
- **Version selector** — dropdown of versions for the selected form (shows status: Draft/Published)
- **New Version** — creates a new draft from the active version (only enabled when an active version exists and no draft exists)
- **Preview** — opens the form in a preview modal using the formPlayer
- **Activate/Publish** — publishes the draft version (generates schema snapshot + layout config)
- **Delete** — deletes the draft version

**Builder body — three-column layout:**

```

┌───────────────────┬─────────────────────────┬────────────────────┐
│ Field Palette │ Builder Canvas │ Related Records │
│ │ │ │
│ SObject fields │ Sections + Elements │ Related objects │
│ from primary │ Drag/drop, reorder │ from primary obj │
│ object. Drag │ Add/edit/delete │ relationships. │
│ onto canvas. │ sections and fields. │ Drag onto canvas │
│ │ Configure visibility │ to create │
│ Also includes │ rules per section │ repeater section. │
│ Static Text, │ and element. │ │
│ Divider, File │ │ │
│ Upload options. │ │ │
└───────────────────┴─────────────────────────┴────────────────────┘

````

<<<<<<< ours
### 2.2 Component Responsibilities

**formPlayer**

- Top-level orchestrator
- Loads form definition + schema snapshot
- Manages global state (field values, validation errors)
- Handles calculation engine execution
- Handles visibility rule evaluation
- Emits FormPayload on submit

**formWizard**

- Multi-page navigation logic
- Page sequence management
- Skip condition evaluation
- Progress tracking

**formSection**

- Section layout (grid/stack)
- Section-level visibility rules
- Repeater instantiation (if Is_Repeatable)
- Collapsible section behavior

**formSectionRepeater**

- Manages child-context row collections
- Add/remove row buttons
- Min/max row enforcement
- Row indexing for field binding

**formElement**

- Field wrapper with label, help text, validation
- Delegates to specific field renderers
- Client-side validation (required, pattern, min/max)
- Error message display

**formFieldRenderers** (formFieldText, formFieldPicklist, etc.)

- Specific input type rendering
- Reads from schema snapshot (picklists)
- Two-way data binding
- Input override support (Render_As\_\_c)

### 2.3 Lookup and Formula Field Support

**Lookup Fields:**

- **formFieldLookup** component for relationship fields
- Uses Lightning Base Component `lightning-input-field` with `lightning-record-edit-form`
- Reads `referenceTo` from schema snapshot to determine target object
- Supports polymorphic lookups (e.g., WhoId, WhatId)
- Filter support via Render_As\_\_c configuration
- Recent items + search functionality

**Formula Fields:**

- **Read-Only Display** - Formula fields from schema snapshot render as read-only text
- **Client-Side Calculations** - Use `Calculation_Formula__c` for live calculations
- Calculation engine evaluates formulas reactively as dependencies change
- Results displayed but not submitted (formulas calculate server-side on save)

**Implementation Pattern:**

```javascript
// formFieldLookup.js
export default class FormFieldLookup extends LightningElement {
  @api fieldMetadata; // From schema snapshot
  @api value;
  @api required;

  get targetObject() {
    // Read from snapshot: field.referenceTo[0]
    return this.fieldMetadata.referenceTo?.[0];
  }

  get relationshipName() {
    return this.fieldMetadata.relationshipName;
  }

  handleChange(event) {
    this.value = event.detail.value;
    this.dispatchEvent(
      new CustomEvent("valuechange", {
        detail: { value: this.value }
      })
    );
  }
}
````

**Schema Snapshot Enhancement for Lookups:**

```json
{
  "fields": {
    "AccountId": {
      "label": "Account",
      "type": "reference",
      "referenceTo": ["Account"],
      "relationshipName": "Account",
      "createable": true,
      "updateable": true
    }
  }
}
=======
**Key builder interactions:**
- Dragging a field from the palette onto a section creates a `Form_Element__c` with `Type__c = Field` and `Field_API_Name__c` set
- Dragging a related object from the right palette creates a new section with `Context_Type__c = Related_Child` and `Is_Repeatable__c = true`
- Duplicate fields are prevented — a field can only appear once per form
- Sections and elements can be reordered via drag-and-drop
- Each section and element has a gear icon to configure visibility rules, grid layout, and other properties

### 2.2 Player Components (L2 — Engine Layer)

>>>>>>> theirs
```

formPlayer (orchestrator)
├── formSinglePage (single page layout)
│ └── formSection (section container)
│ ├── formElement (element wrapper)
│ │ ├── formFieldText
│ │ ├── formFieldPicklist
│ │ ├── formFieldLookup
│ │ ├── formFieldCustomMultiSelect
│ │ ├── formFieldFileUpload
│ │ ├── formFieldSignature
│ │ ├── formFieldFormula (read-only)
│ │ └── formStaticText
│ └── formSectionRepeater (for Related_Child sections)
├── formVerticalNav (vertical navigation layout)
│ ├── formNavMenu (left sidebar section list)
│ ├── formSection (right content area — one section at a time)
│ ├── formNavButtons (Previous / Next / Save)
│ └── formReviewPage (final step — full form read-only preview)
├── formValidationSummary
└── formConfirmation

```

### 2.3 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **formPlayer** | Top-level orchestrator. Loads definition + snapshot, manages field values and error state, runs calculation engine and visibility rules, emits `FormPayload` on submit. Selects Single Page or Vertical Nav layout based on form config. |
| **formSinglePage** | Renders all sections on one scrollable page. Save button at bottom. |
| **formVerticalNav** | Section-by-section navigation. Left menu shows section list with completion status (checkmark / current / pending). Right side shows current section. Final step is the review page. |
| **formReviewPage** | Read-only preview of all sections before final save. Each section shows an "Edit" link that navigates back to that section. |
| **formSection** | Grid/stack layout (`Grid_Columns__c`), section-level visibility, collapsible behavior, repeater instantiation for `Is_Repeatable` sections. |
| **formSectionRepeater** | Manages child-context row collections. Add/remove row buttons, min/max row enforcement, row indexing for field binding. |
| **formElement** | Field wrapper: label, help text, required indicator, validation, error display. Delegates to specific renderers. |
| **formFieldRenderers** | Type-specific inputs. Read picklists/metadata from snapshot. Two-way data binding. Respect `Render_As__c` overrides. |
| **formStaticText** | Renders HTML/rich text content from `Static_Text_Content__c`. Display only, submits nothing. |
| **formValidationSummary** | Collects form-level errors (triggers, CRUD failures) in an alert banner with clickable links to error fields. |

---

## 3. Apex Service Layer

### 3.1 Service Architecture

```

FormServices
├── PublishService
│ ├── generateSchemaSnapshot(formId)
│ ├── compileLayout(formId)
│ └── createVersion(formId)
│
├── SchemaService
│ ├── getObjectInfo(objectApiName)
│ ├── getFieldInfo(objectApiName, fields)
│ ├── getPicklistValues(objectApiName, fieldApiName)
│ └── getRecordTypeInfo(objectApiName)
│
├── DMLService
│ ├── executeCascade(payload, executionContext)
│ ├── validatePayload(payload)
│ └── assignOwnership(records, defaultOwnerId)
│
├── ValidationService
│ ├── validateFormDefinition(formId)
│ ├── validateSectionHierarchy(sections)
│ └── validateElementMapping(elements)
│
└── ExpressionService
├── evaluateVisibility(expression, context)
├── evaluateCalculation(formula, context)
└── evaluateSkipCondition(condition, context)

````

<<<<<<< ours
### 3.2 PublishService Implementation

```apex
public with sharing class PublishService {
  public static SchemaSnapshot generateSchemaSnapshot(Id formId) {
    Form__c form = queryFormWithRelationships(formId);

    // Collect all referenced objects
    Set<String> objectApiNames = collectReferencedObjects(form);

    SchemaSnapshot snapshot = new SchemaSnapshot();
    snapshot.snapshotVersion = '1.0';
    snapshot.generatedAt = System.now();
    snapshot.apiVersion = '62.0';

    // For each object, capture metadata
    for (String objName : objectApiNames) {
      snapshot.objects.put(objName, SchemaService.getObjectInfo(objName));
    }

    // Capture relationships
    snapshot.relationships = buildRelationshipMap(form);

    return snapshot;
  }

  public static LayoutConfig compileLayout(Id formId) {
    // Query full tree: pages -> sections -> elements
    List<Form_Page__c> pages = [
      SELECT
        Id,
        Name,
        Sequence__c,
        Skip_Condition_Expression__c,
        (
          SELECT
            Id,
            Name,
            Sequence__c,
            Context_Type__c,
            Relationship_Name__c,
            Grid_Columns__c,
            (
              SELECT
                Id,
                Name,
                Sequence__c,
                Type__c,
                Field_API_Name__c,
                Render_As__c,
                Visibility_Expression__c,
                Calculation_Formula__c
              FROM Form_Elements__r
              ORDER BY Sequence__c
            )
          FROM Form_Sections__r
          ORDER BY Sequence__c
        )
      FROM Form_Page__c
      WHERE Form_Version__r.Form__c = :formId
      ORDER BY Sequence__c
    ];

    // Build JSON structure
    return LayoutConfig.build(pages);
  }

  @future
  public static void publishAsync(Id formId) {
    SchemaSnapshot snapshot = generateSchemaSnapshot(formId);
    LayoutConfig layout = compileLayout(formId);

    // Create new version
    Form_Version__c version = new Form_Version__c(
      Form__c = formId,
      Version_Number__c = getNextVersionNumber(formId),
      Schema_Snapshot__c = JSON.serialize(snapshot),
      Layout_Config__c = JSON.serialize(layout),
      Published_Date__c = System.now(),
      Published_By__c = UserInfo.getUserId(),
      Is_Active__c = true
    );

    // Deactivate previous versions, insert new
    Database.SaveResult result = Database.insert(version);

    if (result.isSuccess()) {
      deactivatePreviousVersions(formId, version.Id);
    }
  }
}
````

### 3.3 DMLService Implementation (Context-Parameterized)

```apex
public class DMLService {
  public enum ExecutionContext {
    USER_CONTEXT, // Respects sharing/FLS
    ELEVATED_CONTEXT // Without sharing, manual CRUD/FLS
  }

  public static DMLResult executeCascade(
    FormPayload payload,
    ExecutionContext context
  ) {
    Savepoint sp = Database.setSavepoint();

    try {
      // Step 1: Validate payload
      ValidationResult validation = validatePayload(payload, context);
      if (!validation.isValid) {
        return DMLResult.failure(validation.errors);
      }

      // Step 2: Insert/update primary records
      List<SObject> primaryRecords = buildPrimaryRecords(payload.primaryRecord);

      if (context == ExecutionContext.ELEVATED_CONTEXT) {
        // Manual CRUD check
        if (!hasCRUDAccess(payload.primaryRecord.objectApiName)) {
          throw new SecurityException('No CRUD access');
        }
        // Assign default owner
        assignOwnership(primaryRecords, payload.defaultOwnerId);
      }

      Database.SaveResult[] primaryResults = Database.insert(
        primaryRecords,
        false
      );

      // Step 3: Insert child records
      Map<String, List<SObject>> childCollections = buildChildCollections(
        payload.childCollections,
        primaryRecords
      );

      for (String relationshipName : childCollections.keySet()) {
        List<SObject> children = childCollections.get(relationshipName);

        if (context == ExecutionContext.ELEVATED_CONTEXT) {
          // Manual CRUD check for child object
          String childObjectName = children[0]
            .getSObjectType()
            .getDescribe()
            .getName();
          if (!hasCRUDAccess(childObjectName)) {
            throw new SecurityException('No CRUD access to ' + childObjectName);
          }
        }

        Database.insert(children, false);
      }

      // Step 4: Link files
      linkFiles(payload.files, primaryRecords);

      return DMLResult.success(primaryRecords);
    } catch (Exception e) {
      Database.rollback(sp);
      return DMLResult.failure(new List<String>{ e.getMessage() });
    }
  }

  private static Boolean hasCRUDAccess(String objectApiName) {
    Schema.DescribeSObjectResult describeResult = Schema.getGlobalDescribe()
      .get(objectApiName)
      .getDescribe();
    return describeResult.isCreateable() && describeResult.isUpdateable();
  }

  private static void assignOwnership(
    List<SObject> records,
    Id defaultOwnerId
  ) {
    for (SObject record : records) {
      record.put('OwnerId', defaultOwnerId);
    }
  }
}
```

=======

### 3.2 PublishService

Orchestrates the publish workflow: queries the full form hierarchy (pages → sections → elements), calls `SchemaService` to capture metadata for all referenced SObjects, builds the layout JSON, creates a new `Form_Version__c`, and deactivates the previous active version.

Uses `@future` for async execution to avoid governor limit pressure on complex forms.

### 3.3 DMLService (Context-Parameterized)

A single service handles all three adapter contexts via an `ExecutionContext` enum:

| Context            | Sharing                                          | CRUD/FLS                                            | Owner                           |
| ------------------ | ------------------------------------------------ | --------------------------------------------------- | ------------------------------- |
| `USER_CONTEXT`     | `with sharing` — platform enforces automatically | Uses `Security.stripInaccessible()`                 | Current user                    |
| `ELEVATED_CONTEXT` | `without sharing` — manual checks required       | Explicit CRUD check per object, FLS check per field | `Default_Owner_Id__c` from form |

**Cascade pattern:** Insert/update primary record first, then child collections (using the parent's Id as the foreign key), then link files via `ContentDocumentLink`.

Uses `Database.setSavepoint()` + `Database.rollback()` for transactional safety. Uses `Database.insert(records, false)` (partial success) so individual record errors can be reported back to the user at the field level.

> > > > > > > theirs

---

## 4. Expression Engine

### 4.1 Grammar (EBNF)

```ebnf
expression     ::= logical_or
logical_or     ::= logical_and ( "OR" logical_and )*
logical_and    ::= equality ( "AND" equality )*
equality       ::= comparison ( ( "==" | "!=" ) comparison )*
comparison     ::= addition ( ( ">" | ">=" | "<" | "<=" ) addition )*
addition       ::= multiplication ( ( "+" | "-" ) multiplication )*
multiplication ::= unary ( ( "*" | "/" | "%" ) unary )*
unary          ::= ( "!" | "-" ) unary | primary
primary        ::= NUMBER | STRING | BOOLEAN |
                   field_reference | function_call |
                   "(" expression ")"

field_reference ::= "$" IDENTIFIER ( "." IDENTIFIER )*
function_call   ::= IDENTIFIER "(" arguments? ")"
```

<<<<<<< ours

### 4.2 Expression Evaluator (JavaScript - Client-Side)

````javascript
// expressionEngine.js

class ExpressionEngine {
  constructor(context) {
    this.context = context; // Map of field keys to values
  }

  evaluate(expression) {
    const tokens = this.tokenize(expression);
    const ast = this.parse(tokens);
    return this.evaluateNode(ast);
  }

  tokenize(expression) {
    // Lexical analysis
    const tokens = [];
    const regex =
      /\s*(=>|>=|<=|==|!=|&&|\|\||[+\-*/%()<>!,.]|\d+\.?\d*|"[^"]*"|true|false|[A-Za-z_][A-Za-z0-9_]*)\s*/g;

    let match;
    while ((match = regex.exec(expression)) !== null) {
      if (match[1]) tokens.push(match[1]);
    }

    return tokens;
  }

  parse(tokens) {
    // Recursive descent parser
    let current = 0;

    const parseExpression = () => {
      return parseLogicalOr();
    };

    const parseLogicalOr = () => {
      let left = parseLogicalAnd();

      while (tokens[current] === "OR" || tokens[current] === "||") {
        const operator = tokens[current++];
        const right = parseLogicalAnd();
        left = { type: "BinaryOp", operator: "OR", left, right };
      }

      return left;
    };

    // ... similar for other precedence levels

    return parseExpression();
  }

  evaluateNode(node) {
    switch (node.type) {
      case "Number":
        return parseFloat(node.value);

      case "String":
        return node.value.slice(1, -1); // Remove quotes

      case "Boolean":
        return node.value === "true";

      case "FieldReference":
        return this.resolveField(node.path);

      case "BinaryOp":
        const left = this.evaluateNode(node.left);
        const right = this.evaluateNode(node.right);
        return this.evaluateBinaryOp(node.operator, left, right);

      case "UnaryOp":
        const operand = this.evaluateNode(node.operand);
        return this.evaluateUnaryOp(node.operator, operand);

      case "FunctionCall":
        return this.evaluateFunction(node.name, node.arguments);

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  resolveField(path) {
    // Resolves $fieldName or $parent.child dot-notation references
    // from the context map provided at construction time.
    const segments = path.split(".");
    let value = this.context;

    for (const segment of segments) {
      if (value == null) {
        return null;
      }
      value = value[segment];
    }

    return value ?? null;
  }

  evaluateBinaryOp(operator, left, right) {
    switch (operator) {
      // Equality
      case "==":
        return left === right;
      case "!=":
        return left !== right;

      // Comparison
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      case "<":
        return left < right;
      case "<=":
        return left <= right;

      // Logical
      case "AND":
      case "&&":
        return Boolean(left) && Boolean(right);
      case "OR":
      case "||":
        return Boolean(left) || Boolean(right);

      // Arithmetic
      case "+":
        return Number(left) + Number(right);
      case "-":
        return Number(left) - Number(right);
      case "*":
        return Number(left) * Number(right);
      case "/":
        if (Number(right) === 0) {
          throw new Error("Division by zero");
        }
        return Number(left) / Number(right);
      case "%":
        if (Number(right) === 0) {
          throw new Error("Modulo by zero");
        }
        return Number(left) % Number(right);

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  evaluateUnaryOp(operator, operand) {
    switch (operator) {
      case "!":
        return !Boolean(operand);
      case "-":
        return -Number(operand);
      default:
        throw new Error(`Unknown unary operator: ${operator}`);
    }
  }

  evaluateFunction(name, args) {
    // All function names are case-insensitive; normalize to uppercase
    const fnName = name.toUpperCase();

    // Whitelist of allowed functions — no arbitrary calls permitted
    switch (fnName) {
      case "IF": {
        if (args.length !== 3) {
          throw new Error("IF requires 3 arguments: IF(condition, then, else)");
        }
        const condition = this.evaluateNode(args[0]);
        // Short-circuit: only evaluate the chosen branch
        return Boolean(condition)
          ? this.evaluateNode(args[1])
          : this.evaluateNode(args[2]);
      }

      case "ISBLANK": {
        if (args.length !== 1) {
          throw new Error("ISBLANK requires 1 argument");
        }
        const value = this.evaluateNode(args[0]);
        return value === null || value === undefined || value === "";
      }

      case "CONTAINS": {
        if (args.length !== 2) {
          throw new Error(
            "CONTAINS requires 2 arguments: CONTAINS(text, search)"
          );
        }
        const text = String(this.evaluateNode(args[0]));
        const search = String(this.evaluateNode(args[1]));
        return text.includes(search);
      }

      case "LEN": {
        if (args.length !== 1) {
          throw new Error("LEN requires 1 argument");
        }
        const text = this.evaluateNode(args[0]);
        return text == null ? 0 : String(text).length;
      }

      case "TODAY": {
        if (args.length !== 0) {
          throw new Error("TODAY takes no arguments");
        }
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate())
          .toISOString()
          .split("T")[0];
      }

      case "NOW": {
        if (args.length !== 0) {
          throw new Error("NOW takes no arguments");
        }
        return new Date().toISOString();
      }

      case "TEXT": {
        if (args.length !== 1) {
          throw new Error("TEXT requires 1 argument");
        }
        const val = this.evaluateNode(args[0]);
        return val == null ? "" : String(val);
      }

      case "VALUE": {
        if (args.length !== 1) {
          throw new Error("VALUE requires 1 argument");
        }
        const str = this.evaluateNode(args[0]);
        const num = Number(str);
        if (isNaN(num)) {
          throw new Error(`VALUE cannot convert "${str}" to a number`);
        }
        return num;
      }

      case "ROUND": {
        if (args.length !== 2) {
          throw new Error(
            "ROUND requires 2 arguments: ROUND(number, decimals)"
          );
        }
        const number = Number(this.evaluateNode(args[0]));
        const decimals = Number(this.evaluateNode(args[1]));
        const factor = Math.pow(10, decimals);
        return Math.round(number * factor) / factor;
      }

      case "ABS": {
        if (args.length !== 1) {
          throw new Error("ABS requires 1 argument");
        }
        return Math.abs(Number(this.evaluateNode(args[0])));
      }

      default:
        throw new Error(`Unknown or disallowed function: ${name}`);
    }
  }
}
=======
### 4.2 Evaluator Design
>>>>>>> theirs

The expression engine is a client-side (JavaScript) recursive descent parser. It tokenizes the expression string, builds an AST, and evaluates it against a context map of field keys to values. No `eval()` or `Function()` is ever used.

**Built-in functions:**

<<<<<<< ours
**Visibility Rules:**

```javascript
// Evaluate whether a field/section should be visible
const engine = new ExpressionEngine(fieldValues);
const isVisible = engine.evaluate('$Status == "Active" AND $Amount > 1000');
````

**Calculations:**

```javascript
// Live calculated field
const engine = new ExpressionEngine(fieldValues);
const total = engine.evaluate("$Quantity * $UnitPrice * (1 - $Discount / 100)");
```

**Skip Conditions:**

```javascript
// Determine whether to skip a page in the wizard
const engine = new ExpressionEngine(fieldValues);
const shouldSkip = engine.evaluate(
  "ISBLANK($CompanyName) OR $IsIndividual == true"
);
```

=======
| Function | Description |
|----------|-------------|
| `IF(condition, then, else)` | Conditional with short-circuit evaluation |
| `ISBLANK(value)` | Null/empty check |
| `CONTAINS(text, search)` | Substring check |
| `LEN(text)` | String length |
| `TODAY()` | Current date |
| `NOW()` | Current datetime |
| `TEXT(value)` | Convert to string |
| `VALUE(text)` | Convert to number |
| `ROUND(number, decimals)` | Numeric rounding |
| `ABS(number)` | Absolute value |

### 4.3 Conditional Visibility Rules

Visibility rules follow the **Salesforce Lightning record page component visibility** pattern — a declarative, multi-rule configuration that admins build through a UI, not by writing expressions.

> > > > > > > theirs

**Rule structure:**

Each visibility rule is a single condition: a field reference, an operator, and a value. Multiple rules combine with a logic operator (AND / OR / Custom).

<<<<<<< ours

### 5.1 FLS/CRUD Enforcement Patterns

The application enforces field-level security and CRUD access differently depending on execution context.

**Internal (User Context) -- `with sharing`:**

When an authenticated internal user submits a form, all database operations execute in the user's security context. Apex classes in this path declare `with sharing` so that the platform enforces sharing rules, CRUD permissions, and FLS automatically.

```apex
public with sharing class InternalDMLHandler {
  public static DMLResult submitForm(FormPayload payload) {
    // Platform enforces sharing rules automatically.
    // stripInaccessible removes fields the user cannot write.
    List<SObject> records = buildRecords(payload);

    SObjectAccessDecision decision = Security.stripInaccessible(
      AccessType.CREATABLE,
      records
    );

    insert decision.getRecords();

    // Log any fields that were stripped
    Map<String, Set<String>> removedFields = decision.getRemovedFields();
    if (!removedFields.isEmpty()) {
      Logger.warn('Fields stripped by FLS', removedFields);
    }

    return DMLResult.success(decision.getRecords());
  }
}
```

**Public/Guest Context -- `without sharing` with manual checks:**

Guest user submissions run through an elevated Apex class (`without sharing`) because guest users have no object-level permissions by default. The code performs explicit CRUD and FLS checks before every DML operation.

````apex
public without sharing class GuestDMLHandler {
  public static DMLResult submitForm(FormPayload payload) {
    // Manual CRUD check -- the form's target object must be
    // explicitly registered in a custom metadata allowlist.
    if (!FormSecurityConfig.isObjectAllowedForGuest(payload.objectApiName)) {
      throw new SecurityException(
        'Object not permitted for guest submission: ' + payload.objectApiName
      );
    }

    // Manual FLS check on every submitted field
    Schema.DescribeSObjectResult objDescribe = Schema.getGlobalDescribe()
      .get(payload.objectApiName)
      .getDescribe();

    for (String fieldName : payload.fieldValues.keySet()) {
      Schema.DescribeFieldResult fieldDescribe = objDescribe.fields.getMap()
        .get(fieldName)
        .getDescribe();

      if (!fieldDescribe.isCreateable()) {
        throw new SecurityException('Field not creatable: ' + fieldName);
      }
    }

    // Assign ownership to configured default owner
    List<SObject> records = buildRecords(payload);
    assignOwnership(records, payload.defaultOwnerId);

    insert records;
    return DMLResult.success(records);
  }
=======
| Property | Description | Example |
|----------|-------------|---------|
| `field` | Element key or field API name to evaluate | `elem-account-type` |
| `operator` | Comparison operator | `Equals` |
| `value` | Expected value (string, number, boolean) | `"Customer"` |

**Supported operators:**

| Operator | Applies to | Description |
|----------|-----------|-------------|
| `Equals` | All types | Exact match |
| `Not_Equals` | All types | Not an exact match |
| `Contains` | Text | Substring match |
| `Not_Contains` | Text | No substring match |
| `Starts_With` | Text | Prefix match |
| `Is_Blank` | All types | Null or empty (no value needed) |
| `Is_Not_Blank` | All types | Has a value (no value needed) |
| `Greater_Than` | Number, Currency, Date | Greater than |
| `Less_Than` | Number, Currency, Date | Less than |
| `Greater_Or_Equal` | Number, Currency, Date | Greater than or equal |
| `Less_Or_Equal` | Number, Currency, Date | Less than or equal |
| `Includes` | Multi-select picklist | Contains selected value |

**Logic operators:**

| Logic | Behavior |
|-------|----------|
| `AND` (default) | All rules must be true for the element to be visible |
| `OR` | Any rule being true makes the element visible |
| `Custom` | Admin-defined combination using rule numbers: `(1 AND 2) OR 3` |

**Storage format:** `Visibility_Expression__c` stores structured JSON, not raw expressions:

```json
{
  "logic": "AND",
  "rules": [
    { "field": "elem-account-type", "operator": "Equals", "value": "Customer" },
    { "field": "elem-industry", "operator": "Not_Equals", "value": "Government" }
  ]
}
````

Custom logic example:

```json
{
  "logic": "Custom",
  "customLogic": "(1 AND 2) OR 3",
  "rules": [
    { "field": "elem-account-type", "operator": "Equals", "value": "Customer" },
    { "field": "elem-annual-revenue", "operator": "Greater_Than", "value": 1000000 },
    { "field": "elem-priority-override", "operator": "Equals", "value": true }
  ]
>>>>>>> theirs
}
```

**Where visibility rules apply:**

| Level   | Field                                       | Effect when rules evaluate to false                          |
| ------- | ------------------------------------------- | ------------------------------------------------------------ |
| Section | `Form_Section__c.Visibility_Expression__c`  | Entire section hidden, all fields within skip validation     |
| Element | `Form_Element__c.Visibility_Expression__c`  | Single field hidden, skips validation, excluded from payload |
| Page    | `Form_Page__c.Skip_Condition_Expression__c` | Page skipped in wizard navigation                            |

**Runtime evaluation:** The formPlayer evaluates visibility rules reactively — whenever a field value changes, all rules referencing that field are re-evaluated and the UI updates immediately. Hidden fields are excluded from both client-side validation and the submission payload.

**Builder UX:** The form builder presents a rule configuration UI identical to Lightning App Builder component visibility: an "Add Filter" button, field picker (populated from elements on the form), operator dropdown, and value input. The Custom logic option appears when there are 3+ rules.

### 4.4 Calculation Expressions

Calculations still use the expression grammar (section 4.1) since they require arithmetic, not just comparisons. These are configured by developers/advanced admins in `Calculation_Formula__c`:

**Examples:**

- `$Quantity * $Unit_Price * (1 - $Discount_Percent / 100)`
- `IF($Status == "Closed", $Amount, 0)`

---

## 5. Security Model

### 5.1 Execution Context Security

| Context      | Apex Class                   | Sharing           | CRUD/FLS Enforcement                                 |
| ------------ | ---------------------------- | ----------------- | ---------------------------------------------------- |
| Internal     | `InternalDMLHandler`         | `with sharing`    | Platform-enforced via `Security.stripInaccessible()` |
| Flow         | No DML (output to variables) | N/A               | Flow handles DML                                     |
| Public/Guest | `GuestFormController`        | `without sharing` | Manual CRUD check per object, FLS check per field    |

### 5.2 Guest User Security

Guest submissions go through an elevated Apex class because guest users have no standard object permissions.

**Guardrails:**

<<<<<<< ours
| Control | Implementation |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Object allowlist | Custom Metadata Type (`Form_Guest_Object__mdt`) gates which objects accept guest submissions |
| Field allowlist | Only fields mapped to form elements are written; no arbitrary field injection |
| Default ownership | Records are assigned to the `Default_Owner__c` specified on the form definition |
| Rate limiting | Per-session submission throttle via Platform Cache (configurable, default 5 per 15 minutes) |
| CAPTCHA | reCAPTCHA verification required before payload submission (configurable per form) |
| File restrictions | Allowed MIME types and maximum file size configured per form element |
=======
| Control | Description |
|---------|-------------|
| Object allowlist | Custom Metadata (`Form_Guest_Object__mdt`) gates which objects accept guest submissions |
| Field allowlist | Only fields mapped to form elements are written; no arbitrary field injection |
| Default ownership | Records assigned to `Default_Owner_Id__c` on the form definition |
| Rate limiting | Per-session throttle via Platform Cache (default: 5 submissions per 15 minutes) |
| CAPTCHA | reCAPTCHA verification before payload submission (configurable per form) |
| File restrictions | Allowed MIME types and max file size per form element |

> > > > > > > theirs

**Elevated context flow:** Guest browser → formPlayer validates + emits payload → `GuestFormController` verifies CAPTCHA → checks rate limit → validates object against allowlist → manual CRUD/FLS per field → sanitizes input → executes DML → returns sanitized response.

### 5.3 Expression Engine Sandboxing

<<<<<<< ours
The expression engine runs entirely on the client side and is designed to prevent code injection, resource exhaustion, and unauthorized data access.

**Sandboxing Rules:**

| Rule                        | Limit                 | Enforcement                                                                |
| --------------------------- | --------------------- | -------------------------------------------------------------------------- |
| No `eval()` or `Function()` | Absolute              | Parser-based evaluation only; no dynamic code generation                   |
| Whitelisted functions only  | 10 built-in functions | `evaluateFunction()` rejects any function name not in the switch statement |
| Recursion depth limit       | 10 levels             | Depth counter incremented on each `evaluateNode()` call; throws at limit   |
| Expression length limit     | 4,000 characters      | Checked before tokenization; expressions exceeding this are rejected       |
| No context mutation         | Absolute              | `resolveField()` performs read-only lookups; no setter path exists         |
| No external calls           | Absolute              | No HTTP, DOM, or async operations available in the expression grammar      |
| Execution timeout           | 50 ms                 | Long-running evaluations are aborted via a performance check               |

**Depth Guard Implementation:**

```javascript
evaluateNode(node, depth = 0) {
    if (depth > 10) {
        throw new Error('Expression recursion depth exceeded (max 10)');
    }
    // ... all recursive calls pass depth + 1
    case 'BinaryOp':
        const left = this.evaluateNode(node.left, depth + 1);
        const right = this.evaluateNode(node.right, depth + 1);
        return this.evaluateBinaryOp(node.operator, left, right);
    // ...
}
```

=======
| Rule | Limit |
|------|-------|
| No `eval()` or `Function()` | Parser-based evaluation only |
| Whitelisted functions only | 10 built-in functions (see section 4.2) |
| Recursion depth limit | 10 levels |
| Expression length limit | 4,000 characters |
| No context mutation | Read-only field lookups |
| No external calls | No HTTP, DOM, or async in grammar |

> > > > > > > theirs

### 5.4 Input & Output Safety

- **Input sanitization:** All string values stripped of HTML tags server-side before DML. Field lengths enforced from schema snapshot.
- **XSS prevention:** LWC auto-escapes all template expressions. Rich text rendered via `lightning-formatted-rich-text` (built-in sanitization). No `innerHTML` usage anywhere.
- **SOQL injection prevention:** All queries use bind variables. Dynamic SOQL (for configurable object names) validates object/field names against `Schema.getGlobalDescribe()` before use.

<<<<<<< ours

### 5.4 Input Sanitization

All user-submitted data passes through sanitization before it reaches any DML or rendering path.

**Server-Side Sanitization (Apex):**

```apex
public class InputSanitizer {
  // Strip HTML tags from all string values in the payload
  public static FormPayload sanitize(FormPayload payload) {
    for (String fieldName : payload.fieldValues.keySet()) {
      Object value = payload.fieldValues.get(fieldName);

      if (value instanceof String) {
        String sanitized = stripHtml((String) value);
        sanitized = sanitized.trim();

        // Enforce field-level length limits from schema snapshot
        Integer maxLength = payload.fieldLengths.get(fieldName);
        if (maxLength != null && sanitized.length() > maxLength) {
          sanitized = sanitized.substring(0, maxLength);
        }

        payload.fieldValues.put(fieldName, sanitized);
      }
    }
    return payload;
  }

  private static String stripHtml(String input) {
    return input.replaceAll('<[^>]+>', '');
  }
}
```

## =======

> > > > > > > theirs

## 6. Performance & Scalability

### 6.1 Key Strategies

| Strategy                      | How it works                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single-query form loading** | Version record + schema snapshot + layout config all on one `Form_Version__c` record. One SOQL query loads everything.                                     |
| **Schema snapshot caching**   | Platform Cache (`FormApp` org partition), keyed by version Id, 1-hour TTL, LRU eviction. Avoids repeated JSON deserialization.                             |
| **Lazy page loading**         | Only the current wizard page's elements are rendered. Subsequent pages render on demand during navigation.                                                 |
| **Chunked file upload**       | Files split into 4MB Base64 chunks. First chunk creates `ContentVersion`, subsequent chunks append. Final chunk links to parent record. Max 25MB per file. |
| **Virtual scrolling**         | Activates automatically for pages with 100+ fields. Only visible viewport + 5-element buffer rendered in DOM.                                              |

### 6.2 Governor Limit Budget

<<<<<<< ours
| Layer | Technique |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| LWC template rendering | Lightning Web Components auto-escape all bound expressions in templates by default |
| Rich text fields | Rendered via `lightning-formatted-rich-text`, which strips `<script>`, `<iframe>`, `onclick`, and other dangerous elements |
| Schema snapshot labels | Labels and help text stored in the snapshot are escaped before display |
| Error messages | Validation error messages use text-only rendering; no `innerHTML` usage anywhere in the component tree |
| CSP headers | Lightning Platform enforces Content Security Policy headers; inline scripts are blocked |
=======
| Operation | SOQL | DML | Heap |
|-----------|------|-----|------|
| Form load | 1-2 | 0 | ~200 KB |
| Publish | ~5 | ~3 | ~500 KB |
| Submit (simple) | ~2 | 1 | ~100 KB |
| Submit (with children) | ~2 | 1 + N collections | ~100 KB + 50 KB/collection |

> > > > > > > theirs

All operations designed to use < 30% of governor limits, leaving headroom for triggers and flows on the target object.

<<<<<<< ours

```javascript
// NEVER used in the codebase:
element.innerHTML = userValue; // Forbidden
document.createElement("script"); // Forbidden
eval(expression); // Forbidden
new Function("return " + expression); // Forbidden
lwc: dom = "manual"; // Avoided; used only for signature canvas with no user content
```

=======

### 6.3 Performance Targets

> > > > > > > theirs

| Operation               | Target       |
| ----------------------- | ------------ |
| Form load (cached)      | < 1 second   |
| Form load (uncached)    | < 2 seconds  |
| Publish (< 50 fields)   | < 10 seconds |
| Publish (50-200 fields) | < 30 seconds |
| Submit (no files)       | < 3 seconds  |
| Page navigation         | < 200 ms     |
| Expression evaluation   | < 50 ms      |

Monitoring via `PerformanceObserver` API on client side, logged to `Form_Metric__c` when diagnostic mode is enabled.

---

## 7. Error Handling

### 7.1 Design Principle

Error handling mirrors Salesforce OOB record page behavior: validation rule errors display inline at the field that caused them, and all other errors collect in a summary banner. The goal is that a user never has to guess _which_ field caused a problem.

<<<<<<< ours
**Dynamic SOQL (when required for configurable object names):**

When the form targets a configurable object, the object API name is validated against the `Schema.getGlobalDescribe()` map before it is used in any dynamic query. Field names are validated against the object's `DescribeSObjectResult`. No raw user input ever reaches a `Database.query()` call.

```apex
public static List<SObject> queryRecords(
    String objectApiName,
    Set<String> fieldNames,
    Id recordId
) {
    // Validate object name against org schema
    if (!Schema.getGlobalDescribe().containsKey(objectApiName)) {
        throw new SecurityException('Invalid object: ' + objectApiName);
    }

    // Validate each field name against the object describe
    Map<String, Schema.SObjectField> fieldMap =
        Schema.getGlobalDescribe()
            .get(objectApiName)
            .getDescribe()
            .fields.getMap();

    List<String> validFields = new List<String>();
    for (String fieldName : fieldNames) {
        if (fieldMap.containsKey(fieldName.toLowerCase())) {
            validFields.add(String.escapeSingleQuotes(fieldName));
        }
    }

    String fieldList = String.join(validFields, ', ');
    String query = 'SELECT ' + fieldList
        + ' FROM ' + objectApiName
        + ' WHERE Id = :recordId';

    return Database.query(query);
}
```

=======

### 7.2 Error Tiers

> > > > > > > theirs

| Tier             | What shows here                                                                                                    | Where it renders                                        | Example                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------- |
| **Field-level**  | Validation rule errors (via `errorDisplayField`), required field violations, client-side checks (pattern, min/max) | Inline beneath the input, with `slds-has-error` styling | "Account Name must be unique"           |
| **Section/Page** | Error count badges                                                                                                 | Section header suffix, wizard page tab badges           | "2 errors"                              |
| **Form-level**   | Trigger exceptions, CRUD/FLS failures, cross-object errors, anything without a field attribution                   | `formValidationSummary` banner at top of form           | "Insufficient access to create Contact" |

### 7.3 Client-Side Validation

<<<<<<< ours

### 6.1 Schema Snapshot Caching

Schema snapshots are cached in Platform Cache to avoid redundant deserialization on repeated form loads.

**Cache Strategy:**

| Parameter       | Value                      |
| --------------- | -------------------------- |
| Cache partition | `FormApp` (Org partition)  |
| Cache key       | `snapshot_{FormVersionId}` |
| TTL             | 1 hour (3,600 seconds)     |
| Eviction        | LRU (platform-managed)     |
| Max entry size  | 100 KB per snapshot        |

**Implementation:**

```apex
public class SchemaSnapshotCache {
  private static final String PARTITION = 'local.FormApp';
  private static final Integer TTL_SECONDS = 3600; // 1 hour

  public static SchemaSnapshot get(Id formVersionId) {
    String cacheKey = 'snapshot_' + formVersionId;

    Cache.OrgPartition partition = Cache.Org.getPartition(PARTITION);
    SchemaSnapshot cached = (SchemaSnapshot) partition.get(cacheKey);

    if (cached != null) {
      return cached;
    }

    // Cache miss: query and deserialize
    Form_Version__c version = [
      SELECT Schema_Snapshot__c
      FROM Form_Version__c
      WHERE Id = :formVersionId
      LIMIT 1
    ];

    SchemaSnapshot snapshot = (SchemaSnapshot) JSON.deserialize(
      version.Schema_Snapshot__c,
      SchemaSnapshot.class
    );

    partition.put(cacheKey, snapshot, TTL_SECONDS);
    return snapshot;
  }

  public static void invalidate(Id formVersionId) {
    String cacheKey = 'snapshot_' + formVersionId;
    Cache.Org.getPartition(PARTITION).remove(cacheKey);
  }
}
```

### 6.2 Single-Query Form Loading

Form rendering requires three pieces of data: the version record, the schema snapshot, and the layout configuration. All three are stored on a single `Form_Version__c` record and retrieved in one SOQL query.

```apex
@AuraEnabled(cacheable=true)
public static FormDefinition loadForm(Id formId) {
    Form_Version__c version = [
        SELECT Id,
               Version_Number__c,
               Schema_Snapshot__c,   // JSON blob
               Layout_Config__c,     // JSON blob
               Published_Date__c,
               Form__r.Name,
               Form__r.Target_Object__c,
               Form__r.Default_Owner__c,
               Form__r.Theme_Config__c
        FROM Form_Version__c
        WHERE Form__c = :formId
        AND Is_Active__c = true
        LIMIT 1
    ];

    return new FormDefinition(version);
}
```

=======
Runs on field blur and again on submit. Blocks submission if any checks fail.

**Validation order per field (short-circuits on first failure):**

> > > > > > > theirs

1. Skip hidden fields entirely
2. Required — `Is_Required__c` OR `schema.required`
3. Type coercion — value matches schema field type
4. Length — `Min_Length__c` / `Max_Length__c`
5. Value range — `Min_Value__c` / `Max_Value__c`
6. Pattern — `Pattern__c` regex, uses `Pattern_Error_Message__c` if set
7. Expression rules — dynamic required-if via `Visibility_Expression__c`

All field-level errors use the standard SLDS `slds-form-element` with `slds-has-error` class, matching how `lightning-input` displays validity errors.

### 7.4 Server-Side Validation Rule Errors

This is the critical OOB-matching behavior. When `Database.insert` or `Database.update` fails:

1. **`FIELD_CUSTOM_VALIDATION_EXCEPTION`** — Salesforce returns the field name via `Database.Error.getFields()`. The DML service maps `fieldApiName` back to the form element's `Key__c` and returns it as a field-level error. The formPlayer renders it inline beneath that element.

2. **`REQUIRED_FIELD_MISSING`** — Same mapping: `getFields()` identifies the missing field, mapped to the element, shown inline.

3. **Everything else** (trigger exceptions, cross-object rules, CRUD/FLS, duplicate rules) — No reliable field attribution. These become form-level errors in the summary banner.

<<<<<<< ours
**Lazy Loading Benefits:**

| Metric              | Eager (all pages)     | Lazy (current page) |
| ------------------- | --------------------- | ------------------- |
| Initial DOM nodes   | O(total fields)       | O(fields per page)  |
| Initial render time | Scales with form size | Constant (~200ms)   |
| Memory usage        | Full form in memory   | Current page only   |

### 6.4 Governor Limit Budget

Each form operation is designed to stay well within Salesforce governor limits. The following table shows the budget allocation per operation type.

| Operation              | SOQL Queries (limit: 100)                       | DML Statements (limit: 150)                           | Heap Size (limit: 6 MB)        |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------ |
| Form load              | 1 (version query) + 1 (cache check)             | 0                                                     | ~200 KB (snapshot + layout)    |
| Publish                | 5 (form + pages + sections + elements + schema) | 3 (version insert + deactivate + snapshot cache)      | ~500 KB (snapshot generation)  |
| Submit (simple)        | 2 (version load + validation)                   | 1 (primary record insert)                             | ~100 KB                        |
| Submit (with children) | 2 (version load + validation)                   | 1 + N (primary + N child collections)                 | ~100 KB + 50 KB per collection |
| Submit (with files)    | 2 (version load + validation)                   | 1 + 1 per file (ContentVersion + ContentDocumentLink) | ~100 KB + file metadata        |

**Safety Margin:** All operations are designed to use less than 30% of the synchronous governor limit budget, leaving headroom for triggers, flows, and validation rules that may fire on the target object.

### 6.5 Chunked File Upload

File uploads use a chunked strategy to handle files up to the platform limit while staying within heap size constraints.

**Parameters:**

| Parameter                | Value                                          |
| ------------------------ | ---------------------------------------------- |
| Chunk size               | 4 MB (4,194,304 bytes)                         |
| Max file size            | 25 MB (configurable per form element)          |
| Max files per submission | 10 (configurable per form element)             |
| Upload transport         | Apex `@AuraEnabled` with Base64-encoded chunks |

**Implementation:**

```javascript
// fileUploadService.js

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

async function uploadFile(file, parentId) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let contentVersionId = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const base64 = await readAsBase64(chunk);

    contentVersionId = await uploadChunk({
      contentVersionId: contentVersionId,
      fileName: file.name,
      base64Data: base64,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      parentId: parentId
    });
  }

  return contentVersionId;
}
```

```apex
@AuraEnabled
public static Id uploadChunk(
    Id contentVersionId,
    String fileName,
    String base64Data,
    Integer chunkIndex,
    Integer totalChunks,
    Id parentId
) {
    if (chunkIndex == 0) {
        // First chunk: create ContentVersion
        ContentVersion cv = new ContentVersion(
            Title = fileName,
            PathOnClient = fileName,
            VersionData = EncodingUtil.base64Decode(base64Data)
        );
        insert cv;
        return cv.Id;
    } else {
        // Subsequent chunks: append to existing ContentVersion
        ContentVersion cv = [
            SELECT Id, VersionData
            FROM ContentVersion
            WHERE Id = :contentVersionId
        ];

        String existingBase64 = EncodingUtil.base64Encode(cv.VersionData);
        cv.VersionData = EncodingUtil.base64Decode(
            existingBase64 + base64Data
        );
        update cv;

        // Final chunk: link to parent record
        if (chunkIndex == totalChunks - 1) {
            Id contentDocumentId = [
                SELECT ContentDocumentId
                FROM ContentVersion
                WHERE Id = :contentVersionId
            ].ContentDocumentId;

            insert new ContentDocumentLink(
                ContentDocumentId = contentDocumentId,
                LinkedEntityId = parentId,
                ShareType = 'V'
            );
        }

        return contentVersionId;
    }
}
```

### 6.6 Virtual Scrolling for Large Forms

Forms with more than 100 fields on a single page use virtual scrolling to maintain rendering performance. Only the visible viewport plus a buffer zone of elements are rendered in the DOM at any time.

**Implementation:**

```javascript
// formVirtualScroller.js

const VIEWPORT_BUFFER = 5; // Extra elements above/below viewport

export default class FormVirtualScroller extends LightningElement {
  @api elements = []; // Full element list
  @track visibleElements = []; // Currently rendered subset

  viewportStart = 0;
  elementHeight = 80; // Estimated average height in px

  connectedCallback() {
    this.calculateVisibleRange();
  }

  handleScroll(event) {
    const scrollTop = event.target.scrollTop;
    const viewportHeight = event.target.clientHeight;

    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this.elementHeight) - VIEWPORT_BUFFER
    );
    const endIndex = Math.min(
      this.elements.length,
      Math.ceil((scrollTop + viewportHeight) / this.elementHeight) +
        VIEWPORT_BUFFER
    );

    this.visibleElements = this.elements.slice(startIndex, endIndex);
    this.viewportStart = startIndex;
  }

  get containerStyle() {
    const totalHeight = this.elements.length * this.elementHeight;
    return `height: ${totalHeight}px; position: relative;`;
  }

  get offsetStyle() {
    const offset = this.viewportStart * this.elementHeight;
    return `transform: translateY(${offset}px);`;
  }
}
```

=======
**Key detail:** The mapping from `fieldApiName` → `elementKey` is built from the form definition at render time. If a server error references a field that has no corresponding form element (e.g., a required field not on the form), the error is promoted to the form-level summary rather than silently dropped.

### 7.5 Error Response Structure

The Apex submission service returns a single response object:

| Field         | Type    | Purpose                                                                |
| ------------- | ------- | ---------------------------------------------------------------------- |
| `success`     | Boolean | Overall result                                                         |
| `recordId`    | Id      | Created/updated record (on success)                                    |
| `fieldErrors` | List    | Errors mapped to specific fields (fieldApiName + elementKey + message) |
| `formErrors`  | List    | Unattributed errors (message + source category)                        |

Source categories: `validation_rule`, `required`, `trigger`, `security`, `dml`.

### 7.6 Error UX Behaviors

> > > > > > > theirs

**On submission failure:**

1. formPlayer clears all previous errors
2. Maps each field error to its element via `Key__c`
3. Rolls up error counts to sections and pages
4. Auto-navigates to the first page containing an error
5. Focuses the first error field (accessibility)
6. Collapsed sections with errors auto-expand
7. Wizard page tabs show error count badges

**Error clearing:**

<<<<<<< ours
| Operation | Target | Measurement Point |
| ------------------------------------- | ------------------------- | ---------------------------------------------------------------- |
| Form load (cached) | < 1 second | LWC `connectedCallback` to first paint |
| Form load (uncached) | < 2 seconds | LWC `connectedCallback` to first paint |
| Publish (simple form, <50 fields) | < 10 seconds | Button click to success toast |
| Publish (complex form, 50-200 fields) | < 30 seconds | Button click to success toast |
| Submit (simple, no files) | < 3 seconds | Submit click to confirmation screen |
| Submit (with children) | < 5 seconds | Submit click to confirmation screen |
| Submit (with file uploads) | < 5 seconds + upload time | Submit click to confirmation screen (excluding network transfer) |
| Page navigation (wizard) | < 200 ms | Next/Previous click to page render |
| Expression evaluation | < 50 ms | Single expression parse + evaluate |
| Visibility rule cascade | < 100 ms | Field change to all dependent fields updated |

# **Monitoring:** Performance metrics are captured via the `PerformanceObserver` API on the client side and logged to a custom `Form_Metric__c` object for forms where diagnostic mode is enabled by the admin.

| User action        | What clears                                    |
| ------------------ | ---------------------------------------------- |
| Field value change | That field's client-side errors                |
| Page navigation    | Re-validates current page                      |
| Form submit        | All errors cleared, then fresh validation pass |
| Server response    | Previous server errors replaced with new set   |

Client and server errors coexist independently — fixing a client error ("required") may reveal a server error ("must be unique") on the next submit.

> > > > > > > theirs
