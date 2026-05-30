---
trigger: always_on
---

---

name: salesforce
description: Salesforce development expertise covering Apex, LWC, SOQL, Metadata API, deployment workflows, governor limits, Salesforce DX project conventions, 2GP managed package / AppExchange ISVforce best practices, and Spring/Summer 2026 release changes (API v66/v67). Use when working with .cls, .trigger, .html/.js LWC files, package.xml, sfdx-project.json, or any Salesforce org/metadata/packaging task.

---

You are an expert Salesforce developer. Apply the following knowledge and conventions whenever working on Salesforce projects.

## Project Structure (SFDX)

```
force-app/main/default/
  classes/          # Apex classes (.cls + .cls-meta.xml)
  triggers/         # Apex triggers (.trigger + .trigger-meta.xml)
  lwc/              # Lightning Web Components (folder per component)
  aura/             # Aura components (legacy)
  objects/          # Custom objects, fields, validation rules
  flows/            # Flows and process builders
  permissionsets/   # Permission sets
  profiles/         # Profiles
  layouts/          # Page layouts
  staticresources/  # Static resources
sfdx-project.json   # Project config
```

## Apex Best Practices

- Always bulkify: never SOQL or DML inside loops
- One trigger per object; delegate logic to handler classes
- Use `with sharing` by default; explicitly justify `without sharing`
- Always check CRUD/FLS before DML: `Schema.sObjectType.Account.isCreateable()`
- Use `Database.insert(records, false)` for partial success when appropriate
- Avoid hardcoded IDs; use Custom Metadata or Custom Settings instead
- Prefer `Map<Id, SObject>` for lookup patterns over nested loops

### Trigger Pattern

```apex
trigger AccountTrigger on Account(
  before insert,
  before update,
  after insert,
  after update
) {
  AccountTriggerHandler handler = new AccountTriggerHandler();
  if (Trigger.isBefore) {
    if (Trigger.isInsert)
      handler.beforeInsert(Trigger.new);
    if (Trigger.isUpdate)
      handler.beforeUpdate(Trigger.new, Trigger.oldMap);
  }
  if (Trigger.isAfter) {
    if (Trigger.isInsert)
      handler.afterInsert(Trigger.new);
    if (Trigger.isUpdate)
      handler.afterUpdate(Trigger.new, Trigger.oldMap);
  }
}
```

### Async Patterns

- **Queueable**: chained async jobs, supports object references
- **Batch**: large data volumes (up to 50M records), implement `Database.Batchable`
- **Schedulable**: time-based execution, implement `Schedulable`
- **Future**: simple async, no chaining, `@future(callout=true)` for HTTP

### Governor Limits (always keep in mind)

| Limit                          | Value                                |
| ------------------------------ | ------------------------------------ |
| SOQL queries per transaction   | 100                                  |
| DML statements per transaction | 150                                  |
| DML rows per transaction       | 10,000                               |
| Heap size                      | 6 MB (sync) / 12 MB (async)          |
| CPU time                       | 10,000 ms (sync) / 60,000 ms (async) |
| Callouts per transaction       | 100                                  |
| Future methods per transaction | 50                                   |

## SOQL

- Always filter on indexed fields (Id, Name, ExternalId, lookup fields) when possible
- Use selective queries: avoid `WHERE` clauses that return >10% of records on large objects
- Prefer `FOR UPDATE` only when necessary (locks records)
- Use relationship queries to avoid extra round trips:
  ```apex
  [SELECT Id, Name, (SELECT Id, Subject FROM Cases) FROM Account WHERE Industry = 'Technology']
  ```
- Never use `LIMIT` without `ORDER BY` if result order matters
- Use `WITH SECURITY_ENFORCED` or `stripInaccessible()` for FLS enforcement

## Lightning Web Components (LWC)

### File structure per component

```
myComponent/
  myComponent.html      # Template
  myComponent.js        # Controller
  myComponent.js-meta.xml  # Metadata (targets, API version)
  myComponent.css       # Scoped styles (optional)
```

### Key conventions

- Use `@api` for public properties (parent → child communication)
- Use `@track` only for nested object/array mutations (primitive reactivity is automatic)
- Use `@wire` for declarative data fetching from Apex or UI API
- Use `CustomEvent` + `this.dispatchEvent()` for child → parent communication
- Always handle wire errors: check both `data` and `error` properties
- Use `lightning-record-form`, `lightning-record-edit-form`, or `lightning-record-view-form` before writing custom Apex for simple CRUD

### Wire example

```javascript
import { LightningElement, wire } from "lwc";
import getAccounts from "@salesforce/apex/AccountController.getAccounts";

export default class AccountList extends LightningElement {
  @wire(getAccounts)
  accounts;

  get hasAccounts() {
    return this.accounts.data && this.accounts.data.length > 0;
  }
}
```

````
### package.xml pattern

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>*</members>
        <name>LightningComponentBundle</name>
    </types>
    <version>61.0</version>
</Package>
````

## Apex Test Classes

- Minimum 75% org-wide coverage required to deploy; aim for >90%
- Use `@isTest` annotation on class and `@isTest` or `testMethod` on methods
- Use `Test.startTest()` / `Test.stopTest()` to reset governor limits and run async
- Create test data inside tests; never rely on org data (`SeeAllData=false` is default)
- Use `@TestSetup` for shared data across test methods
- Assert specific values, not just that no exception was thrown

```apex
@isTest
private class AccountTriggerHandlerTest {
  @TestSetup
  static void makeData() {
    insert new Account(Name = 'Test Account');
  }

  @isTest
  static void testBeforeInsert() {
    Test.startTest();
    Account acc = new Account(Name = 'New Account');
    insert acc;
    Test.stopTest();

    acc = [SELECT Id, Name FROM Account WHERE Id = :acc.Id];
    System.assertEquals('New Account', acc.Name, 'Name should match');
  }
}
```

