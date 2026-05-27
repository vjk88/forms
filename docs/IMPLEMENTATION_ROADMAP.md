# Native Forms & Surveys App - Implementation Roadmap

**Version:** 1.0  
**Last Updated:** 2026-05-26  
**Status:** Draft

---

## Table of Contents

1. [Security & Compliance](#1-security--compliance)
2. [Implementation Phases](#2-implementation-phases)
3. [Performance Strategy](#3-performance-strategy)
4. [Open Decisions & Recommendations](#4-open-decisions--recommendations)
5. [Testing Strategy](#5-testing-strategy)
6. [AppExchange Preparation](#6-appexchange-preparation)

---

## 1. Security & Compliance

### 1.1 Security Review Preparation

**Critical Areas for Security Review:**

1. **Guest User Access (Highest Scrutiny)**
   - `without sharing` Apex classes must be documented and justified
   - Manual CRUD/FLS checks required in elevated context
   - Input validation and sanitization mandatory
   - Rate limiting required
   - CAPTCHA integration recommended

2. **Data Access Controls**

   ```apex
   // REQUIRED pattern for elevated context
   public without sharing class GuestSubmissionController {
     @AuraEnabled
     public static SubmissionResult submitForm(
       String payload,
       Id formVersionId
     ) {
       // 1. Input validation
       if (String.isBlank(payload)) {
         throw new IllegalArgumentException('Payload required');
       }

       // 2. Parse and sanitize
       FormPayload parsed = FormPayload.parse(payload);
       validateAndSanitize(parsed);

       // 3. Manual CRUD check
       String objectName = parsed.primaryRecord.objectApiName;
       if (
         !Schema.getGlobalDescribe()
           .get(objectName)
           .getDescribe()
           .isCreateable()
       ) {
         throw new SecurityException('No create access');
       }

       // 4. Manual FLS check for each field
       Map<String, Schema.SObjectField> fieldMap = Schema.getGlobalDescribe()
         .get(objectName)
         .getDescribe()
         .fields
         .getMap();

       for (String fieldName : parsed.primaryRecord.fields.keySet()) {
         if (!fieldMap.get(fieldName).getDescribe().isCreateable()) {
           throw new SecurityException(
             'No create access to field: ' + fieldName
           );
         }
       }

       // 5. Execute in elevated context
       return DMLService.executeCascade(
         parsed,
         DMLService.ExecutionContext.ELEVATED_CONTEXT
       );
     }
   }
   ```

3. **Expression Engine Security**
   - NO use of `eval()` or similar dynamic code execution
   - Sandboxed expression evaluator with whitelist of functions
   - Input length limits to prevent DoS
   - Recursion depth limits

4. **File Upload Security**

   ```javascript
   // Client-side validation
   validateFile(file) {
       const MAX_SIZE = 25 * 1024 * 1024; // 25MB
       const ALLOWED_TYPES = [
           'image/jpeg', 'image/png', 'image/gif',
           'application/pdf', 'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
       ];

       if (file.size > MAX_SIZE) {
           throw new Error('File exceeds 25MB limit');
       }

       if (!ALLOWED_TYPES.includes(file.type)) {
           throw new Error('File type not allowed');
       }
   }

   // Apex-side validation
   public static void validateContentVersion(ContentVersion cv) {
       // Check file size
       if (cv.ContentSize > 25 * 1024 * 1024) {
           throw new FileSizeException('File exceeds 25MB limit');
       }

       // Virus scanning if available
       // Anti-malware check
       // Content type validation
   }
   ```

### 1.2 Data Privacy & GDPR Compliance

**Required Features:**

1. **Data Retention Policies**
   - Form submission data retention configuration
   - Automated purging of old submissions
   - Export functionality for data portability

2. **Consent Management**
   - Configurable consent checkboxes on forms
   - Consent tracking in submission records
   - Audit trail for consent changes

3. **Right to Be Forgotten**
   - Deletion API for submitted form data
   - Cascading delete of related records
   - Audit log of deletions

### 1.3 Sharing & Visibility Model

**Object-Level Security:**

| Object            | OWD                  | Sharing                          |
| ----------------- | -------------------- | -------------------------------- |
| `Form__c`         | Private              | Manual sharing via sharing rules |
| `Form_Version__c` | Controlled by Parent | Inherits from `Form__c`          |
| `Form_Page__c`    | Controlled by Parent | Inherits from `Form_Version__c`  |
| `Form_Section__c` | Controlled by Parent | Inherits from `Form_Page__c`     |
| `Form_Element__c` | Controlled by Parent | Inherits from `Form_Section__c`  |

**Permission Sets Required:**

```xml
<!-- Form Builder Permission Set -->
<PermissionSet>
    <objectPermissions>
        <object>Form__c</object>
        <allowCreate>true</allowCreate>
        <allowRead>true</allowRead>
        <allowEdit>true</allowEdit>
        <allowDelete>true</allowDelete>
    </objectPermissions>
    <!-- Similar for all form definition objects -->
</PermissionSet>

<!-- Form Publisher Permission Set -->
<PermissionSet>
    <classAccesses>
        <apexClass>PublishService</apexClass>
        <enabled>true</enabled>
    </classAccesses>
</PermissionSet>
```

---

## 2. Implementation Phases

### Phase 0: Foundation (Weeks 1-4)

**Deliverables:**

- [ ] Complete data model implementation
- [ ] All custom objects with fields
- [ ] Validation rules
- [ ] Triggers for unique constraints
- [ ] Base Apex service classes (empty stubs)
- [ ] Package structure and namespace

**Key Tasks:**

1. Create all custom objects using `generating-custom-object` skill
2. Create all custom fields using `generating-custom-field` skill
3. Implement validation rules
4. Set up package.xml for managed package
5. Configure namespace

**Acceptance Criteria:**

- All objects deployable to scratch org
- No deployment errors
- Validation rules functional

---

### Phase 1: Internal Record-Page Adapter (Weeks 5-12)

**Why First:**

- Lowest platform resistance
- Fully authenticated context
- Can use Lightning Data Service
- Security Review friendly
- First sellable product

**Deliverables:**

- [ ] PublishService (schema snapshot generation)
- [ ] SchemaService (UI API wrapper)
- [ ] Basic builder LWC (drag-drop interface)
- [ ] formPlayer core engine
- [ ] formFieldText, formFieldPicklist renderers
- [ ] Internal record-page adapter
- [ ] DMLService (user context mode)
- [ ] Simple form publish workflow

**Component Build Order:**

1. **PublishService** - schema snapshot generation
2. **formPlayer** - core orchestrator (read-only mode)
3. **formFieldText** - simplest field renderer
4. **formFieldPicklist** - reads from snapshot
5. **formSection** - layout container
6. **formWizard** - multi-page navigation
7. **Builder** - basic drag-drop canvas
8. **DMLService** - user context DML
9. **Internal adapter** - ties it together

**Testing:**

- Unit tests for all Apex classes (75%+ coverage)
- Jest tests for all LWC components
- Integration test: Build → Publish → Render → Submit

---

### Phase 2: Advanced Features (Weeks 13-20)

**Deliverables:**

- [ ] Expression engine (visibility + calculations)
- [ ] formFieldCustomMultiSelect
- [ ] formSectionRepeater (child contexts)
- [ ] formFieldFileUpload
- [ ] formFieldSignature
- [ ] Advanced builder features (grid layout, repeaters)
- [ ] Validation engine

**Key Milestones:**

1. Expression engine with full grammar support
2. Custom multi-select with pills UI
3. Section repeaters for child relationships
4. Chunked file upload
5. Signature capture

**Testing:**

- Expression parser unit tests
- File upload stress tests (25MB files)
- Repeater with 50+ rows

---

### Phase 3: Flow Screen Adapter (Weeks 21-24)

**Why Second:**

- Builds on existing engine
- No DML complexity
- Flow I/O contract is well-defined
- Authenticated context

**Deliverables:**

- [ ] Flow screen component wrapper
- [ ] Flow input/output property mapping
- [ ] FlowAttributeChangeEvent integration
- [ ] Validate() callback implementation
- [ ] Flow examples and documentation

**Testing:**

- Flow integration tests
- Multi-step flow scenarios
- Data passing verification

---

### Phase 4: Public/External Adapter (Weeks 25-36)

**Why Last:**

- Highest complexity
- Guest user constraints
- Security Review scrutiny
- `without sharing` Apex required

**Deliverables:**

- [ ] Guest submission controller (`without sharing`)
- [ ] DMLService elevated context mode
- [ ] Rate limiting service
- [ ] CAPTCHA integration
- [ ] Guest user setup assistant
- [ ] Public site template
- [ ] Security documentation

**Security Hardening:**

1. Manual CRUD/FLS checks
2. Input sanitization
3. Rate limiting (per-IP + per-form)
4. CAPTCHA v3 integration
5. Audit logging
6. Monitoring dashboard

**Org Setup Requirements:**

- Guest user sharing rules
- Default owner configuration
- Guest user permissions
- Site guest user license
- CSP Trusted Sites

**Testing:**

- Security penetration testing
- Load testing (1000+ concurrent submissions)
- Guest user permission validation
- Rate limiting verification

---

### Phase 5: Survey Mode & Polish (Weeks 37-40)

**Deliverables:**

- [ ] Survey-specific UI enhancements
- [ ] Anonymous submission tracking
- [ ] Survey results dashboard
- [ ] Submission analytics
- [ ] Documentation finalization
- [ ] Video tutorials

---

## 3. Performance Strategy

### 3.1 Governor Limit Mitigation

**SOQL Limits:**

```apex
// ANTI-PATTERN: Querying in loops
for (Form_Page__c page : pages) {
    List<Form_Section__c> sections = [
        SELECT Id FROM Form_Section__c WHERE Form_Page__c = :page.Id
    ];
}

// CORRECT: Query relationships once
List<Form_Page__c> pages = [
    SELECT Id, (SELECT Id FROM Form_Sections__r)
    FROM Form_Page__c
    WHERE Form_Version__c = :versionId
];
```

**Heap Limits:**

```apex
// File upload chunking
public static void uploadFileInChunks(String base64Data, Id parentId) {
    final Integer CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks

    Integer offset = 0;
    String fileId;

    while (offset < base64Data.length()) {
        Integer endIndex = Math.min(
            offset + CHUNK_SIZE,
            base64Data.length()
        );

        String chunk = base64Data.substring(offset, endIndex);

        if (offset == 0) {
            // First chunk: create ContentVersion
            fileId = createContentVersion(chunk, parentId, false);
        } else {
            // Subsequent chunks: append
            appendChunk(fileId, chunk);
        }

        offset = endIndex;
    }

    // Finalize
    finalizeContentVersion(fileId);
}
```

### 3.2 Client-Side Performance

**Lazy Loading:**

```javascript
// formPlayer.js
async connectedCallback() {
    // Load definition first (small payload)
    const definition = await this.loadDefinition();

    // Render skeleton
    this.renderSkeleton(definition);

    // Load schema snapshot (large payload) in background
    const snapshot = await this.loadSchemaSnapshot();

    // Hydrate full form
    this.hydrateForm(definition, snapshot);
}
```

**Virtual Scrolling for Large Forms:**

```javascript
// For forms with 100+ fields
import { LightningElement } from "lwc";
import { VirtualScroller } from "c/virtualScroller";

export default class FormPlayer extends LightningElement {
  renderedElements = [];

  handleScroll(event) {
    const viewport = event.target;
    const visibleRange = this.calculateVisibleRange(viewport);

    // Only render elements in visible range + buffer
    this.renderedElements = this.elements.slice(
      Math.max(0, visibleRange.start - 5),
      Math.min(this.elements.length, visibleRange.end + 5)
    );
  }
}
```

### 3.3 Caching Strategy

**Platform Cache:**

```apex
public class SchemaService {
  private static final String CACHE_PARTITION = 'local.FormSchemaCache';
  private static final Integer TTL_SECONDS = 3600; // 1 hour

  public static ObjectMetadata getObjectInfo(String objectApiName) {
    String cacheKey = 'objectInfo_' + objectApiName;

    // Try cache first
    Cache.OrgPartition orgPart = Cache.Org.getPartition(CACHE_PARTITION);

    ObjectMetadata cached = (ObjectMetadata) orgPart.get(cacheKey);

    if (cached != null) {
      return cached;
    }

    // Cache miss: fetch from describe
    ObjectMetadata metadata = fetchObjectInfo(objectApiName);

    // Store in cache
    orgPart.put(cacheKey, metadata, TTL_SECONDS);

    return metadata;
  }
}
```

---

## 4. Open Decisions & Recommendations

### 4.1 Form Versioning Strategy

**RECOMMENDED: Immutable Published Versions**

**Rationale:**

- In-flight submissions won't break
- Audit trail of what users saw
- A/B testing capability
- Rollback support

**Implementation:**

```
Draft Form (editable)
    └─> Publish (creates Version 1)
        └─> Edit creates new Draft
            └─> Publish (creates Version 2)

Active version serves all new submissions
Old versions remain accessible for historical submissions
```

**Alternative Considered:** Mutable versions with "effective date" ranges

- **Rejected:** Too complex, breaks in-flight submissions

---

### 4.2 Definition Storage

**RECOMMENDED: Hybrid Approach**

1. **Builder Phase:** Edit as child records
   - Queryable
   - Report-friendly
   - Relational integrity

2. **Publish Phase:** Compile to JSON
   - Store in `Layout_Config__c`
   - Single-query load
   - No governor limit pressure

**Implementation:**

```apex
public static void publish(Id formId) {
    // Query child records
    List<Form_Page__c> pages = queryFullHierarchy(formId);

    // Compile to JSON
    LayoutConfig config = LayoutConfig.build(pages);

    // Store in version
    version.Layout_Config__c = JSON.serialize(config);
}
```

---

### 4.3 Expression Language

**RECOMMENDED: Custom DSL (Domain-Specific Language)**

**Rationale:**

- Full control over security
- Tailored to form use cases
- No eval() risk
- Security Review friendly

**Example Expressions:**

```
// Visibility
$Account.Type == "Customer" AND $Account.Industry != "Government"

// Calculation
$Quantity * $Unit_Price * (1 - $Discount_Percent / 100)

// Skip condition
$Page1.Satisfaction_Rating >= 4

// Required-if
$Contact.Email == "" AND $Contact.Phone == ""
```

**Alternative Considered:** Using an existing expression library (e.g., a JavaScript `eval()`-based parser or a third-party formula engine).

- **Rejected:** Introduces unacceptable security risk. Third-party expression libraries typically rely on `eval()` or `Function()` constructors internally, lack a proper sandbox, and cannot guarantee safe execution in a multi-tenant Salesforce environment. A custom DSL allows a strict whitelist of operators and functions, bounded recursion depth, and no dynamic code execution -- all requirements for passing the AppExchange Security Review.

---

## 5. Testing Strategy

### 5.1 Coverage Requirements

All Apex code must maintain **75% or higher** code coverage to meet Salesforce deployment requirements. The project targets **85%+** as an internal standard to ensure meaningful test coverage beyond the platform minimum.

LWC components are tested with **Jest** using the `@salesforce/sfdx-lwc-jest` framework. Every component must have a corresponding `__tests__` directory with at least one test file.

### 5.2 Test Categories

**Apex Unit Tests**

| Area        | What to Test                                                                    |
| ----------- | ------------------------------------------------------------------------------- |
| Triggers    | Key uniqueness enforcement, active version toggling, cascade behavior           |
| Services    | `PublishService`, `DMLService`, `SchemaService`, `ExpressionEngine`             |
| Validation  | Required field enforcement, conditional visibility rules, expression evaluation |
| Controllers | `GuestSubmissionController` input validation, CRUD/FLS checks, error handling   |
| Utilities   | JSON serialization/deserialization, schema snapshot compilation                 |

**LWC Jest Tests**

| Area         | What to Test                                                           |
| ------------ | ---------------------------------------------------------------------- |
| Rendering    | Correct field types render based on definition, conditional visibility |
| Events       | Custom events fire with correct payloads, parent-child communication   |
| Calculations | Expression-driven field values update on dependency changes            |
| Validation   | Client-side required field highlighting, format validation messages    |
| Navigation   | Multi-page wizard forward/back, progress indicator state               |

**Integration Tests**

End-to-end lifecycle tests covering the full pipeline:

1. **Build** -- Create form definition via builder, add pages/sections/elements
2. **Publish** -- Compile to JSON snapshot, activate version
3. **Render** -- Load published form in `formPlayer`, verify layout matches definition
4. **Submit** -- Fill fields, trigger validations, execute DML, verify created records

### 5.3 Test Data Strategy

Use the **TestDataFactory** pattern to create consistent, reusable form hierarchies in test classes:

```apex
@IsTest
public class TestDataFactory {
  public static Form__c createForm(String name) {
    Form__c form = new Form__c(Name = name);
    insert form;
    return form;
  }

  public static Form_Version__c createVersion(
    Id formId,
    Integer versionNumber,
    Boolean isActive
  ) {
    Form_Version__c version = new Form_Version__c(
      Form__c = formId,
      Version_Number__c = versionNumber,
      Is_Active__c = isActive
    );
    insert version;
    return version;
  }

  public static Form_Page__c createPage(
    Id versionId,
    String label,
    Integer order
  ) {
    Form_Page__c page = new Form_Page__c(
      Form_Version__c = versionId,
      Label__c = label,
      Order__c = order
    );
    insert page;
    return page;
  }

  public static Form_Section__c createSection(
    Id pageId,
    String label,
    Integer order
  ) {
    Form_Section__c section = new Form_Section__c(
      Form_Page__c = pageId,
      Label__c = label,
      Order__c = order
    );
    insert section;
    return section;
  }

  public static Form_Element__c createTextElement(
    Id sectionId,
    String label,
    Integer order,
    Boolean isRequired
  ) {
    Form_Element__c element = new Form_Element__c(
      Form_Section__c = sectionId,
      Label__c = label,
      Element_Type__c = 'Text',
      Order__c = order,
      Is_Required__c = isRequired
    );
    insert element;
    return element;
  }

  /**
   * Creates a complete form hierarchy for integration tests:
   * Form -> Version -> Page -> Section -> Elements
   */
  public static Form_Version__c createCompleteForm(
    String formName,
    Integer elementCount
  ) {
    Form__c form = createForm(formName);
    Form_Version__c version = createVersion(form.Id, 1, true);
    Form_Page__c page = createPage(version.Id, 'Page 1', 1);
    Form_Section__c section = createSection(page.Id, 'Section 1', 1);

    for (Integer i = 1; i <= elementCount; i++) {
      createTextElement(section.Id, 'Field ' + i, i, false);
    }

    return version;
  }
}
```

### 5.4 Key Test Scenarios

**Single Active Version Enforcement**

```apex
@IsTest
static void shouldDeactivatePreviousVersionOnPublish() {
    Form__c form = TestDataFactory.createForm('Test Form');
    Form_Version__c v1 = TestDataFactory.createVersion(form.Id, 1, true);

    Form_Version__c v2 = TestDataFactory.createVersion(form.Id, 2, true);

    v1 = [SELECT Is_Active__c FROM Form_Version__c WHERE Id = :v1.Id];
    System.assertEquals(false, v1.Is_Active__c,
        'Previous version should be deactivated when new version is activated');
}
```

**Key Uniqueness Across Versions**

Verify that element keys remain unique within a form version but can be reused across different forms. Verify that duplicate keys within a single version are rejected by trigger logic.

**Expression Engine Edge Cases**

| Scenario                  | Input                                      | Expected Result                                    |
| ------------------------- | ------------------------------------------ | -------------------------------------------------- |
| Null handling             | `$Field1 + $Field2` where `Field2` is null | Treat null as 0 for numeric, empty string for text |
| Division by zero          | `$Total / $Count` where `Count` is 0       | Return null, do not throw exception                |
| Circular references       | `FieldA = $FieldB`, `FieldB = $FieldA`     | Detect cycle at publish time, reject with error    |
| Deeply nested expressions | `((($A + $B) * $C) / $D) - $E`             | Evaluate correctly respecting operator precedence  |
| Invalid field references  | `$NonExistent.Field`                       | Return null, log warning                           |
| String comparison         | `$Status == "Active"`                      | Case-sensitive exact match                         |

**File Upload Limits**

- Upload at exactly 25MB boundary -- should succeed
- Upload at 25MB + 1 byte -- should be rejected with clear error
- Upload with disallowed MIME type -- should be rejected
- Verify chunked upload reassembly produces identical file content

**Repeater Min/Max Rows**

- Repeater with `min_rows = 1` prevents removing the last row
- Repeater with `max_rows = 10` disables the add-row button at limit
- Repeater with 50+ rows renders without performance degradation
- Deleting a row in the middle correctly re-indexes remaining rows

### 5.5 Security Testing

**CRUD/FLS Enforcement in Elevated Context**

```apex
@IsTest
static void shouldEnforceFLSInWithoutSharingContext() {
    // Create a user with no FLS access to a specific field
    User restrictedUser = TestDataFactory.createRestrictedUser();

    System.runAs(restrictedUser) {
        try {
            GuestSubmissionController.submitForm(
                payloadWithRestrictedField, versionId
            );
            System.assert(false, 'Should have thrown SecurityException');
        } catch (SecurityException e) {
            System.assert(e.getMessage().contains('No create access'),
                'Should report FLS violation');
        }
    }
}
```

**Expression Injection Attempts**

Test that the expression engine rejects or safely handles:

- SOQL injection attempts: `$Field"; DELETE FROM Account; //`
- Script injection: `<script>alert(1)</script>`
- Excessively long expressions (10,000+ characters)
- Expressions with disallowed function calls

**Rate Limiting Verification**

- Verify that exceeding the per-IP submission threshold returns HTTP 429
- Verify that exceeding the per-form submission threshold returns HTTP 429
- Verify that rate limit counters reset after the configured window

### 5.6 Performance Testing

**Large Form Rendering**

- Forms with **100+ fields** across multiple pages load within 3 seconds
- Schema snapshot deserialization for large forms stays within heap limits
- Virtual scrolling activates for forms exceeding the field threshold

**Repeater Stress Testing**

- **50+ repeater rows** render without exceeding LWC rendering budget
- Adding/removing rows at scale does not cause UI lag
- DML for 50 child records stays within governor limits

**Concurrent Submission Testing**

- Simulate **100+ concurrent form submissions** to verify:
  - No record locking conflicts on unrelated submissions
  - Rate limiting engages correctly under load
  - DML service handles bulk operations within governor limits
  - No data corruption from race conditions

---

## 6. AppExchange Preparation

### 6.1 Security Review Checklist

The Salesforce AppExchange Security Review is the primary gate for listing. The following items must be verified before submission.

**Code Security**

- [ ] No use of `eval()`, `Function()`, or dynamic code execution in JavaScript
- [ ] No dynamic SOQL or SOSL -- all queries use bind variables or parameterized queries
- [ ] Manual CRUD/FLS enforcement in all `without sharing` Apex classes
- [ ] All elevated access (guest user context) documented with business justification
- [ ] Input validation and sanitization on all user-provided data
- [ ] Expression engine uses a whitelist-only parser with no dynamic dispatch
- [ ] No hardcoded credentials, API keys, or sensitive data in source
- [ ] All external HTTP callouts use Named Credentials (if applicable)

**Platform Compliance**

- [ ] No use of `@SuppressWarnings` to hide security issues
- [ ] All Visualforce pages use CSRF tokens (if Visualforce is used)
- [ ] Lightning Locker Service / Lightning Web Security compatibility verified
- [ ] Content Security Policy (CSP) headers respected -- no inline scripts
- [ ] All custom objects and fields use the managed package namespace prefix

**Documentation for Review**

- [ ] Written justification for every `without sharing` class
- [ ] Architecture diagram showing data flow for guest user submissions
- [ ] List of all permission sets and their intended audience
- [ ] Description of rate limiting implementation and thresholds

### 6.2 Packaging

**Second-Generation Managed Package (2GP)**

The app will be packaged as a second-generation managed package for AppExchange distribution.

**Setup Steps:**

1. **Namespace Registration**
   - Register a namespace (e.g., `nforms`) in a dedicated Dev Hub org
   - Namespace is permanent and cannot be changed after registration
   - All custom objects, fields, classes, and components will be prefixed

2. **Package Configuration**

   ```json
   // sfdx-project.json
   {
     "packageDirectories": [
       {
         "path": "force-app",
         "default": true,
         "package": "NativeFormsAndSurveys",
         "versionName": "ver 1.0",
         "versionNumber": "1.0.0.NEXT",
         "definitionFile": "config/project-scratch-def.json"
       }
     ],
     "namespace": "nforms",
     "sfdcLoginUrl": "https://login.salesforce.com",
     "sourceApiVersion": "62.0"
   }
   ```

3. **Package Versioning**
   - Use semantic versioning: `MAJOR.MINOR.PATCH.BUILD`
   - Major version bumps for breaking changes to public APIs
   - Minor version bumps for new features
   - Patch version bumps for bug fixes
   - Build numbers auto-increment via `NEXT` keyword

4. **Package Creation and Promotion**

   ```bash
   # Create the package (one-time)
   sf package create --name "NativeFormsAndSurveys" \
       --package-type Managed --path force-app

   # Create a package version
   sf package version create --package "NativeFormsAndSurveys" \
       --installation-key-bypass --wait 20 --code-coverage

   # Promote to released (required for AppExchange)
   sf package version promote \
       --package "NativeFormsAndSurveys@1.0.0-1"
   ```

### 6.3 ISVforce Program Requirements

**Partner Business Org**

- Register as a Salesforce Partner via the Salesforce Partner Program
- Obtain a Partner Business Org (PBO) for managing listings and licenses
- Complete the ISVforce program onboarding

**Security Review Submission**

1. Prepare a **demo org** with the package installed and configured with sample data
2. Provide **login credentials** for the demo org to the security review team
3. Submit the **security questionnaire** detailing:
   - Architecture overview
   - Data flow diagrams
   - Authentication and authorization model
   - Guest user access justification
4. Provide **test instructions** for the review team to exercise all features
5. Expected timeline: 4-8 weeks for initial review; address findings and resubmit as needed

**Listing Creation**

- Write AppExchange listing copy (title, tagline, description, features)
- Prepare screenshots and demo video (minimum 3 screenshots, recommended 1 video)
- Define pricing model (per-user, per-org, tiered)
- Set edition compatibility (Enterprise, Unlimited, etc.)
- Create a listing landing page and support portal URL

### 6.4 Required Documentation

**Admin Guide**

- Installation and initial configuration instructions
- Permission set assignment guide
- Guest user and public site setup walkthrough
- Rate limiting and security configuration
- Troubleshooting common issues

**Developer Guide**

- Data model reference with object and field descriptions
- Expression language syntax and function reference
- Adapter architecture and extension points
- API reference for any public Apex methods
- Custom event reference for LWC inter-component communication

**Release Notes Template**

Each release must include:

- Version number and release date
- New features with descriptions
- Bug fixes with issue references
- Known issues and workarounds
- Upgrade instructions (if any manual steps required)
- Deprecation notices (if applicable)

### 6.5 Post-Launch

**Customer Support Plan**

- Establish a support portal with knowledge base articles
- Define SLAs: Critical (4-hour response), High (1 business day), Standard (3 business days)
- Set up case routing from AppExchange listing to support queue
- Create an internal runbook for common support scenarios
- Monitor AppExchange reviews and respond within 48 hours

**Upgrade Path for Future Versions**

- Maintain backward compatibility for at least one major version
- Provide automated post-install scripts (`PostInstallClass`) for data migrations
- Publish upgrade guides with each major release
- Support side-by-side testing in sandbox before production upgrade
- Notify subscribers 30 days in advance of breaking changes

**Deprecation Policy for Old API Versions**

- Public Apex methods marked `@Deprecated` must remain functional for two major versions
- Deprecated features are documented in release notes at time of deprecation
- Removal timeline is communicated at least 6 months in advance
- Customers on deprecated versions receive targeted upgrade communications
- End-of-life versions no longer receive bug fixes or security patches
