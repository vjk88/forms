# Lookup and Formula Field Implementation Guide

**Version:** 1.0  
**Last Updated:** 2026-05-26  
**Status:** Specification

---

## Overview

The Native Forms & Surveys App fully supports both **Lookup (Reference)** and **Formula (Calculated)** fields as part of the schema snapshot strategy. This document details the implementation approach for both field types.

---

## 1. Lookup Fields (Reference Type)

### 1.1 Schema Snapshot Capture

When publishing a form that includes lookup fields, the schema snapshot captures:

```json
{
  "fields": {
    "AccountId": {
      "label": "Account",
      "type": "reference",
      "referenceTo": ["Account"], // Target object(s)
      "relationshipName": "Account",
      "createable": true,
      "updateable": true,
      "required": false,
      "inlineHelpText": "Select the related account"
    },
    "OwnerId": {
      "label": "Owner",
      "type": "reference",
      "referenceTo": ["User"], // Polymorphic: can reference multiple objects
      "relationshipName": "Owner",
      "createable": true,
      "updateable": true
    }
  }
}
```

### 1.2 Lookup Field Rendering

**Component:** `formFieldLookup`

**Rendering Strategy:**

1. **Authenticated Contexts (Internal, Flow):**
   - Use `lightning-record-edit-form` + `lightning-input-field`
   - Leverage Lightning Data Service for recent items + search
   - Full relationship picker with typeahead

2. **Guest Context (Public Forms):**
   - Use custom lookup with pre-fetched options from snapshot
   - OR restrict to predefined picklist of valid Ids
   - Security: never expose full object search to guests

**Implementation:**

```javascript
// formFieldLookup.js
import { LightningElement, api } from "lwc";

export default class FormFieldLookup extends LightningElement {
  @api fieldMetadata; // From schema snapshot
  @api value;
  @api required;
  @api disabled;
  @api mode; // 'user' | 'guest'

  get targetObject() {
    return this.fieldMetadata.referenceTo?.[0];
  }

  get isPolymorphic() {
    return this.fieldMetadata.referenceTo?.length > 1;
  }

  get useNativeLookup() {
    // Use native LDS lookup for authenticated users only
    return this.mode === "user";
  }

  handleChange(event) {
    this.value = event.detail.value;
    this.dispatchEvent(
      new CustomEvent("valuechange", {
        detail: {
          value: this.value,
          fieldName: this.fieldMetadata.name
        }
      })
    );
  }
}
```

```html
<!-- formFieldLookup.html -->
<template>
  <template if:true="{useNativeLookup}">
    <!-- Authenticated: Use LDS -->
    <lightning-input-field
      field-name="{fieldMetadata.name}"
      value="{value}"
      required="{required}"
      disabled="{disabled}"
      onchange="{handleChange}"
    >
    </lightning-input-field>
  </template>

  <template if:false="{useNativeLookup}">
    <!-- Guest: Custom restricted lookup -->
    <c-form-field-lookup-guest
      field-metadata="{fieldMetadata}"
      value="{value}"
      required="{required}"
      onchange="{handleChange}"
    >
    </c-form-field-lookup-guest>
  </template>
</template>
```

### 1.3 Guest Lookup Handling

**Problem:** Guests can't search arbitrary Salesforce records.

**Solutions:**

**Option A: Predefined Options (Recommended)**

```javascript
// Form Element configuration stores allowed Ids
{
    "Type__c": "Field",
    "Field_API_Name__c": "AccountId",
    "Render_As__c": "Lookup_Restricted",
    "Calculation_Formula__c": JSON.stringify({
        "allowedValues": [
            { "id": "001...", "name": "Account A" },
            { "id": "001...", "name": "Account B" }
        ]
    })
}
```

**Option B: Public Lookup API (Advanced)**

- Create `@AuraEnabled` method with explicit CRUD/FLS
- Return only records guest user can read
- Rate-limit to prevent data scraping