## Security Checklist

- CRUD checks before DML operations
- FLS checks before reading/writing field values
- Sharing rules respected (`with sharing`)
- No hardcoded credentials or IDs
- SOQL injection prevention: always use bind variables (`:variable`), never string concatenation in queries
- XSS prevention in LWC: use `{variable}` binding (auto-escaped), avoid `innerHTML`

---

## Apex Security Pitfalls (Common Mistakes)

### 1. `with sharing` Does NOT Enforce OLS or FLS

The `with sharing` keyword only controls **record visibility** (row-level). Object-Level Security (OLS) and Field-Level Security (FLS) are ignored in all sharing modes unless you explicitly enforce them.

| Keyword             | Record-level     | OLS/FLS     |
| ------------------- | ---------------- | ----------- |
| `with sharing`      | Enforced         | **Ignored** |
| `without sharing`   | Ignored          | **Ignored** |
| `inherited sharing` | Caller's context | **Ignored** |

```apex
// VULNERABLE — with sharing doesn't protect restricted fields like TaxId__c
public with sharing class AccountService {
  @AuraEnabled
  public static List<Account> getAccounts() {
    return [SELECT Id, Name, AnnualRevenue, TaxId__c FROM Account];
  }
}
```

---

### 2. `WITH SECURITY_ENFORCED` Is Incomplete — Use `WITH USER_MODE` Instead

`WITH SECURITY_ENFORCED` only checks fields in the `SELECT` clause. It **does not** enforce permissions on `WHERE`, `ORDER BY`, `GROUP BY`, or `HAVING` clauses, enabling blind-injection attacks to exfiltrate data through filter conditions.

```apex
// BAD — WHERE/ORDER BY clauses not checked, vulnerable to data exfiltration via filter
List<Contact> contacts = [
    SELECT Id, Name, Email
    FROM Contact
    WHERE AccountId = :accountId
    WITH SECURITY_ENFORCED
];

// GOOD — WITH USER_MODE enforces permissions on ALL clauses (API v55+)
List<Contact> contacts = [
    SELECT Id, Name, Email
    FROM Contact
    WHERE AccountId = :accountId
    WITH USER_MODE
];
```

**Rule**: Replace all `WITH SECURITY_ENFORCED` with `WITH USER_MODE`. It handles OLS, FLS, and polymorphic fields correctly across every query clause.

---

### 3. SOQL Injection via Dynamic Field Names

`escapeSingleQuotes()` is for **field values only** — applying it to dynamic field names gives false security because valid Salesforce field names never contain single quotes. The real risk is subquery injection.

```apex
// VULNERABLE — attacker passes "(SELECT Id, Subject FROM Cases)" as `fields`
public static List<Account> getAccountDetails(String accountId, String fields) {
    String safeFields = String.escapeSingleQuotes(fields); // does nothing useful here
    String query = 'SELECT ' + safeFields + ' FROM Account WHERE Id = \'' +
                   String.escapeSingleQuotes(accountId) + '\'';
    return Database.query(query);
}

// SAFE — allowlist + FLS check for dynamic field names
public static User getUser(String userId, String nameField) {
    Set<String> allowedFields = new Set<String>{'Name', 'FirstName', 'LastName'};
    if (!allowedFields.contains(nameField)) {
        throw new AuraHandledException('Invalid field: ' + nameField);
    }
    Schema.SObjectField fieldToken = Schema.SObjectType.User.fields.getMap()
        .get(nameField.toLowerCase());
    if (fieldToken == null || !fieldToken.getDescribe().isAccessible()) {
        throw new AuraHandledException('Field not accessible: ' + nameField);
    }
    String query = 'SELECT Id, ' + nameField + ' FROM User WHERE Id = \'' +
                   String.escapeSingleQuotes(userId) + '\' WITH USER_MODE';
    return (User) Database.query(query)[0];
}
```

**Rules for dynamic SOQL:**

- Use bind variables (`:variable`) for all user-supplied **values** — Salesforce handles parameterization
- Use an **allowlist + FLS check** for any user-supplied **field names**
- Use `escapeSingleQuotes()` only on string literals in `WHERE` conditions, never on field names

---

### 4. Use `stripInaccessible` for DML and Read Results

`Security.stripInaccessible()` removes fields the running user cannot read/write before returning or writing data, including nested child relationship results.

```apex
// Strip inaccessible fields before returning query results
List<Account> accounts = [
    SELECT Id, Name, Phone, (SELECT Id, LastName, Phone FROM Contacts)
    FROM Account
];
SObjectAccessDecision decision = Security.stripInaccessible(
    AccessType.READABLE, accounts);
return decision.getRecords();

// Strip before DML (prevents FLS bypass on insert/update)
SObjectAccessDecision writeCheck = Security.stripInaccessible(
    AccessType.CREATABLE, newRecords);
insert writeCheck.getRecords();
```

---

### 5. `@AuraEnabled` and `@RemoteAction` Exposure

These annotations expose Apex methods to Lightning components and Visualforce JavaScript. Critically, `@AuraEnabled` methods in Experience Cloud sites are **callable by unauthenticated guest users** unless access is explicitly restricted.

```apex
// RISKY — guest users in Experience Cloud can call this without authentication
@AuraEnabled
public static List<Account> getAccounts() { ... }

// SAFE — check authentication before executing
@AuraEnabled
public static List<Account> getAccounts() {
    if (UserInfo.getUserType() == 'Guest') {
        throw new AuraHandledException('Unauthorized');
    }
    return [SELECT Id, Name FROM Account WITH USER_MODE];
}
```

**Rules:**

- Always validate caller ide
