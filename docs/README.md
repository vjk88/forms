# Native Forms & Surveys App - Technical Documentation

**Project:** 100% Native Salesforce Forms & Surveys Engine  
**Distribution:** Managed Package (2GP), AppExchange ISVforce  
**Last Updated:** 2026-05-26

---

## 📚 Documentation Overview

This folder contains comprehensive technical specifications for the Native Forms & Surveys App. All documents are based on the [Technical Design Specification](../proj%20plan1) and provide implementation-ready details.

### Core Documents

1. **[DATA_MODEL_SPECIFICATION.md](./DATA_MODEL_SPECIFICATION.md)**
   - Complete field definitions for all custom objects
   - Schema snapshot JSON structure
   - Validation rules and constraints
   - Index strategy for performance
   - Field-level technical specifications

2. **[ARCHITECTURE_SPECIFICATION.md](./ARCHITECTURE_SPECIFICATION.md)**
   - Three-layer architecture (Definition → Engine → Adapters)
   - LWC component hierarchy and responsibilities
   - Apex service layer design
   - Expression engine grammar and implementation
   - Data flow sequences

3. **[IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)**
   - Security & compliance requirements
   - Phased implementation plan (Phases 0-5)
   - Performance optimization strategies
   - Open decisions with recommendations
   - AppExchange preparation checklist

---

## 🎯 Quick Start Guide

### For Developers

**Starting Development:**

1. Read the [Technical Design Specification](../proj%20plan1) first for context
2. Review [DATA_MODEL_SPECIFICATION.md](./DATA_MODEL_SPECIFICATION.md) for data structures
3. Implement Phase 0: Foundation using the roadmap

**Key Implementation Order:**

```
Phase 0: Data Model (Weeks 1-4)
    ↓
Phase 1: Internal Record-Page Adapter (Weeks 5-12)
    ↓
Phase 2: Advanced Features (Weeks 13-20)
    ↓
Phase 3: Flow Screen Adapter (Weeks 21-24)
    ↓
Phase 4: Public/External Adapter (Weeks 25-36)
    ↓
Phase 5: Polish & Launch (Weeks 37-40)
```

### For Architects

**Architecture Review Checklist:**

- [ ] Review three-layer separation (L1/L2/L3)
- [ ] Understand schema snapshot concept (guest-user enabler)
- [ ] Validate security model for `without sharing` Apex
- [ ] Review expression engine for Security Review compliance
- [ ] Confirm governor limit mitigation strategies

---

## 🔑 Key Architectural Decisions

### 1. Schema Snapshot Strategy

**Problem:** Guest users cannot access UI API at runtime.

**Solution:** Generate frozen schema snapshot at publish time containing:

- Field metadata
- Picklist values (per record type)
- Dependency maps
- Object permissions

**Impact:** All three adapters (Internal, Flow, Public) use the same engine with identical behavior.

### 2. Context-Parameterized DML Service

**Problem:** Different execution contexts require different sharing models.

**Solution:** Single DML service with `ExecutionContext` enum:

- `USER_CONTEXT`: Respects sharing/FLS automatically
- `ELEVATED_CONTEXT`: `without sharing` with manual CRUD/FLS checks

**Impact:** No code duplication; Security Review can audit one implementation.

### 3. Immutable Published Versions

**Problem:** Editing live forms breaks in-flight submissions.

**Solution:** Publishing creates a new `Form_Version__c` record with frozen snapshot.

**Impact:** Audit trail, rollback capability, A/B testing support.

### 4. Hybrid Definition Storage

**Problem:** Need both editability and performance.

**Solution:**

- **Builder:** Edit as relational child records (queryable)
- **Publish:** Compile to single JSON blob (single-query load)

**Impact:** Best of both worlds - admin UX and runtime performance.

---

## 📊 Data Model Summary

### Core Objects Hierarchy

```
Form__c (master form)
└── Form_Version__c (immutable versions)
    └── Form_Page__c (multi-page support)
        └── Form_Section__c (sections with repeaters)
            └── Form_Element__c (fields and controls)
                └── Element_Lookup_Mapping__c (escape hatch)
```

### Critical Fields Added

**Form\_\_c:**

- `Primary_Context_Object__c` - Primary SObject API name
- `Schema_Snapshot__c` - Frozen schema JSON (131KB)
- `Layout_Config__c` - Compiled player JSON (131KB)
- `Form_Type__c` - Form vs Survey

**Form_Version\_\_c:**

- `Schema_Snapshot__c` - Version-specific snapshot
- `Layout_Config__c` - Version-specific layout
- `Is_Active__c` - Only one active per form

**Form_Section\_\_c:**

- `Context_Type__c` - Parent vs Related_Child
- `Grid_Columns__c` - 1-4 column grid layout

**Form_Element\_\_c:**

- `Field_API_Name__c` - Bound SObject field
- `Is_Required__c` - Required indicator
- `Pattern__c` - Regex validation

---

## 🏗️ Component Architecture

### LWC Component Tree