```apex
@AuraEnabled(cacheable=true)
public static List<LookupResult> searchRecords(
    String objectApiName,
    String searchTerm
) {
    // Validate object is in allowed list
    Set<String> allowedObjects = new Set<String>{'Account', 'Contact'};
    if (!allowedObjects.contains(objectApiName)) {
        throw new SecurityException('Object not allowed');
    }

    // Manual CRUD check
    if (!Schema.getGlobalDescribe().get(objectApiName)
            .getDescribe().isAccessible()) {
        throw new SecurityException('No read access');
    }

    // Execute search with guest sharing rules
    // Return max 10 results
    // ...
}
```

### 1.4 Lookup Field Submission

**FormPayload Structure:**

```json
{
  "primaryRecord": {
    "objectApiName": "Opportunity",
    "fields": {
      "AccountId": "001XXXXXXXXXXXXAAA", // Just the Id
      "OwnerId": "005XXXXXXXXXXXXAAA"
    }
  }
}
```

The DML service receives the Id and creates the relationship normally.

---

## 2. Formula Fields (Calculated Type)

### 2.1 Schema Snapshot Capture

Formula fields are captured with their metadata but **not their formulas** (formulas aren't exposed via API):

```json
{
  "fields": {
    "Total_Amount__c": {
      "label": "Total Amount",
      "type": "currency",
      "calculated": true,
      "createable": false,
      "updateable": false,
      "scale": 2,
      "precision": 18
    },
    "Full_Name__c": {
      "label": "Full Name",
      "type": "string",
      "calculated": true,
      "length": 255,
      "createable": false,
      "updateable": false
    }
  }
}
```

### 2.2 Formula Field Rendering

**Treatment:** Formula fields are **read-only display fields** on forms.

**Scenarios:**

**Scenario 1: Editing Existing Record (Internal Adapter)**

- Load record with formula field values via LDS
- Display formula values as read-only text
- Do NOT submit formula fields in payload (server recalculates)

**Scenario 2: Creating New Record**

- Formula fields **cannot be pre-calculated** (no record yet)
- Either hide formula fields on create forms
- OR use `Calculation_Formula__c` for client-side approximation

**Implementation:**

```javascript
// formFieldFormula.js
import { LightningElement, api } from "lwc";

export default class FormFieldFormula extends LightningElement {
  @api fieldMetadata;
  @api value; // May be null if creating new record
  @api mode; // 'create' | 'edit'

  get displayValue() {
    if (this.mode === "create") {
      return this.clientCalculatedValue || "--";
    }
    return this.value || "--";
  }

  get clientCalculatedValue() {
    // Optional: client-side approximation using Calculation_Formula__c
    // This is NOT the server formula, but a user-defined approximation
    return null;
  }
}
```

```html
<!-- formFieldFormula.html -->
<template>
  <div class="slds-form-element">
    <label class="slds-form-element__label"> {fieldMetadata.label} </label>
    <div class="slds-form-element__control">
      <div class="slds-form-element__static">{displayValue}</div>
    </div>
    <template if:true="{fieldMetadata.inlineHelpText}">
      <div class="slds-form-element__help">{fieldMetadata.inlineHelpText}</div>
    </template>
  </div>
</template>
```

### 2.3 Client-Side Calculations (Approximation)

For **new record creation**, admins can define client-side calculation formulas that approximate server-side formulas:

**Form Element Configuration:**

```javascript
{
    "Type__c": "Field",
    "Field_API_Name__c": "Total_Amount__c",
    "Calculation_Formula__c": "$Quantity * $Unit_Price"
}
```

The calculation engine evaluates this **reactively** as users fill other fields, providing **live feedback**. However, these are **approximations only** - the server's formula is authoritative.

**Implementation:**

```javascript
// In formPlayer or formElement
calculateFormulaField(element) {
    if (!element.Calculation_Formula__c) {
        return null;
    }

    const context = this.buildCalculationContext();
    const engine = new ExpressionEngine(context);

    try {
        return engine.evaluate(element.Calculation_Formula__c);
    } catch (error) {
        console.warn('Formula calculation error:', error);
        return null;
    }
}
```

### 2.4 Formula Field Submission

**Critical:** Formula fields are **never included** in the FormPayload.

```json
{
  "primaryRecord": {
    "objectApiName": "Opportunity",
    "fields": {
      "Amount": 50000,
      "Probability": 75
      // Total_Amount__c NOT included - server calculates it
    }
  }
}
```

The DML service filters out calculated fields before insert/update:

```apex
private static void sanitizePayload(FormPayload payload) {
    Map<String, Schema.SObjectField> fieldMap =
        Schema.getGlobalDescribe()
            .get(payload.primaryRecord.objectApiName)
            .getDescribe()
            .fields
            .getMap();

    Set<String> fieldsToRemove = new Set<String>();

    for (String fieldName : payload.primaryRecord.fields.keySet()) {
        Schema.DescribeFieldResult fieldDescribe =
            fieldMap.get(fieldName).getDescribe();

        if (!fieldDescribe.isCreateable() || fieldDescribe.isCalculated()) {
            fieldsToRemove.add(fieldName);
        }
    }

    for (String fieldName : fieldsToRemove) {
        payload.primaryRecord.fields.remove(fieldName);
    }
}
```

---

## 3. Element_Lookup_Mapping\_\_c Usage

### 3.1 Purpose

`Element_Lookup_Mapping__c` provides an **escape hatch** for overriding the implicit field-to-element mapping that the form engine derives automatically from `Field_API_Name__c`. In most cases the default mapping is sufficient: a form element with `Field_API_Name__c = 'AccountId'` maps directly to the `AccountId` field on the target SObject. However, there are scenarios where this one-to-one correspondence is not adequate.

### 3.2 Use Cases

#### (a) Mapping a Lookup to a Different Source

By default, a lookup element sources its value from the user's selection in the form. An explicit mapping lets you route the lookup value from a **different source** -- for example, deriving the value from a parent record, a URL parameter, or a different element on the form.

**Example:** A "Case" form where the `ContactId` lookup should be auto-populated from the logged-in user's related Contact rather than from a user-facing picker.

#### (b) Mapping Hidden Required Fields with Default Values

Some SObjects have required lookup fields that should not be visible to the respondent. An `Element_Lookup_Mapping__c` record can map a hidden element (with a default value) to a required field, satisfying the DML constraint without exposing the field on the form.

**Example:** An `Opportunity` form where `Pricebook2Id` is required but should always default to the Standard Price Book.

#### (c) Cross-Section Calculation Dependencies

When a formula approximation in one form section references a field whose element lives in a **different** section, the calculation engine needs an explicit mapping to locate the dependency. The mapping record declares the relationship so the engine can resolve `$Field_API_Name` tokens across section boundaries.

**Example:** Section 2 contains a calculated `Total_With_Tax__c` that depends on `Subtotal__c` in Section 1. The mapping record tells the engine where to find the `Subtotal__c` value.

### 3.3 Mapping Record Structure

Each `Element_Lookup_Mapping__c` record contains:

| Field                         | Description                                                                |
| ----------------------------- | -------------------------------------------------------------------------- |
| `Form_Element__c`             | Master-detail to the owning `Form_Element__c`                              |
| `Source_SObject_Field_API__c` | The API name of the source field that provides the value                   |
| `Target_Form_Element_Key__c`  | The unique key of the target element that receives or references the value |

**Example Records:**

```
Record 1 - Hidden required lookup
  Form_Element__c:             aXX000000000001  (Element for Pricebook2Id)
  Source_SObject_Field_API__c: Pricebook2Id
  Target_Form_Element_Key__c:  elem-pricebook-hidden-001

Record 2 - Cross-section dependency
  Form_Element__c:             aXX000000000002  (Element for Total_With_Tax__c)
  Source_SObject_Field_API__c: Subtotal__c
  Target_Form_Element_Key__c:  elem-subtotal-section1-001

Record 3 - Alternative lookup source
  Form_Element__c:             aXX000000000003  (Element for ContactId)
  Source_SObject_Field_API__c: ContactId
  Target_Form_Element_Key__c:  elem-contact-from-user-001
```

### 3.4 DML Service Resolution

During submission, the DML service resolves field values using a **two-pass strategy**:

1. **Explicit mapping check:** Query `Element_Lookup_Mapping__c` records for the current form version. If a mapping exists for a given field, resolve the value from the mapped source element.
2. **Implicit fallback:** If no explicit mapping exists, fall back to the standard resolution: match the payload field key to the element's `Field_API_Name__c`.

```apex
private static Map<String, Object> resolveFieldValues(
    FormPayload payload,
    List<Element_Lookup_Mapping__c> mappings
) {
    Map<String, Object> resolvedFields = new Map<String, Object>();

    // Build explicit mapping index: Source field -> Target element key
    Map<String, String> explicitMappings = new Map<String, String>();
    for (Element_Lookup_Mapping__c mapping : mappings) {
        explicitMappings.put(
            mapping.Source_SObject_Field_API__c,
            mapping.Target_Form_Element_Key__c
        );
    }

    for (String fieldName : payload.primaryRecord.fields.keySet()) {
        if (explicitMappings.containsKey(fieldName)) {
            // Resolve from the explicitly mapped element
            String targetKey = explicitMappings.get(fieldName);
            resolvedFields.put(fieldName, payload.resolveElementValue(targetKey));
        } else {
            // Implicit: use the value directly from the payload
            resolvedFields.put(fieldName, payload.primaryRecord.fields.get(fieldName));
        }
    }

    return resolvedFields;
}
```

This approach keeps the default path simple while giving admins full control over complex mapping scenarios.

---

## 4. Implementation Checklist

### Phase 1 -- Core Field Support

- [ ] **`formFieldLookup` component** -- Implement authenticated-mode rendering using `lightning-input-field` inside `lightning-record-edit-form` for internal and flow contexts
- [ ] **`formFieldFormula` component** -- Implement read-only display of formula field values with proper formatting by data type (currency, percent, text, etc.)
- [ ] **Schema snapshot capture for reference fields** -- Extend the publish-time snapshot to capture `referenceTo`, `relationshipName`, and polymorphic target metadata
- [ ] **Schema snapshot capture for calculated fields** -- Extend the publish-time snapshot to capture the `calculated` flag, `scale`, `precision`, and data type for formula fields

### Phase 2 -- Advanced Rendering and Mapping

- [ ] **`formFieldLookupGuest` component** -- Implement restricted lookup rendering for guest/public form contexts using predefined option sets
- [ ] **Client-side calculation engine integration** -- Wire `Calculation_Formula__c` evaluation into the form player so formula approximations update reactively as users fill fields
- [ ] **`Element_Lookup_Mapping__c` resolution in DMLService** -- Implement the two-pass resolution strategy (explicit mapping first, implicit fallback) in the DML service layer

### Phase 4 -- Security and Scale

- [ ] **Guest lookup API with rate limiting** -- Build the `@AuraEnabled` search endpoint for public forms with per-session rate limits and configurable allowed-object lists
- [ ] **Security hardening for lookup search endpoints** -- Enforce CRUD/FLS checks, apply guest sharing rules, cap result sets, and add input sanitization to all lookup search methods

---

**See also:**

- [DATA_MODEL_SPECIFICATION.md](DATA_MODEL_SPECIFICATION.md) -- Custom object and field definitions including `Element_Lookup_Mapping__c`
- [ARCHITECTURE_SPECIFICATION.md](ARCHITECTURE_SPECIFICATION.md) -- Overall system architecture and DML service design
