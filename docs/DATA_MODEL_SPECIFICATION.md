# Native Forms & Surveys App - Data Model & Technical Specification

**Version:** 1.0  
**Last Updated:** 2026-05-26  
**Status:** Draft

---

## Table of Contents

1. [Complete Data Model](#1-complete-data-model)
2. [Schema Snapshot Specification](#2-schema-snapshot-specification)
3. [Field Validation Rules](#3-field-validation-rules)
4. [Index Strategy](#4-index-strategy)
5. [Versioning Strategy](#5-versioning-strategy)
6. [Data Flow Diagrams](#6-data-flow-diagrams)

---

## 1. Complete Data Model

### 1.1 `Form__c` Object

**Purpose:** Master form definition container

<<<<<<< ours
| Field Name | Type | Length/Precision | Required | Description |
| --------------------------- | -------------- | ---------------- | -------- | ------------------------------------------------ |
| **Existing Fields** |
| `Name` | Text | 80 | Yes | Form name (auto-number or user-defined) |
| `Status__c` | Picklist | - | Yes | Draft, Published, Archived |
| `Global_Styles_JSON__c` | Long Text Area | 131072 | No | Global styling configuration |
| **New Required Fields** |
| `Primary_Context_Object__c` | Text | 255 | Yes | API name of primary SObject (e.g., "Account") |
| `Form_Type__c` | Picklist | - | Yes | Form, Survey |
| `Schema_Snapshot__c` | Long Text Area | 131072 | No\* | Frozen schema JSON (\*required when Published) |
| `Layout_Config__c` | Long Text Area | 131072 | No\* | Compiled player JSON (\*required when Published) |
| `Published_Date__c` | DateTime | - | No | Timestamp of last publish |
| `Description__c` | Long Text Area | 1000 | No | Form description for admin reference |
| `Default_Owner_Id__c` | Lookup(User) | - | No | Default owner for guest-created records |
=======
| Field Name | Type | Length/Precision | Required | Description |
|------------|------|------------------|----------|-------------|
| **Existing Fields** |
| `Name` | Text | 80 | Yes | Form name (auto-number or user-defined) |
| `Status__c` | Picklist | - | Yes | Draft, Published, Archived |
| `Global_Styles_JSON__c` | Long Text Area | 131072 | No | Global styling configuration |
| **New Required Fields** |
| `Primary_Context_Object__c` | Text | 255 | Yes | API name of primary SObject (e.g., "Account") |
| `Form_Type__c` | Picklist | - | Yes | Form, Survey |
| `Schema_Snapshot__c` | Long Text Area | 131072 | No* | Frozen schema JSON (*required when Published) |
| `Layout_Config__c` | Long Text Area | 131072 | No* | Compiled player JSON (*required when Published) |
| `Published_Date__c` | DateTime | - | No | Timestamp of last publish |
| `Description__c` | Long Text Area | 1000 | No | Form description for admin reference |
| `Default_Owner_Id__c` | Lookup(User) | - | No | Default owner for guest-created records |
| `Layout_Mode__c` | Picklist | - | No | Single_Page (default), Vertical_Navigation |

> > > > > > > theirs

**Picklist Values:**

- `Status__c`: Draft, Published, Archived
- `Layout_Mode__c`: Single_Page, Vertical_Navigation
- `Form_Type__c`: Form, Survey

**Validation Rules:**

```apex
// VR_Primary_Context_Object_Format
AND(
  NOT(ISBLANK(Primary_Context_Object__c)),
  NOT(REGEX(Primary_Context_Object__c, "^[A-Za-z][A-Za-z0-9_]*(__c)?$"))
)
// Error: "Primary Context Object must be a valid API name"

// VR_Schema_Snapshot_Required_When_Published
AND(
  ISPICKVAL(Status__c, "Published"),
  ISBLANK(Schema_Snapshot__c)
)
// Error: "Schema Snapshot is required for published forms"

// VR_Layout_Config_Required_When_Published
AND(
  ISPICKVAL(Status__c, "Published"),
  ISBLANK(Layout_Config__c)
)
// Error: "Layout Configuration is required for published forms"
```

---

### 1.2 `Form_Version__c` Object

**Purpose:** Immutable published version snapshots

| Field Name              | Type                     | Length/Precision | Required | Description                           |
| ----------------------- | ------------------------ | ---------------- | -------- | ------------------------------------- |
| **Existing Fields**     |
| `Name`                  | Auto Number              | -                | Yes      | Version identifier (e.g., "V-000001") |
| `Form__c`               | Master-Detail(Form\_\_c) | -                | Yes      | Parent form                           |
| `Version_Number__c`     | Number                   | 18,0             | Yes      | Semantic version (1, 2, 3...)         |
| `Is_Active__c`          | Checkbox                 | -                | Yes      | Only one active version per form      |
| **New Required Fields** |
| `Schema_Snapshot__c`    | Long Text Area           | 131072           | Yes      | Version-specific frozen schema        |
| `Layout_Config__c`      | Long Text Area           | 131072           | Yes      | Version-specific layout               |
| `Published_By__c`       | Lookup(User)             | -                | No       | User who published this version       |
| `Published_Date__c`     | DateTime                 | -                | Yes      | Publication timestamp                 |
| `Change_Notes__c`       | Long Text Area           | 32768            | No       | What changed in this version          |

**Unique Constraints:**

- `Version_Number__c` per `Form__c` (composite unique)

**Triggers Required:**

- `FormVersionTrigger`: Enforce single active version per form

---

### 1.3 `Form_Page__c` Object

**Purpose:** Multi-page wizard support

| Field Name                     | Type                             | Length/Precision | Required | Description                                |
| ------------------------------ | -------------------------------- | ---------------- | -------- | ------------------------------------------ |
| **Existing Fields**            |
| `Name`                         | Text                             | 80               | Yes      | Page name/title                            |
| `Form_Version__c`              | Master-Detail(Form_Version\_\_c) | -                | Yes      | Parent version                             |
| `Sequence__c`                  | Number                           | 18,0             | Yes      | Page order (1, 2, 3...)                    |
| `Skip_Condition_Expression__c` | Long Text Area                   | 4000             | No       | Expression to skip this page               |
| **New Optional Fields**        |
| `Description__c`               | Text                             | 255              | No       | Internal page description                  |
| `Show_Progress_Bar__c`         | Checkbox                         | -                | No       | Display progress indicator (default: true) |
| `Allow_Back_Navigation__c`     | Checkbox                         | -                | No       | Enable back button (default: true)         |

**Unique Constraints:**

- `Sequence__c` per `Form_Version__c` (composite unique)

**Validation Rules:**

```apex
// VR_Sequence_Must_Be_Positive
Sequence__c < 1
// Error: "Sequence must be a positive integer"
```

---

### 1.4 `Form_Section__c` Object

**Purpose:** Section grouping with repeater support

<<<<<<< ours
| Field Name | Type | Length/Precision | Required | Description |
| -------------------------- | ----------------------------- | ---------------- | -------- | ----------------------------------- |
| **Existing Fields** |
| `Name` | Text | 80 | Yes | Section title |
| `Form_Page__c` | Master-Detail(Form_Page\_\_c) | - | Yes | Parent page |
| `Sequence__c` | Number | 18,0 | Yes | Section order within page |
| `Is_Repeatable__c` | Checkbox | - | No | Auto-set for child-context sections |
| `Max_Repetitions__c` | Number | 18,0 | No | Max repeater rows |
| `Parent_SObject_API__c` | Text | 255 | No | For related sections |
| `Relationship_Name__c` | Text | 255 | No | Child relationship API name |
| `Visibility_Expression__c` | Long Text Area | 4000 | No | Section-level visibility rules |
| **New Required Fields** |
| `Context_Type__c` | Picklist | - | Yes | Parent, Related_Child |
| `Grid_Columns__c` | Number | 18,0 | No | Grid columns (1-4), default 1 |
| **New Optional Fields** |
| `Min_Repetitions__c` | Number | 18,0 | No | Min repeater rows (default: 0) |
| `Description__c` | Text | 255 | No | Section help text |
| `Collapsible__c` | Checkbox | - | No | Can section be collapsed |
| `Collapsed_By_Default__c` | Checkbox | - | No | Initially collapsed |
=======
| Field Name | Type | Length/Precision | Required | Description |
|------------|------|------------------|----------|-------------|
| **Existing Fields** |
| `Name` | Text | 80 | Yes | Section title |
| `Form_Page__c` | Master-Detail(Form_Page**c) | - | Yes | Parent page |
| `Sequence**c`| Number | 18,0 | Yes | Section order within page |
|`Is_Repeatable**c`| Checkbox | - | No | Auto-set for child-context sections |
|`Max_Repetitions**c`| Number | 18,0 | No | Max repeater rows |
|`Parent_SObject_API**c`| Text | 255 | No | For related sections |
|`Relationship_Name**c`| Text | 255 | No | Child relationship API name |
|`Visibility_Expression**c`| Long Text Area | 4000 | No | Section-level visibility rules (structured JSON, see Architecture Spec 4.3) |
| **New Required Fields** |
|`Context_Type**c`| Picklist | - | Yes | Parent, Related_Child |
|`Grid_Columns**c`| Number | 18,0 | No | Grid columns (1-4), default 1 |
| **New Optional Fields** |
|`Min_Repetitions**c`| Number | 18,0 | No | Min repeater rows (default: 0) |
|`Description**c`| Text | 255 | No | Section help text |
|`Collapsible**c`| Checkbox | - | No | Can section be collapsed |
|`Collapsed_By_Default\_\_c` | Checkbox | - | No | Initially collapsed |

> > > > > > > theirs

**Picklist Values:**

- `Context_Type__c`: Parent, Related_Child

**Validation Rules:**

```apex
// VR_Related_Child_Requires_Relationship
AND(
  ISPICKVAL(Context_Type__c, "Related_Child"),
  ISBLANK(Relationship_Name__c)
)
// Error: "Relationship Name is required for Related Child sections"

// VR_Parent_Cannot_Have_Relationship
AND(
  ISPICKVAL(Context_Type__c, "Parent"),
  NOT(ISBLANK(Relationship_Name__c))
)
// Error: "Parent sections cannot have a Relationship Name"

// VR_Grid_Columns_Range
AND(
  NOT(ISBLANK(Grid_Columns__c)),
  OR(Grid_Columns__c < 1, Grid_Columns__c > 4)
)
// Error: "Grid Columns must be between 1 and 4"

// VR_Min_Max_Repetitions
AND(
  NOT(ISBLANK(Min_Repetitions__c)),
  NOT(ISBLANK(Max_Repetitions__c)),
  Min_Repetitions__c > Max_Repetitions__c
)
// Error: "Min Repetitions cannot exceed Max Repetitions"

// VR_Collapsed_Requires_Collapsible
AND(
  Collapsed_By_Default__c = TRUE,
  Collapsible__c = FALSE
)
// Error: "Section must be Collapsible to be Collapsed by Default"
```

**Triggers Required:**

- `FormSectionTrigger`: Auto-set `Is_Repeatable__c = true` when `Context_Type__c = Related_Child`

---

### 1.5 `Form_Element__c` Object

**Purpose:** Individual form fields and elements

<<<<<<< ours
| Field Name | Type | Length/Precision | Required | Description |
| -------------------------- | -------------------------------- | ---------------- | -------- | --------------------------------------------------- |
| **Existing Fields** |
| `Name` | Text | 80 | Yes | Element label |
| `Form_Section__c` | Master-Detail(Form_Section\_\_c) | - | Yes | Parent section |
| `Sequence__c` | Number | 18,0 | Yes | Element order |
| `Type__c` | Picklist | - | Yes | Field, Static_Text, Divider, File_Upload, Signature |
| `Key__c` | Text | 255 | Yes | Unique element identifier |
| `Render_As__c` | Picklist | - | No | Input override type |
| `Column_Width__c` | Number | 18,0 | No | Grid column span |
| `Calculation_Formula__c` | Long Text Area | 4000 | No | Cross-field calculation |
| `Visibility_Expression__c` | Long Text Area | 4000 | No | Show/hide/require logic |
| `Prefill_Type__c` | Picklist | - | No | None, URL_Param, Record_Field, User_Field |
| `Prefill_Token__c` | Text | 255 | No | Token like $URL.email, $Record.Name |
| **New Required Fields** |
| `Field_API_Name__c` | Text | 255 | No\* | Bound SObject field (\*required when Type = Field) |
| `Is_Required__c` | Checkbox | - | No | Field required indicator (default: false) |
| **New Optional Fields** |
| `Help_Text__c` | Long Text Area | 1000 | No | Field help text |
| `Placeholder__c` | Text | 255 | No | Input placeholder |
| `Grid_Position__c` | Number | 18,0 | No | Position in grid (1-based) |
| `Default_Value__c` | Text | 255 | No | Static default value |
| `Min_Value__c` | Number | 18,2 | No | Numeric minimum |
| `Max_Value__c` | Number | 18,2 | No | Numeric maximum |
| `Min_Length__c` | Number | 18,0 | No | Text minimum length |
| `Max_Length__c` | Number | 18,0 | No | Text maximum length |
| `Pattern__c` | Text | 255 | No | Regex validation pattern |
| `Pattern_Error_Message__c` | Text | 255 | No | Custom pattern error |
| `Static_Text_Content__c` | Long Text Area | 32768 | No | For Type = Static_Text |
=======
| Field Name | Type | Length/Precision | Required | Description |
|------------|------|------------------|----------|-------------|
| **Existing Fields** |
| `Name` | Text | 80 | Yes | Element label |
| `Form_Section__c` | Master-Detail(Form_Section**c) | - | Yes | Parent section |
| `Sequence**c`| Number | 18,0 | Yes | Element order |
|`Type**c`| Picklist | - | Yes | Field, Static_Text, Divider, File_Upload, Signature |
|`Key**c`| Text | 255 | Yes | Unique element identifier |
|`Render_As**c`| Picklist | - | No | Input override type |
|`Column_Width**c`| Number | 18,0 | No | Grid column span |
|`Calculation_Formula**c`| Long Text Area | 4000 | No | Cross-field calculation |
|`Visibility_Expression**c`| Long Text Area | 4000 | No | Element-level visibility rules (structured JSON, see Architecture Spec 4.3) |
|`Prefill_Type**c`| Picklist | - | No | None, URL_Param, Record_Field, User_Field |
|`Prefill_Token**c`| Text | 255 | No | Token like $URL.email, $Record.Name |
| **New Required Fields** |
|`Field_API_Name**c`| Text | 255 | No* | Bound SObject field (*required when Type = Field) |
|`Is_Required**c`| Checkbox | - | No | Field required indicator (default: false) |
| **New Optional Fields** |
|`Help_Text**c`| Long Text Area | 1000 | No | Field help text |
|`Placeholder**c`| Text | 255 | No | Input placeholder |
|`Grid_Position**c`| Number | 18,0 | No | Position in grid (1-based) |
|`Default_Value**c`| Text | 255 | No | Static default value |
|`Min_Value**c`| Number | 18,2 | No | Numeric minimum |
|`Max_Value**c`| Number | 18,2 | No | Numeric maximum |
|`Min_Length**c`| Number | 18,0 | No | Text minimum length |
|`Max_Length**c`| Number | 18,0 | No | Text maximum length |
|`Pattern**c`| Text | 255 | No | Regex validation pattern |
|`Pattern_Error_Message**c`| Text | 255 | No | Custom pattern error |
|`Static_Text_Content\_\_c` | Long Text Area | 32768 | No | For Type = Static_Text |

> > > > > > > theirs

**Picklist Values:**

- `Type__c`: Field, Static_Text, Divider, File_Upload, Signature, Lookup, Formula
- `Render_As__c`: Default, Radio_Buttons, Dropdown, Checkbox_Group, Toggle, Slider, Custom_MultiSelect, Lookup_Modal, Lookup_Typeahead
- `Prefill_Type__c`: None, URL_Param, Record_Field, User_Field

**Validation Rules:**

```apex
// VR_Field_Type_Requires_API_Name
AND(
  ISPICKVAL(Type__c, "Field"),
  ISBLANK(Field_API_Name__c)
)
// Error: "Field API Name is required for Field type elements"

// VR_Static_Text_Requires_Content
AND(
  ISPICKVAL(Type__c, "Static_Text"),
  ISBLANK(Static_Text_Content__c)
)
// Error: "Static Text Content is required for Static Text elements"

// VR_Field_API_Name_Format
AND(
  NOT(ISBLANK(Field_API_Name__c)),
  NOT(REGEX(Field_API_Name__c, "^[A-Za-z][A-Za-z0-9_]*(__c)?$"))
)
// Error: "Field API Name must be a valid API name"

// VR_Min_Max_Value_Range
AND(
  NOT(ISBLANK(Min_Value__c)),
  NOT(ISBLANK(Max_Value__c)),
  Min_Value__c > Max_Value__c
)
// Error: "Min Value cannot exceed Max Value"

// VR_Min_Max_Length_Range
AND(
  NOT(ISBLANK(Min_Length__c)),
  NOT(ISBLANK(Max_Length__c)),
  Min_Length__c > Max_Length__c
)
// Error: "Min Length cannot exceed Max Length"

// VR_Prefill_Token_Required
AND(
  NOT(ISPICKVAL(Prefill_Type__c, "None")),
  ISBLANK(Prefill_Token__c)
)
// Error: "Prefill Token is required when Prefill Type is specified"
```

**Triggers Required:**

- `FormElementTrigger`: Enforce `Key__c` uniqueness per form version

---

### 1.6 `Element_Lookup_Mapping__c` Object

**Purpose:** Explicit mapping override (escape hatch)

| Field Name                    | Type                             | Length | Required | Description                     |
| ----------------------------- | -------------------------------- | ------ | -------- | ------------------------------- |
| `Form_Element__c`             | Master-Detail(Form_Element\_\_c) | -      | Yes      | Source element                  |
| `Source_SObject_Field_API__c` | Text                             | 255    | Yes      | Override implicit field mapping |
| `Target_Form_Element_Key__c`  | Text                             | 255    | No       | For cross-section dependencies  |

**Use Cases:**

- Override implicit `Field_API_Name__c` mapping
- Map hidden required fields with default values
- Cross-section calculation dependencies
- Record type field mapping overrides

---

## 2. Schema Snapshot Specification

### 2.1 JSON Schema Definition

```json
{
  "$schema": "# SECURITY: Remote schema removed (http://json-schema.org/draft-07/schema#)",
  "title": "Form Schema Snapshot",
  "type": "object",
  "required": ["snapshotVersion", "generatedAt", "apiVersion", "objects"],
  "properties": {
    "snapshotVersion": {
      "type": "string",
      "const": "1.0",
      "description": "Snapshot format version"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp"
    },
    "apiVersion": {
      "type": "string",
      "pattern": "^\\d+\\.0$",
      "description": "Salesforce API version"
    },
    "objects": {
      "type": "object",
      "description": "Map of SObject API names to metadata",
      "additionalProperties": {
        "$ref": "#/definitions/SObjectMetadata"
      }
    },
    "relationships": {
      "type": "object",
      "description": "Map of relationship keys to metadata",
      "additionalProperties": {
        "$ref": "#/definitions/RelationshipMetadata"
      }
    }
  },
  "definitions": {
    "SObjectMetadata": {
      "type": "object",
      "required": ["label", "labelPlural", "fields"],
      "properties": {
        "label": { "type": "string" },
        "labelPlural": { "type": "string" },
        "keyPrefix": { "type": "string", "maxLength": 3 },
        "createable": { "type": "boolean" },
        "updateable": { "type": "boolean" },
        "deletable": { "type": "boolean" },
        "fields": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/FieldMetadata"
          }
        },
        "recordTypes": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/RecordTypeMetadata"
          }
        }
      }
    },
    "FieldMetadata": {
      "type": "object",
      "required": ["label", "type", "createable", "updateable"],
      "properties": {
        "label": { "type": "string" },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "textarea",
            "email",
            "phone",
            "url",
            "int",
            "double",
            "currency",
            "percent",
            "date",
            "datetime",
            "time",
            "boolean",
            "picklist",
            "multipicklist",
            "reference",
            "id",
            "address",
            "location",
            "calculated"
          ]
        },
        "calculated": {
          "type": "boolean",
          "description": "Whether this is a formula field"
        },
        "calculatedFormula": {
          "type": "string",
          "description": "Server-side formula for calculated fields"
        },
        "length": { "type": "integer", "minimum": 0 },
        "precision": { "type": "integer", "minimum": 0 },
        "scale": { "type": "integer", "minimum": 0 },
        "required": { "type": "boolean" },
        "createable": { "type": "boolean" },
        "updateable": { "type": "boolean" },
        "nillable": { "type": "boolean" },
        "picklistValues": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/PicklistValue"
          }
        },
        "controllingFields": {
          "type": "object",
          "description": "Maps controlling field values to arrays of valid dependent values",
          "additionalProperties": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "referenceTo": {
          "type": "array",
          "items": { "type": "string" }
        },
        "relationshipName": { "type": "string" },
        "inlineHelpText": { "type": "string" },
        "defaultValue": {
          "type": ["string", "number", "boolean", "null"]
        }
      }
    },
    "PicklistValue": {
      "type": "object",
      "required": ["label", "value"],
      "properties": {
        "label": { "type": "string" },
        "value": { "type": "string" },
        "defaultValue": { "type": "boolean" },
        "active": { "type": "boolean" }
      }
    },
    "RecordTypeMetadata": {
      "type": "object",
      "required": ["recordTypeId", "name", "available"],
      "properties": {
        "recordTypeId": {
          "type": "string",
          "pattern": "^012[a-zA-Z0-9]{12,15}$"
        },
        "name": { "type": "string" },
        "available": { "type": "boolean" },
        "defaultRecordTypeMapping": { "type": "boolean" },
        "picklistsForRecordType": {
          "type": "object",
          "description": "Record type specific picklist values",
          "additionalProperties": {
            "type": "array",
            "items": {
              "$ref": "#/definitions/PicklistValue"
            }
          }
        }
      }
    },
    "RelationshipMetadata": {
      "type": "object",
      "required": ["childSObject", "relationshipName"],
      "properties": {
        "childSObject": { "type": "string" },
        "relationshipName": { "type": "string" },
        "cascadeDelete": { "type": "boolean" },
        "restrictedDelete": { "type": "boolean" }
      }
    }
  }
}
```

### 2.2 Example Schema Snapshot

```json
{
  "snapshotVersion": "1.0",
  "generatedAt": "2026-05-26T10:00:00.000Z",
  "apiVersion": "62.0",
  "objects": {
    "Account": {
      "label": "Account",
      "labelPlural": "Accounts",
      "keyPrefix": "001",
      "createable": true,
      "updateable": true,
      "deletable": true,
      "fields": {
        "Name": {
          "label": "Account Name",
          "type": "string",
          "length": 255,
          "required": true,
          "createable": true,
          "updateable": true,
          "nillable": false
        },
        "Industry": {
          "label": "Industry",
          "type": "picklist",
          "createable": true,
          "updateable": true,
          "nillable": true,
          "picklistValues": [
            {
              "label": "Agriculture",
              "value": "Agriculture",
              "defaultValue": false,
              "active": true
            },
            {
              "label": "Banking",
              "value": "Banking",
              "defaultValue": false,
              "active": true
            },
            {
              "label": "Technology",
              "value": "Technology",
              "defaultValue": true,
              "active": true
            }
          ],
          "controllingFields": {}
        },
        "Type": {
          "label": "Account Type",
          "type": "picklist",
          "createable": true,
          "updateable": true,
          "nillable": true,
          "picklistValues": [
            {
              "label": "Customer",
              "value": "Customer",
              "defaultValue": false,
              "active": true
            },
            {
              "label": "Partner",
              "value": "Partner",
              "defaultValue": false,
              "active": true
            }
          ],
          "controllingFields": {}
        },
        "Rating": {
          "label": "Account Rating",
          "type": "picklist",
          "createable": true,
          "updateable": true,
          "nillable": true,
          "picklistValues": [
            {
              "label": "Hot",
              "value": "Hot",
              "defaultValue": false,
              "active": true
            },
            {
              "label": "Warm",
              "value": "Warm",
              "defaultValue": false,
              "active": true
            },
            {
              "label": "Cold",
              "value": "Cold",
              "defaultValue": false,
              "active": true
            }
          ],
          "controllingFields": {
            "Type": {
              "Customer": ["Hot", "Warm"],
              "Partner": ["Warm", "Cold"]
            }
          }
        }
      },
      "recordTypes": {
        "Business": {
          "recordTypeId": "012000000000001AAA",
          "name": "Business",
          "available": true,
          "defaultRecordTypeMapping": false,
          "picklistsForRecordType": {
            "Industry": [
              {
                "label": "Banking",
                "value": "Banking",
                "defaultValue": true,
                "active": true
              },
              {
                "label": "Technology",
                "value": "Technology",
                "defaultValue": false,
                "active": true
              }
            ]
          }
        }
      }
    },
    "Contact": {
      "label": "Contact",
      "labelPlural": "Contacts",
      "keyPrefix": "003",
      "createable": true,
      "updateable": true,
      "deletable": true,
      "fields": {
        "FirstName": {
          "label": "First Name",
          "type": "string",
          "length": 40,
          "required": false,
          "createable": true,
          "updateable": true,
          "nillable": true
        },
        "LastName": {
          "label": "Last Name",
          "type": "string",
          "length": 80,
          "required": true,
          "createable": true,
          "updateable": true,
          "nillable": false
        },
        "Email": {
          "label": "Email",
          "type": "email",
          "length": 80,
          "required": false,
          "createable": true,
          "updateable": true,
          "nillable": true
        },
        "AccountId": {
          "label": "Account ID",
          "type": "reference",
          "required": false,
          "createable": true,
          "updateable": true,
          "nillable": true,
          "referenceTo": ["Account"],
          "relationshipName": "Account"
        }
      }
    }
  },
  "relationships": {
    "Account.Contacts": {
      "childSObject": "Contact",
      "relationshipName": "Contacts",
      "cascadeDelete": false,
      "restrictedDelete": false
    }
  }
}
```

---

## 3. Field Validation Rules

The field validation rules are defined per-element on the `Form_Element__c` records and enforced at two levels:

### 3.1 Metadata-Driven Validation (from Schema Snapshot)

These validations are derived automatically from the frozen schema at render time:

| Rule                  | Source Field                                           | Behavior                                              |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Required              | `FieldMetadata.required`                               | Prevents submission if field is blank                 |
| Max Length            | `FieldMetadata.length`                                 | Enforces character limit on text inputs               |
| Precision/Scale       | `FieldMetadata.precision`, `FieldMetadata.scale`       | Validates numeric input format                        |
| Picklist Values       | `FieldMetadata.picklistValues`                         | Restricts selection to active values                  |
| Dependent Picklists   | `FieldMetadata.controllingFields`                      | Filters dependent values based on controlling field   |
| Reference Target      | `FieldMetadata.referenceTo`                            | Validates lookup target SObject type                  |
| Createable/Updateable | `FieldMetadata.createable`, `FieldMetadata.updateable` | Disables field if not permitted for current operation |

### 3.2 Element-Level Validation (from Form_Element\_\_c)

These validations are configured by the form builder and override or extend schema-level rules:

| Rule              | Source Field                     | Behavior                                                          |
| ----------------- | -------------------------------- | ----------------------------------------------------------------- |
| Required Override | `Is_Required__c`                 | Can make optional schema fields required on the form              |
| Min/Max Value     | `Min_Value__c`, `Max_Value__c`   | Range validation for numeric fields                               |
| Min/Max Length    | `Min_Length__c`, `Max_Length__c` | Length validation for text fields                                 |
| Pattern           | `Pattern__c`                     | Regex validation with custom error via `Pattern_Error_Message__c` |
| Calculation       | `Calculation_Formula__c`         | Cross-field computed values (read-only)                           |
| Visibility        | `Visibility_Expression__c`       | Conditional show/hide/require logic                               |

### 3.3 Validation Execution Order

1. **Visibility evaluation** -- determine if the field is visible and/or required
2. **Required check** -- if required (by schema or element override) and visible, value must be non-blank
3. **Type coercion** -- convert input string to target type (number, date, boolean)
4. **Schema constraints** -- length, precision, scale, picklist membership
5. **Element constraints** -- min/max value, min/max length, regex pattern
6. **Cross-field calculations** -- evaluate formula expressions and populate computed fields

---

## 4. Index Strategy

Custom indexes are critical for query performance on the form hierarchy. Salesforce does not automatically index custom fields, so the following indexes should be requested via Salesforce Support or configured in scratch org definitions.

### 4.1 Required Custom Indexes

| Object            | Index Fields                      | Type      | Rationale                                                                                                                                                                                               |
| ----------------- | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Form_Version__c` | `Form__c` + `Is_Active__c`        | Composite | Every form render queries for the active version of a given form. Without this index, the platform scans all versions across all forms. This is the single most critical index for runtime performance. |
| `Form_Page__c`    | `Form_Version__c` + `Sequence__c` | Composite | Pages are always loaded in sequence order for a given version. The composite index supports both filtering by version and ordering by sequence in a single index scan.                                  |
| `Form_Section__c` | `Form_Page__c` + `Sequence__c`    | Composite | Sections within a page are loaded identically to pages within a version -- filtered by parent and ordered by sequence. Prevents full table scans when rendering individual pages.                       |
| `Form_Element__c` | `Form_Section__c` + `Sequence__c` | Composite | Elements are the most numerous records in the hierarchy. Without this index, loading a single section's elements requires scanning the entire Form_Element\_\_c table.                                  |
| `Form_Element__c` | `Key__c`                          | Single    | Element keys are used for cross-field references in visibility expressions, calculation formulas, and prefill token resolution. Also supports the uniqueness trigger on `FormElementTrigger`.           |

### 4.2 Index Sizing Considerations

- **Form_Version\_\_c indexes** have low cardinality on `Is_Active__c` (boolean), but the composite with `Form__c` makes the index highly selective since each form typically has only one active version.
- **Sequence-based composites** benefit from the narrow range of sequence values (typically 1-20), which combined with the parent foreign key produces excellent selectivity.
- **Key\_\_c** should be indexed as a unique external ID if possible, which provides both an index and a uniqueness constraint without trigger overhead.

### 4.3 Query Patterns Supported

```sql
-- Load active version for rendering (uses Form__c + Is_Active__c index)
SELECT Id, Schema_Snapshot__c, Layout_Config__c
FROM Form_Version__c
WHERE Form__c = :formId AND Is_Active__c = true

-- Load pages in order (uses Form_Version__c + Sequence__c index)
SELECT Id, Name, Sequence__c, Skip_Condition_Expression__c
FROM Form_Page__c
WHERE Form_Version__c = :versionId
ORDER BY Sequence__c ASC

-- Load sections for a page (uses Form_Page__c + Sequence__c index)
SELECT Id, Name, Sequence__c, Context_Type__c, Grid_Columns__c
FROM Form_Section__c
WHERE Form_Page__c = :pageId
ORDER BY Sequence__c ASC

-- Load elements for a section (uses Form_Section__c + Sequence__c index)
SELECT Id, Name, Key__c, Type__c, Field_API_Name__c, Sequence__c
FROM Form_Element__c
WHERE Form_Section__c = :sectionId
ORDER BY Sequence__c ASC

-- Resolve element by key (uses Key__c index)
SELECT Id, Field_API_Name__c, Calculation_Formula__c
FROM Form_Element__c
WHERE Key__c = :elementKey
```

---

## 5. Versioning Strategy

### 5.1 Core Principle: Immutable Published Versions

The versioning strategy follows an **immutable snapshot** model. Once a form version is published, its `Schema_Snapshot__c` and `Layout_Config__c` are frozen and never modified. This ensures that:

- Submitted data can always be interpreted against the schema that was active when the form was filled
- In-progress form sessions are not disrupted by admin changes
- Audit trails reference a specific, unchangeable form definition

### 5.2 Version Lifecycle

```
  +-------+         +-------+         +-----------+
  | Draft | ------> |Publish| ------> | Published |
  +-------+         +-------+         +-----------+
      ^                                     |
      |                                     v
      +--- (new version created) --- [Deactivated]
```

**Draft state:**

- The `Form__c` record and its child records (`Form_Page__c`, `Form_Section__c`, `Form_Element__c`) are freely editable.
- `Schema_Snapshot__c` and `Layout_Config__c` on `Form__c` are empty or stale (not used for rendering).
- No `Form_Version__c` record exists for the current draft.

**Publish action:**

1. The system calls the UI API `describeLayout` and `describeSObjects` to gather current metadata for all referenced SObjects and fields.
2. A `Schema_Snapshot__c` JSON is generated from the live metadata, frozen at that point in time.
3. A `Layout_Config__c` JSON is compiled from the child record hierarchy (pages, sections, elements) into a player-ready format.
4. A new `Form_Version__c` record is created with:
   - `Version_Number__c` = max existing version + 1 (or 1 if first publish)
   - `Is_Active__c` = true
   - `Schema_Snapshot__c` = the generated snapshot
   - `Layout_Config__c` = the compiled layout
   - `Published_By__c` = current user
   - `Published_Date__c` = now
5. Any previously active `Form_Version__c` for the same form is set to `Is_Active__c = false`.
6. The `Form__c` record is updated: `Status__c = Published`, `Published_Date__c = now`, and its `Schema_Snapshot__c` / `Layout_Config__c` are copied from the new version for convenience.

### 5.3 Version Numbering

- Versions use simple integer numbering: 1, 2, 3, etc.
- Version numbers are monotonically increasing and never reused.
- The `Version_Number__c` is unique per `Form__c` (enforced by composite uniqueness).
- The auto-number `Name` field (e.g., "V-000001") provides a global identifier.

### 5.4 Single Active Version Constraint

Only one `Form_Version__c` per form can have `Is_Active__c = true` at any time. This is enforced by the `FormVersionTrigger`:

```apex
trigger FormVersionTrigger on Form_Version__c(before insert, before update) {
  Set<Id> formIds = new Set<Id>();
  for (Form_Version__c v : Trigger.new) {
    if (v.Is_Active__c) {
      formIds.add(v.Form__c);
    }
  }

  if (!formIds.isEmpty()) {
    List<Form_Version__c> existing = [
      SELECT Id, Form__c
      FROM Form_Version__c
      WHERE
        Form__c IN :formIds
        AND Is_Active__c = TRUE
        AND Id NOT IN :Trigger.new
    ];

    Map<Id, Form_Version__c> activeByForm = new Map<Id, Form_Version__c>();
    for (Form_Version__c v : existing) {
      activeByForm.put(v.Form__c, v);
    }

    for (Form_Version__c v : Trigger.new) {
      if (v.Is_Active__c && activeByForm.containsKey(v.Form__c)) {
        // Deactivate the previously active version
        activeByForm.get(v.Form__c).Is_Active__c = false;
      }
    }

    update activeByForm.values();
  }
}
```

### 5.5 Rollback Support

Rolling back to a previous version does not delete data. Instead:

1. The admin selects a previous `Form_Version__c` record.
2. The system sets `Is_Active__c = true` on the selected version (the trigger deactivates the current one).
3. The `Form__c` record's `Schema_Snapshot__c` and `Layout_Config__c` are overwritten with the rolled-back version's snapshots.
4. A new `Form_Version__c` is **not** created for rollbacks -- the original version record is reactivated. This preserves the version history and makes it clear that the form reverted to a known prior state.

If the admin wants to make changes after a rollback, they edit the draft child records and publish again, creating a new version number that inherits from the current state.

---

## 6. Data Flow Diagrams

### 6.1 Form Publishing

```
Admin (Form Builder UI)
    |
    v
+---------------------------+
| Build Form Definition     |
| - Create Form_Page__c     |
| - Create Form_Section__c  |
| - Create Form_Element__c  |
| (all as editable records) |
+---------------------------+
    |
    v
+---------------------------+
| Click "Publish"           |
+---------------------------+
    |
    v
+-------------------------------+
| SchemaSnapshotService         |
| 1. Collect all SObject APIs   |
|    from elements & sections   |
| 2. Call describeSObjects()    |
| 3. Call describeLayout()      |
| 4. Build Schema_Snapshot JSON |
|    (freeze field metadata,    |
|     picklist values,          |
|     record types, etc.)       |
+-------------------------------+
    |
    v
+-------------------------------+
| LayoutCompilerService         |
| 1. Query Form_Page__c,       |
|    Form_Section__c,           |
|    Form_Element__c hierarchy  |
| 2. Compile Layout_Config JSON |
|    (page order, section grid, |
|     element rendering config) |
+-------------------------------+
    |
    v
+-------------------------------+
| VersionService                |
| 1. Create Form_Version__c    |
|    with snapshot + layout     |
| 2. Set Is_Active__c = true   |
| 3. Deactivate prior version  |
| 4. Update Form__c status     |
+-------------------------------+
    |
    v
[Published Form Version]
```

### 6.2 Form Rendering

```
End User (Browser)
    |
    v
+-----------------------------+
| LWC Adapter Component       |
| (formPlayerAdapter)          |
| 1. Receive formId or        |
|    versionId as public prop  |
| 2. Call Apex: load active   |
|    Form_Version__c record    |
| 3. Receive:                  |
|    - Schema_Snapshot__c      |
|    - Layout_Config__c        |
+-----------------------------+
    |
    | (passes definition + snapshot as props)
    v
+-----------------------------+
| LWC formPlayer Component    |
| 1. Parse Layout_Config      |
|    into page/section/element |
|    tree                      |
| 2. Parse Schema_Snapshot     |
|    for field metadata        |
| 3. Render form UI entirely  |
|    from snapshot data        |
|    (NO UI API calls)         |
| 4. Evaluate visibility      |
|    expressions               |
| 5. Resolve picklist values, |
|    dependent picklists,      |
|    record type filters       |
+-----------------------------+
    |
    v
[Rendered Form - ready for input]

Key: The formPlayer never calls describeSObjects
or describeLayout at render time. All metadata
comes from the frozen snapshot, ensuring consistent
rendering regardless of org schema changes.
```

### 6.3 Form Submission

```
End User (fills out form)
    |
    v
+-----------------------------+
| LWC formPlayer Component    |
| 1. User enters data across  |
|    pages/sections            |
| 2. Client-side validation:  |
|    - Required fields         |
|    - Type constraints        |
|    - Min/max values          |
|    - Pattern matching        |
|    - Cross-field formulas    |
| 3. Build FormPayload:       |
|    {                         |
|      parentRecord: {...},    |
|      childRecords: {         |
|        "Contacts": [...],    |
|        "Cases": [...]        |
|      },                      |
|      versionId: "...",       |
|      context: "create|edit"  |
|    }                         |
+-----------------------------+
    |
    | (emits FormPayload event)
    v
+-----------------------------+
| LWC Adapter Component       |
| (formPlayerAdapter)          |
| 1. Receive FormPayload      |
| 2. Determine DML strategy   |
|    based on context:         |
|    - Create: insert parent,  |
|      then insert children    |
|    - Edit: update parent,    |
|      upsert children         |
| 3. Call Apex controller      |
+-----------------------------+
    |
    v
+-----------------------------+
| Apex FormSubmissionService   |
| 1. Server-side validation   |
|    (re-check against         |
|     Schema_Snapshot)         |
| 2. DML operations in        |
|    single transaction:       |
|    a. Insert/update parent   |
|    b. Set parent ID on       |
|       child records          |
|    c. Insert/update children |
| 3. Return result:            |
|    - Success + record IDs    |
|    - Error + field-level     |
|      error map               |
+-----------------------------+
    |
    v
+-----------------------------+
| Adapter relays result       |
| - Success: navigate/toast   |
| - Error: map errors back    |
|   to form elements by Key   |
+-----------------------------+
```