```
formPlayer (orchestrator)
├── formWizard
│   ├── formPage
│   │   ├── formSection
│   │   │   ├── formElement
│   │   │   │   ├── formFieldText
│   │   │   │   ├── formFieldPicklist
│   │   │   │   ├── formFieldCustomMultiSelect
│   │   │   │   ├── formFieldFileUpload
│   │   │   │   └── formFieldSignature
│   │   │   └── formSectionRepeater
│   │   └── formProgressBar
│   └── formNavigationButtons
└── formValidationSummary
```

### Apex Service Layer

```
FormServices
├── PublishService - Schema snapshot generation
├── SchemaService - UI API wrapper
├── DMLService - Context-parameterized DML
├── ValidationService - Pre-publish validation
└── ExpressionService - Visibility/calculation engine
```

---

## 🔒 Security Highlights

### Security Review Readiness

**Critical Areas:**

1. ✅ `without sharing` documented and minimal surface area
2. ✅ Manual CRUD/FLS checks in elevated context
3. ✅ No `eval()` in expression engine
4. ✅ Input validation and sanitization
5. ✅ Rate limiting and CAPTCHA integration
6. ✅ File upload security (size, type, virus scan)

### Guest User Pattern

```apex
public without sharing class GuestSubmissionController {
  @AuraEnabled
  public static SubmissionResult submitForm(String payload, Id formId) {
    // 1. Validate input
    FormPayload parsed = FormPayload.parse(payload);

    // 2. Manual CRUD check
    if (!hasCRUDAccess(parsed.objectApiName)) {
      throw new SecurityException('No CRUD access');
    }

    // 3. Manual FLS check per field
    validateFLS(parsed.fields);

    // 4. Execute in elevated context
    return DMLService.executeCascade(
      parsed,
      DMLService.ExecutionContext.ELEVATED_CONTEXT
    );
  }
}
```

---

## ⚡ Performance Strategy

### Governor Limit Mitigation

1. **SOQL Optimization**
   - Query relationships once, not in loops
   - Use child relationship queries
   - Single query for version + snapshot + layout

2. **Heap Management**
   - Chunked file uploads (4MB chunks)
   - Lazy load schema snapshot
   - Virtual scrolling for large forms

3. **Caching**
   - Platform Cache for schema metadata
   - Client-side caching of definitions
   - 1-hour TTL on object/field metadata

### Performance Targets

| Metric           | Target       | Critical For     |
| ---------------- | ------------ | ---------------- |
| Form load time   | < 2 seconds  | User experience  |
| Publish time     | < 30 seconds | Admin experience |
| Submit time      | < 5 seconds  | User experience  |
| File upload      | 25MB max     | Platform limits  |
| Concurrent users | 1000+        | Public forms     |

---

## 📋 Implementation Checklist

### Phase 0: Foundation (Weeks 1-4)

- [ ] Create all 6 custom objects
- [ ] Add all missing fields per DATA_MODEL_SPECIFICATION.md
- [ ] Implement validation rules
- [ ] Create triggers for constraints
- [ ] Set up package structure

### Phase 1: Internal Adapter (Weeks 5-12)

- [ ] PublishService with schema snapshot generation
- [ ] formPlayer core engine
- [ ] Basic field renderers (Text, Picklist)
- [ ] Internal record-page adapter
- [ ] DMLService (user context)

### Phase 2: Advanced Features (Weeks 13-20)

- [ ] Expression engine
- [ ] Custom multi-select
- [ ] Section repeaters
- [ ] File upload + signature

### Phase 3: Flow Adapter (Weeks 21-24)

- [ ] Flow screen component wrapper
- [ ] Flow I/O integration

### Phase 4: Public Adapter (Weeks 25-36)

- [ ] Guest submission controller
- [ ] Elevated context DML
- [ ] Rate limiting + CAPTCHA
- [ ] Security hardening

### Phase 5: Polish (Weeks 37-40)

- [ ] Survey mode
- [ ] Analytics dashboard
- [ ] Documentation + videos

---

## 🎓 Key Concepts

### Schema Snapshot

A frozen JSON representation of all object/field metadata captured at publish time. This is what enables guest users to render forms without runtime UI API access.

### Context-Agnostic Engine

The formPlayer LWC doesn't know if it's rendering for an authenticated user or a guest. It only knows the definition and the data context provided by the adapter.

### Three Adapters

1. **Internal** - Authenticated, has recordId, uses LDS
2. **Flow** - Authenticated, no DML, outputs to variables
3. **Public** - Guest, elevated DML, creates records

### Expression Engine

A sandboxed evaluator for visibility rules and calculations. Uses custom DSL, not `eval()`, for Security Review compliance.

---

## 📞 Next Steps

1. **Review** the [Technical Design Specification](../proj%20plan1)
2. **Study** the three technical spec documents in this folder
3. **Start** with Phase 0: Foundation implementation
4. **Follow** the phased roadmap strictly (don't skip ahead)
5. **Test** thoroughly at each phase milestone

---

## 🤝 Contributing

When extending these specifications:

- Maintain consistency with the original design thesis
- Update all three spec documents when making changes
- Follow the security patterns established
- Consider governor limits in all designs
- Document decisions and rationale

---

**Questions?** Review the [Technical Design Specification](../proj%20plan1) for the original design rationale and constraints.
