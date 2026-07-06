/**
 * FinalFormCreateController — create-side controller for the rebuild's guided
 * creation flow (layout → theme → details → create). Builder-only (admin);
 * `with sharing` + USER_MODE (`insert as user`) enforce the running user's
 * CRUD/FLS. Writes the rebuild data model: Form__c → Form_Version__c with a
 * FORM_SPEC_SCHEMA v1 `Spec_JSON__c` blob (theme + layout + a starter section
 * bound to the chosen object). Guest creation is never allowed here.
 */
public with sharing class FinalFormCreateController {
    private static final Integer MAX_STARTER_FIELDS = 6;

    /**
     * Every object the running user can UPDATE (owner request) — plus the
     * hygiene an editable data object needs (queryable, accessible, not
     * deprecated/hidden). No standard-object allow-list: the picker's search
     * box handles the volume. Cacheable.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getUpdatableObjects() {
        List<Map<String, String>> out = new List<Map<String, String>>();
        for (Schema.SObjectType st : Schema.getGlobalDescribe().values()) {
            try {
                Schema.DescribeSObjectResult d = st.getDescribe();
                if (
                    d.isUpdateable() &&
                    d.isQueryable() &&
                    d.isAccessible() &&
                    !d.isDeprecatedAndHidden() &&
                    !d.isCustomSetting()
                ) {
                    out.add(
                        new Map<String, String>{
                            'label' => d.getLabel(),
                            'value' => d.getName()
                        }
                    );
                }
            } catch (Exception ignored) {
                // Some describes throw for restricted types — skip them.
            }
        }
        out.sort(new LabelSorter());
        return out;
    }

    /**
     * Create a draft Form from the guided flow.
     * @param formName   user-confirmed name
     * @param objectApiName  chosen primary object (must be updatable)
     * @param layoutType   registry layout key (scroll|stepper|tabs|…)
     * @param themeName    built-in theme catalog key
     * @param paneFlow   splitHero pane flow — 'oneAtATime' for the
     *                   Conversational gallery card (layout.options.paneFlow,
     *                   catalog §2); null/blank otherwise
     * @return { formId, versionId }
     */
    @AuraEnabled
    public static Map<String, Object> createForm(
        String formName,
        String objectApiName,
        String layoutType,
        String themeName,
        String paneFlow
    ) {
        if (String.isBlank(formName)) {
            throw new AuraHandledException('A form name is required.');
        }
        if (String.isBlank(objectApiName)) {
            throw new AuraHandledException('Pick an object for the form.');
        }
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(objectApiName.toLowerCase());
        if (t == null) {
            throw new AuraHandledException('Invalid object selected.');
        }
        Schema.DescribeSObjectResult objDesc = t.getDescribe();
        if (!objDesc.isUpdateable() || !objDesc.isAccessible()) {
            throw new AuraHandledException(
                'You cannot build a form on ' + objDesc.getLabel() + '.'
            );
        }
        String resolvedObject = objDesc.getName();
        String layout = String.isBlank(layoutType) ? 'scroll' : layoutType;
        // Pane Flow is a splitHero-only presentation option; anything else is
        // a client bug — reject rather than persist a nonsense spec.
        String resolvedPaneFlow = null;
        if (String.isNotBlank(paneFlow)) {
            if (layout != 'splitHero' || paneFlow != 'oneAtATime') {
                throw new AuraHandledException('Invalid pane flow option.');
            }
            resolvedPaneFlow = paneFlow;
        }

        Savepoint sp = Database.setSavepoint();
        try {
            Form__c form = new Form__c();
            form.Name = formName.trim();
            form.Primary_Context_Object__c = resolvedObject;
            insert as user form;

            Map<String, Object> spec = buildSpec(
                form.Id,
                formName.trim(),
                resolvedObject,
                objDesc,
                layout,
                themeName,
                resolvedPaneFlow
            );

            Form_Version__c version = new Form_Version__c();
            version.Form__c = form.Id;
            version.Version_Number__c = 1;
            version.Is_Active__c = true;
            version.Spec_JSON__c = JSON.serialize(spec);
            version.Engine_Version__c = 1;
            insert as user version;

            return new Map<String, Object>{
                'formId' => form.Id,
                'versionId' => version.Id
            };
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Could not create the form: ' + e.getMessage()
            );
        }
    }

    // ---- spec assembly (FORM_SPEC_SCHEMA v1) --------------------------------

    private static Map<String, Object> buildSpec(
        Id formId,
        String name,
        String objectApi,
        Schema.DescribeSObjectResult objDesc,
        String layout,
        String themeName,
        String paneFlow
    ) {
        Map<String, Object> layoutOptions = new Map<String, Object>();
        if (String.isNotBlank(paneFlow)) {
            layoutOptions.put('paneFlow', paneFlow);
        }
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'id' => formId,
                'name' => name,
                'type' => 'form',
                'targetObject' => objectApi,
                'saveMode' => 'create'
            },
            'layout' => new Map<String, Object>{
                'type' => layout,
                'options' => layoutOptions,
                'maxWidth' => 'medium',
                'zonesDefault' => new Map<String, Object>{
                    'arrangement' => 'single',
                    'gap' => 'md'
                }
            },
            'header' => new Map<String, Object>{
                'style' => 'standard',
                'arrangement' => 'stacked',
                'brandName' => objDesc.getLabel(),
                'title' => name,
                'description' => 'Complete the details below.'
            },
            'submit' => new Map<String, Object>{ 'label' => 'Submit' },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'name' => 'Details',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'title' => objDesc.getLabel() + ' details',
                            'style' => 'card',
                            'columns' => 2,
                            'elements' => starterElements(objectApi, objDesc)
                        }
                    }
                }
            }
        };
        if (String.isNotBlank(themeName)) {
            spec.put(
                'theme',
                new Map<String, Object>{
                    'source' => 'builtin',
                    'name' => themeName
                }
            );
        }
        return spec;
    }

    // A sensible starter: the object's required createable fields first (so the
    // form can actually save a record), topped up with common editable fields.
    private static List<Object> starterElements(
        String objectApi,
        Schema.DescribeSObjectResult objDesc
    ) {
        List<Object> required = new List<Object>();
        List<Object> optional = new List<Object>();
        for (Schema.SObjectField f : objDesc.fields.getMap().values()) {
            Schema.DescribeFieldResult fd = f.getDescribe();
            if (!fd.isCreateable() || fd.isAutoNumber() || fd.isCalculated()) {
                continue;
            }
            String inputType = inputTypeFor(fd.getType());
            if (inputType == null) {
                continue; // skip references/picklists/unsupported for the starter
            }
            Boolean isRequired = !fd.isNillable() && !fd.isDefaultedOnCreate();
            Map<String, Object> el = new Map<String, Object>{
                'id' => 'el_' + fd.getName(),
                'type' => 'field',
                'binding' => new Map<String, Object>{
                    'object' => objectApi,
                    'field' => fd.getName()
                },
                'label' => fd.getLabel(),
                'required' => isRequired,
                'config' => new Map<String, Object>{ 'inputType' => inputType }
            };
            if (isRequired) {
                required.add(el);
            } else {
                optional.add(el);
            }
        }
        List<Object> out = new List<Object>();
        out.addAll(required);
        for (Object o : optional) {
            if (out.size() >= MAX_STARTER_FIELDS) {
                break;
            }
            out.add(o);
        }
        return out;
    }

    // DisplayType → the rebuild's field inputType. null = skip in the starter.
    private static String inputTypeFor(Schema.DisplayType dt) {
        switch on dt {
            when STRING {
                return 'text';
            }
            when EMAIL {
                return 'email';
            }
            when PHONE {
                return 'phone';
            }
            when TEXTAREA {
                return 'textarea';
            }
            when URL {
                return 'url';
            }
            when DOUBLE, CURRENCY, PERCENT, INTEGER, LONG {
                return 'number';
            }
            when DATE {
                return 'date';
            }
            when BOOLEAN {
                return 'checkbox';
            }
            when else {
                return null;
            }
        }
    }

    private class LabelSorter implements Comparator<Map<String, String>> {
        public Integer compare(Map<String, String> a, Map<String, String> b) {
            String la = a.get('label') == null ? '' : a.get('label').toLowerCase();
            String lb = b.get('label') == null ? '' : b.get('label').toLowerCase();
            return la.compareTo(lb);
        }
    }
}
