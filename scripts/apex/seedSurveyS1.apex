// Seed the S1 survey verify form (IMPL_PLAN_SURVEY_S1 §6 render-verify gate).
// One survey, one active version, S1-renderable elements only (existing
// `field` machinery + consent — scale widgets arrive in S2), two managed
// topics on the score question, a repeat section for Entry_Index__c.
// Idempotent: deletes any prior seed (master-detail cascades versions).

final String FORM_NAME = 'S1 Survey Verify';

// responses restrict-delete the form — sweep them first (answers + topic
// links cascade via their master-details)
delete [
    SELECT Id
    FROM Form_Response__c
    WHERE Form_Version__r.Form__r.Name = :FORM_NAME
];
delete [SELECT Id FROM Form__c WHERE Name = :FORM_NAME];

// topics: reuse if present (idempotent), else create
Map<String, Survey_Topic__c> topicByName = new Map<String, Survey_Topic__c>();
for (Survey_Topic__c t : [
    SELECT Id, Name
    FROM Survey_Topic__c
    WHERE Name IN ('Support', 'Onboarding')
]) {
    topicByName.put(t.Name, t);
}
List<Survey_Topic__c> newTopics = new List<Survey_Topic__c>();
for (String n : new List<String>{ 'Support', 'Onboarding' }) {
    if (!topicByName.containsKey(n)) {
        newTopics.add(new Survey_Topic__c(Name = n));
    }
}
insert newTopics;
for (Survey_Topic__c t : newTopics) {
    topicByName.put(t.Name, t);
}
Id supportId = topicByName.get('Support').Id;
Id onboardingId = topicByName.get('Onboarding').Id;

// Primary_Context_Object__c satisfies the legacy VR_Primary_Object_Required
// rule; the survey runtime never reads it (binding:null model).
Form__c form = new Form__c(
    Name = FORM_NAME,
    Form_Type__c = 'Survey',
    Status__c = 'Published',
    Allowed_Adapters__c = 'Public_Guest',
    Primary_Context_Object__c = 'Contact'
);
insert form;

Map<String, Object> spec = new Map<String, Object>{
    'specVersion' => 1,
    'form' => new Map<String, Object>{ 'type' => 'survey' },
    'settings' => new Map<String, Object>{
        'availability' => new Map<String, Object>{ 'responseCap' => 50 }
    },
    'pages' => new List<Object>{
        new Map<String, Object>{
            'id' => 'p1',
            'title' => 'Pulse Check',
            'sections' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'sec_main',
                    'title' => 'Tell us how it went',
                    'elements' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'el_name',
                            'type' => 'field',
                            'binding' => null,
                            'label' => 'Your name',
                            'placeholder' => 'Ada',
                            'config' => new Map<String, Object>{
                                'inputType' => 'text'
                            }
                        },
                        new Map<String, Object>{
                            'id' => 'el_score',
                            'type' => 'field',
                            'binding' => null,
                            'label' => 'Score us 1-5',
                            'help' => '1 = terrible, 5 = amazing',
                            'config' => new Map<String, Object>{
                                'inputType' => 'number'
                            },
                            'analytics' => new Map<String, Object>{
                                'role' => 'score',
                                'scaleMin' => 1,
                                'scaleMax' => 5,
                                'topics' => new List<Object>{
                                    new Map<String, Object>{
                                        'id' => supportId,
                                        'name' => 'Support'
                                    },
                                    new Map<String, Object>{
                                        'id' => onboardingId,
                                        'name' => 'Onboarding'
                                    }
                                }
                            }
                        },
                        new Map<String, Object>{
                            'id' => 'el_words',
                            'type' => 'field',
                            'binding' => null,
                            'label' => 'Anything else?',
                            'config' => new Map<String, Object>{
                                'inputType' => 'textarea'
                            }
                        },
                        // ---- S2 scale family (widgets live from this slice) ----
                        new Map<String, Object>{
                            'id' => 'el_nps',
                            'type' => 'nps',
                            'binding' => null,
                            'label' => 'How likely are you to recommend us?',
                            'config' => new Map<String, Object>{
                                'leftLabel' => 'Not likely',
                                'rightLabel' => 'Extremely likely',
                                'coloring' => 'classic'
                            },
                            'analytics' => new Map<String, Object>{
                                'role' => 'score',
                                'scaleMin' => 0,
                                'scaleMax' => 10,
                                'topics' => new List<Object>{
                                    new Map<String, Object>{
                                        'id' => supportId,
                                        'name' => 'Support'
                                    }
                                }
                            }
                        },
                        new Map<String, Object>{
                            'id' => 'el_rate',
                            'type' => 'rating',
                            'binding' => null,
                            'label' => 'Rate your onboarding',
                            'description' => 'Think of your first week with us',
                            'descriptionDisplay' => 'caption',
                            'config' => new Map<String, Object>{
                                'max' => 5,
                                'icon' => 'star',
                                'leftLabel' => 'Poor',
                                'rightLabel' => 'Excellent'
                            },
                            'analytics' => new Map<String, Object>{
                                'role' => 'score',
                                'scaleMin' => 1,
                                'scaleMax' => 5,
                                'topics' => new List<Object>{
                                    new Map<String, Object>{
                                        'id' => onboardingId,
                                        'name' => 'Onboarding'
                                    }
                                }
                            }
                        },
                        new Map<String, Object>{
                            'id' => 'el_mood',
                            'type' => 'emojiScale',
                            'binding' => null,
                            'label' => 'How do you feel today?',
                            'description' => 'Gut answer — no overthinking',
                            'descriptionDisplay' => 'help',
                            'analytics' => new Map<String, Object>{
                                'role' => 'score',
                                'scaleMin' => 1,
                                'scaleMax' => 5
                            }
                        }
                    }
                }
            }
        }
    }
};

Form_Version__c version = new Form_Version__c(
    Form__c = form.Id,
    Version_Number__c = 1,
    Is_Active__c = true,
    Spec_JSON__c = JSON.serialize(spec)
);
insert version;

System.debug('SEEDED formId=' + form.Id + ' versionId=' + version.Id);
