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
                    !d.isCustomSetting() &&
                    !isSystemTable(d.getName())
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
     * Sharing/history/feed/tag/change-event tables pass the describe gates
     * (they ARE updateable + queryable) but are never form/survey subjects.
     * Custom system tables carry double-underscore suffixes; standard ones
     * bare suffixes — the bare check only applies to non-custom names so a
     * custom object whose label ends in "History" (…History__c) survives.
     */
    public static Boolean isSystemTable(String name) {
        if (
            name.endsWith('__Share') ||
            name.endsWith('__History') ||
            name.endsWith('__Feed') ||
            name.endsWith('__Tag') ||
            name.endsWith('__ChangeEvent')
        ) {
            return true;
        }
        if (name.endsWith('__c') || name.endsWith('__mdt')) {
            return false;
        }
        return name.endsWith('Share') ||
            name.endsWith('History') ||
            name.endsWith('Feed') ||
            name.endsWith('Tag') ||
            name.endsWith('ChangeEvent');
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

    /**
     * The layout block a brand-new form starts with. c/finalLayoutRegistry
     * newLayoutDefaults builds the same thing for the new-form preview; an
     * Apex test and a jest test pin both to one table. A new Split form starts
     * carded and Wide, the look the previews draw (owner 2026-10-25); every
     * other layout starts Medium. `widthIsStart` marks that Wide as untouched,
     * so the Studio can drop it if full-bleed is turned on later.
     */
    @TestVisible
    private static Map<String, Object> layoutBlock(
        String layout,
        String paneFlow
    ) {
        Map<String, Object> options = new Map<String, Object>();
        String maxWidth = 'medium';
        if (layout == 'splitHero') {
            options.put('fullBleed', false);
            options.put('widthIsStart', true);
            maxWidth = 'wide';
        }
        if (String.isNotBlank(paneFlow)) {
            options.put('paneFlow', paneFlow);
        }
        return new Map<String, Object>{
            'type' => layout,
            'options' => options,
            'maxWidth' => maxWidth,
            'zonesDefault' => new Map<String, Object>{
                'arrangement' => 'single',
                'gap' => 'md'
            }
        };
    }

    private static Map<String, Object> buildSpec(
        Id formId,
        String name,
        String objectApi,
        Schema.DescribeSObjectResult objDesc,
        String layout,
        String themeName,
        String paneFlow
    ) {
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'id' => formId,
                'name' => name,
                'type' => 'form',
                'targetObject' => objectApi,
                'saveMode' => 'create'
            },
            'layout' => layoutBlock(layout, paneFlow),
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
            String la = a.get('label') == null
                ? ''
                : a.get('label').toLowerCase();
            String lb = b.get('label') == null
                ? ''
                : b.get('label').toLowerCase();
            return la.compareTo(lb);
        }
    }

    // ---- survey templates (S5 — the gallery's Surveys shelf; creation-flow
    // ruling: cards are complete bundles, no wizard questions, ever) ----

    /**
     * The survey path's create (kind-first flow, owner 2026-07-31): template
     * + theme + OPTIONAL object. Questions with analytics + topics (reused
     * from the vocabulary by name — never duplicated), oneAtATime layout,
     * anonymous where the template warrants it.
     * @param templateKey   blank|csat|nps|event
     * @param surveyName    optional — templates carry good defaults
     * @param themeName     optional builtin theme catalog key (spec.theme)
     * @param objectApiName optional context object — stamped as
     *        spec.form.targetObject so questions can map to its fields and
     *        prefill from records (survey-object program)
     */
    @AuraEnabled
    public static Map<String, Object> createSurveyFromTemplate(
        String templateKey,
        String surveyName,
        String themeName,
        String objectApiName
    ) {
        SurveyTemplate tpl = surveyTemplate(templateKey, surveyName);
        if (tpl == null) {
            throw new AuraHandledException('Unknown survey template.');
        }
        // Optional context object: validate exactly like createForm — an
        // unusable object must fail loudly, never persist silently.
        String resolvedObject = null;
        if (String.isNotBlank(objectApiName)) {
            Schema.SObjectType t = Schema.getGlobalDescribe()
                .get(objectApiName.toLowerCase());
            if (t == null) {
                throw new AuraHandledException('Invalid object selected.');
            }
            Schema.DescribeSObjectResult objDesc = t.getDescribe();
            if (!objDesc.isUpdateable() || !objDesc.isAccessible()) {
                throw new AuraHandledException(
                    'You cannot use ' + objDesc.getLabel() + ' here.'
                );
            }
            resolvedObject = objDesc.getName();
            Map<String, Object> formBlock = (Map<String, Object>) tpl.spec.get(
                'form'
            );
            formBlock.put('targetObject', resolvedObject);
        }
        if (String.isNotBlank(themeName)) {
            tpl.spec.put(
                'theme',
                new Map<String, Object>{
                    'source' => 'builtin',
                    'name' => themeName
                }
            );
        }
        Savepoint sp = Database.setSavepoint();
        try {
            Form__c form = new Form__c(
                Name = tpl.name,
                Form_Type__c = 'Survey',
                // the chosen optional object when present; else the legacy
                // VR_Primary_Object_Required placeholder (surveys with no
                // object never read it — binding: null)
                Primary_Context_Object__c = resolvedObject == null
                    ? 'Contact'
                    : resolvedObject
            );
            insert as user form;
            Form_Version__c version = new Form_Version__c(
                Form__c = form.Id,
                Version_Number__c = 1,
                Is_Active__c = true,
                Spec_JSON__c = JSON.serialize(tpl.spec),
                Engine_Version__c = 1
            );
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
                'Could not create the survey: ' + e.getMessage()
            );
        }
    }

    /**
     * The Freeform path's create (FREEFORM_SPEC D5): template + layout +
     * theme + name, and NO object at any point.
     *
     * Freeform sits between the other two creators on purpose: its questions
     * are unbound like a survey's, but it picks any layout like a form, and
     * unlike the survey path it does NOT write a placeholder
     * Primary_Context_Object__c - VR_Primary_Object_Required now skips
     * Freeform, and F2's mapping page will read that field's emptiness as
     * the truth it is.
     *
     * @param templateKey blank|contact|eventRegistration|support|partner
     * @param formName    optional - the template carries a default
     * @param themeName   optional builtin theme catalog key
     * @param layoutType  any layout key; defaults to scroll
     * @param paneFlow    splitHero-only presentation option
     */
    @AuraEnabled
    public static Map<String, Object> createFreeformFromTemplate(
        String templateKey,
        String formName,
        String themeName,
        String layoutType,
        String paneFlow
    ) {
        String key = String.isBlank(templateKey) ? 'blank' : templateKey;
        FreeformTemplate template = freeformTemplate(key);
        if (template == null) {
            throw new AuraHandledException('Unknown freeform template.');
        }
        String layout = String.isBlank(layoutType) ? 'scroll' : layoutType;
        // Same rule as createForm: pane flow belongs to splitHero alone, and
        // a nonsense combination is a client bug worth refusing, not storing.
        String resolvedPaneFlow = null;
        if (String.isNotBlank(paneFlow)) {
            if (layout != 'splitHero' || paneFlow != 'oneAtATime') {
                throw new AuraHandledException('Invalid pane flow option.');
            }
            resolvedPaneFlow = paneFlow;
        }
        String name = String.isBlank(formName)
            ? template.name
            : formName.trim().abbreviate(80);

        Savepoint sp = Database.setSavepoint();
        try {
            Form__c form = new Form__c(
                Name = name,
                Form_Type__c = FinalFormTypes.toPicklist(
                    FinalFormTypes.FREEFORM
                )
            );
            insert as user form;
            Map<String, Object> spec = freeformSpec(
                form.Id,
                name,
                layout,
                resolvedPaneFlow,
                themeName,
                template.pages
            );
            Form_Version__c version = new Form_Version__c(
                Form__c = form.Id,
                Version_Number__c = 1,
                Is_Active__c = true,
                Spec_JSON__c = JSON.serialize(spec),
                Engine_Version__c = 1
            );
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
                'Could not create the freeform: ' + e.getMessage()
            );
        }
    }

    /** The spec a brand-new Freeform opens with: a form-style layout and
     *  header around survey-style unbound questions, and no targetObject. */
    private static Map<String, Object> freeformSpec(
        Id formId,
        String name,
        String layout,
        String paneFlow,
        String themeName,
        List<Object> pages
    ) {
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'id' => formId,
                'name' => name,
                'type' => FinalFormTypes.FREEFORM
            },
            'layout' => layoutBlock(layout, paneFlow),
            'header' => new Map<String, Object>{
                'style' => 'standard',
                'arrangement' => 'stacked',
                'title' => name
            },
            'settings' => new Map<String, Object>(),
            'submit' => new Map<String, Object>{ 'label' => 'Submit' },
            'pages' => pages
        };
        if (
            pages.size() == 1 &&
            ((Map<String, Object>) pages[0]).get('id') == 'pg_1'
        ) {
            List<Object> sections = (List<Object>) ((Map<String, Object>) pages[0])
                .get('sections');
            ((Map<String, Object>) sections[0]).put('title', name);
        }
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

    /**
     * A freeform starter's default name and editable question pages.
     *
     * Use surveyQuestion(id, type, label, config, analytics) to build each
     * one - Freeform passes null for analytics (no Topics, D4). Element ids
     * must start with 'el_' and stay unique; they are the permanent identity
     * an answer row stores.
     */
    private class FreeformTemplate {
        String name;
        List<Object> pages;
    }

    /** Resolve a curated key to its default name and grouped questions. */
    private static FreeformTemplate freeformTemplate(String key) {
        FreeformTemplate result = new FreeformTemplate();
        result.pages = new List<Object>();
        if (key == 'blank') {
            result.name = 'Untitled Freeform';
            result.pages.add(
                freeformPage('pg_1', 'Questions', new List<Object>())
            );
        } else if (key == 'contact') {
            result.name = 'Contact Request';
            result.pages.add(
                freeformPage(
                    'pg_contact',
                    'Your details',
                    new List<Object>{
                        freeformQuestion(
                            'el_contact_name',
                            'Your name',
                            'text',
                            true
                        ),
                        freeformQuestion(
                            'el_contact_email',
                            'Email address',
                            'email',
                            true
                        ),
                        freeformQuestion(
                            'el_contact_phone',
                            'Phone number',
                            'phone',
                            false
                        ),
                        freeformQuestion(
                            'el_contact_message',
                            'How can we help?',
                            'textarea',
                            true
                        )
                    }
                )
            );
        } else if (key == 'eventRegistration') {
            result.name = 'Event Registration';
            result.pages.add(
                freeformPage(
                    'pg_registration',
                    'Attendee',
                    new List<Object>{
                        freeformQuestion(
                            'el_registration_name',
                            'Full name',
                            'text',
                            true
                        ),
                        freeformQuestion(
                            'el_registration_email',
                            'Email address',
                            'email',
                            true
                        ),
                        freeformQuestion(
                            'el_registration_company',
                            'Company or organization',
                            'text',
                            false
                        )
                    }
                )
            );
            result.pages.add(
                freeformPage(
                    'pg_event_details',
                    'Event details',
                    new List<Object>{
                        freeformQuestion(
                            'el_registration_date',
                            'Which date will you attend?',
                            'date',
                            true
                        ),
                        freeformQuestion(
                            'el_registration_accessibility',
                            'Accessibility or dietary requests',
                            'textarea',
                            false
                        )
                    }
                )
            );
        } else if (key == 'support') {
            result.name = 'Support Request';
            result.pages.add(
                freeformPage(
                    'pg_support',
                    'Request details',
                    new List<Object>{
                        freeformQuestion(
                            'el_support_name',
                            'Your name',
                            'text',
                            true
                        ),
                        freeformQuestion(
                            'el_support_email',
                            'Email address',
                            'email',
                            true
                        ),
                        freeformQuestion(
                            'el_support_subject',
                            'What do you need help with?',
                            'text',
                            true
                        ),
                        freeformQuestion(
                            'el_support_description',
                            'Describe the issue',
                            'textarea',
                            true
                        ),
                        freeformQuestion(
                            'el_support_url',
                            'Page or link related to the issue',
                            'url',
                            false
                        )
                    }
                )
            );
        } else if (key == 'partner') {
            result.name = 'Partner Application';
            result.pages.add(
                freeformPage(
                    'pg_partner_company',
                    'Organization',
                    new List<Object>{
                        freeformQuestion(
                            'el_partner_company',
                            'Organization name',
                            'text',
                            true
                        ),
                        freeformQuestion(
                            'el_partner_website',
                            'Website',
                            'url',
                            false
                        ),
                        freeformQuestion(
                            'el_partner_contact',
                            'Primary contact',
                            'text',
                            true
                        ),
                        freeformQuestion(
                            'el_partner_email',
                            'Work email',
                            'email',
                            true
                        )
                    }
                )
            );
            result.pages.add(
                freeformPage(
                    'pg_partner_fit',
                    'Partnership',
                    new List<Object>{
                        freeformQuestion(
                            'el_partner_focus',
                            'What would you like to partner on?',
                            'textarea',
                            true
                        ),
                        freeformQuestion(
                            'el_partner_experience',
                            'Relevant experience',
                            'textarea',
                            false
                        )
                    }
                )
            );
        } else {
            return null;
        }
        return result;
    }

    /** Build one unbound authoring page with a single card section. */
    private static Map<String, Object> freeformPage(
        String id,
        String title,
        List<Object> elements
    ) {
        return new Map<String, Object>{
            'id' => id,
            'name' => title,
            'sections' => new List<Object>{
                new Map<String, Object>{
                    'id' => id.replace('pg_', 'sec_'),
                    'title' => title,
                    'style' => 'card',
                    'columns' => 1,
                    'elements' => elements
                }
            }
        };
    }

    /** Build a supported general-input question and its required validator. */
    private static Map<String, Object> freeformQuestion(
        String id,
        String label,
        String inputType,
        Boolean required
    ) {
        Map<String, Object> question = surveyQuestion(
            id,
            'field',
            label,
            new Map<String, Object>{ 'inputType' => inputType },
            null
        );
        question.put('required', required);
        if (required) {
            question.put(
                'validation',
                new List<Object>{
                    new Map<String, Object>{
                        'type' => 'required',
                        'message' => 'This field is required.'
                    }
                }
            );
        }
        return question;
    }

    private class SurveyTemplate {
        String name;
        Map<String, Object> spec;
    }

    private static SurveyTemplate surveyTemplate(
        String templateKey,
        String surveyName
    ) {
        List<Object> elements;
        String name;
        Boolean anonymous = false;
        if (templateKey == 'csat') {
            name = 'CSAT Pulse';
            elements = new List<Object>{
                surveyQuestion(
                    'el_csat_score',
                    'scale',
                    'How satisfied are you with our support?',
                    new Map<String, Object>{
                        'size' => 5,
                        'leftLabel' => 'Very dissatisfied',
                        'rightLabel' => 'Very satisfied'
                    },
                    analyticsBlock(1, 5, 'Satisfaction')
                ),
                surveyQuestion(
                    'el_csat_why',
                    'field',
                    'What could we improve?',
                    new Map<String, Object>{ 'inputType' => 'textarea' },
                    null
                )
            };
        } else if (templateKey == 'nps') {
            name = 'NPS Pulse';
            elements = new List<Object>{
                surveyQuestion(
                    'el_nps_score',
                    'nps',
                    'How likely are you to recommend us?',
                    new Map<String, Object>{
                        'leftLabel' => 'Not likely',
                        'rightLabel' => 'Extremely likely'
                    },
                    analyticsBlock(0, 10, 'Loyalty')
                ),
                surveyQuestion(
                    'el_nps_why',
                    'field',
                    'What is the main reason for your score?',
                    new Map<String, Object>{ 'inputType' => 'textarea' },
                    null
                )
            };
        } else if (templateKey == 'event') {
            name = 'Event Feedback';
            anonymous = true; // honest feedback beats attributed feedback here
            elements = new List<Object>{
                surveyQuestion(
                    'el_ev_overall',
                    'rating',
                    'How was the event overall?',
                    new Map<String, Object>{
                        'max' => 5,
                        'icon' => 'star',
                        'leftLabel' => 'Poor',
                        'rightLabel' => 'Excellent'
                    },
                    analyticsBlock(1, 5, 'Event')
                ),
                surveyQuestion(
                    'el_ev_content',
                    'likert',
                    'The content was valuable to me',
                    null,
                    analyticsBlock(1, 5, 'Event')
                ),
                surveyQuestion(
                    'el_ev_again',
                    'yesNo',
                    'Would you attend again?',
                    new Map<String, Object>{
                        'yesLabel' => 'Absolutely',
                        'noLabel' => 'Probably not'
                    },
                    null
                ),
                surveyQuestion(
                    'el_ev_words',
                    'field',
                    'Anything else we should know?',
                    new Map<String, Object>{ 'inputType' => 'textarea' },
                    null
                )
            };
        } else if (templateKey == 'blank') {
            name = 'Untitled Survey';
            elements = new List<Object>();
        } else {
            return null;
        }
        // owner 2026-07-31: creation must never SKIP naming — the shelf's
        // name box overrides the template default
        if (String.isNotBlank(surveyName)) {
            name = surveyName.trim().abbreviate(80);
        }
        Map<String, Object> settings = new Map<String, Object>();
        if (anonymous) {
            settings.put('anonymous', true);
        }
        SurveyTemplate tpl = new SurveyTemplate();
        tpl.name = name;
        tpl.spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{ 'type' => 'survey' },
            'layout' => new Map<String, Object>{ 'type' => 'oneAtATime' },
            'settings' => settings,
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg_1',
                    'title' => name,
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec_1',
                            'title' => name,
                            'elements' => elements
                        }
                    }
                }
            }
        };
        return tpl;
    }

    private static Map<String, Object> surveyQuestion(
        String elId,
        String elType,
        String label,
        Map<String, Object> config,
        Map<String, Object> analytics
    ) {
        Map<String, Object> el = new Map<String, Object>{
            'id' => elId,
            'type' => elType,
            'binding' => null,
            'label' => label,
            'required' => false,
            'validation' => new List<Object>(),
            'visibility' => null
        };
        if (config != null) {
            el.put('config', config);
        }
        if (analytics != null) {
            el.put('analytics', analytics);
        }
        return el;
    }

    /** Topic reuse by name via the vocabulary endpoint (never duplicates). */
    private static Map<String, Object> analyticsBlock(
        Integer scaleMin,
        Integer scaleMax,
        String topicName
    ) {
        FinalStudioController.TopicEntry topic = FinalStudioController.createSurveyTopic(
            topicName
        );
        return new Map<String, Object>{
            'role' => 'score',
            'scaleMin' => scaleMin,
            'scaleMax' => scaleMax,
            'topics' => new List<Object>{
                new Map<String, Object>{
                    'id' => topic.id,
                    'name' => topic.name
                }
            }
        };
    }
}
