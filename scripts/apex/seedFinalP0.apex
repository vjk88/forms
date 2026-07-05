// Seed the P0 walking-skeleton test form (BUILD_PHASES P0 gate).
// Four versions of one form, each a hand-authored FORM_SPEC_SCHEMA v1 blob:
//   v1 cover  (ACTIVE)  v2 contain  v3 tile  — all with bg color + image + mesh + texture together
//   v4 no theme — must render neutral via finalPageFrame :host fallbacks
// Idempotent: deletes any prior seed form (master-detail cascades the versions).

final String FORM_NAME = 'Final P0 Walking Skeleton';

// Distinct backdrop: teal field, amber circle top-left, white diagonal —
// cover/contain/tile are unmistakable at a glance. (480x320 intrinsic size.)
final String IMG_URL = 'data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27480%27%20height=%27320%27%3E%3Crect%20width=%27480%27%20height=%27320%27%20fill=%27%230e7490%27/%3E%3Ccircle%20cx=%27120%27%20cy=%2780%27%20r=%2748%27%20fill=%27%23fbbf24%27/%3E%3Cpath%20d=%27M0%20320%20L480%200%27%20stroke=%27%23ffffff%27%20stroke-width=%276%27/%3E%3C/svg%3E';

delete [SELECT Id FROM Form__c WHERE Name = :FORM_NAME];

// Status stays Draft: a legacy Form__c validation rule requires Layout_Config__c
// on published forms, and the P0 viewer reads Form_Version__c only.
Form__c form = new Form__c(
    Name = FORM_NAME,
    Primary_Context_Object__c = 'Contact'
);
insert form;

List<Map<String, Object>> variants = new List<Map<String, Object>>{
    new Map<String, Object>{ 'num' => 1, 'active' => true, 'fit' => 'cover', 'themed' => true, 'label' => 'Cover' },
    new Map<String, Object>{ 'num' => 2, 'active' => false, 'fit' => 'contain', 'themed' => true, 'label' => 'Contain' },
    new Map<String, Object>{ 'num' => 3, 'active' => false, 'fit' => 'tile', 'themed' => true, 'label' => 'Tile' },
    new Map<String, Object>{ 'num' => 4, 'active' => false, 'fit' => null, 'themed' => false, 'label' => 'No Theme' }
};

List<Form_Version__c> versions = new List<Form_Version__c>();
for (Map<String, Object> v : variants) {
    List<Object> elements = new List<Object>{
        new Map<String, Object>{
            'id' => 'el_p0first01', 'type' => 'field',
            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'FirstName' },
            'label' => 'First name', 'required' => true, 'placeholder' => 'Ada',
            'config' => new Map<String, Object>{ 'inputType' => 'text' }
        },
        new Map<String, Object>{
            'id' => 'el_p0last01', 'type' => 'field',
            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'LastName' },
            'label' => 'Last name', 'required' => true, 'placeholder' => 'Lovelace',
            'config' => new Map<String, Object>{ 'inputType' => 'text' }
        },
        new Map<String, Object>{
            'id' => 'el_p0email01', 'type' => 'field',
            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'Email' },
            'label' => 'Email', 'required' => true, 'placeholder' => 'you@example.com',
            'help' => 'We reply within a day.',
            'config' => new Map<String, Object>{ 'inputType' => 'email' }
        },
        // forward-compat check: unknown type must render the placeholder, never crash
        new Map<String, Object>{ 'id' => 'el_p0mystery1', 'type' => 'hologram', 'config' => new Map<String, Object>() }
    };

    // Second section: proves layoutZones' twoCol arrangement + container collapse.
    List<Object> extraElements = new List<Object>{
        new Map<String, Object>{
            'id' => 'el_p0phone01', 'type' => 'field',
            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'Phone' },
            'label' => 'Phone',
            'config' => new Map<String, Object>{ 'inputType' => 'tel' }
        },
        new Map<String, Object>{
            'id' => 'el_p0notes01', 'type' => 'field',
            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'Description' },
            'label' => 'Anything else?',
            'config' => new Map<String, Object>{ 'inputType' => 'textarea' }
        }
    };

    Map<String, Object> spec = new Map<String, Object>{
        'specVersion' => 1,
        'form' => new Map<String, Object>{
            'id' => form.Id, 'name' => FORM_NAME, 'type' => 'form',
            'targetObject' => 'Contact', 'saveMode' => 'create'
        },
        // no layout.density — density is a THEME property (schema §3 / UIUX review #22)
        'layout' => new Map<String, Object>{
            'type' => 'scroll', 'options' => new Map<String, Object>(),
            'maxWidth' => 'medium',
            'zonesDefault' => new Map<String, Object>{
                'arrangement' => 'twoCol', 'gap' => 'md',
                'collapse' => 'standard', 'collapseOrder' => 'source'
            }
        },
        'header' => new Map<String, Object>{
            'style' => 'standard',
            'arrangement' => 'stacked',
            'brandName' => 'Acme Outdoors',   // no logo → typeset wordmark (chrome PR)
            'title' => 'P0 Walking Skeleton — ' + (String) v.get('label'),
            'description' => 'Old-bug reel: page color + image + mesh + texture together.',
            'highlight' => new Map<String, Object>{
                'text' => 'Closes Friday!', 'variant' => 'badge',
                'icon' => null, 'dismissible' => false
            }
        },
        'submit' => new Map<String, Object>{
            'label' => 'Submit', 'alignment' => 'right', 'placement' => 'inline'
        },
        'pages' => new List<Object>{
            new Map<String, Object>{
                'id' => 'pg_p0demo001', 'name' => 'Details',
                'sections' => new List<Object>{
                    new Map<String, Object>{
                        'id' => 'sec_p0demo01',
                        'title' => 'Contact details',
                        'description' => 'One page, two sections in twoCol zones.',
                        'style' => 'card', 'columns' => 2,
                        'elements' => elements
                    },
                    new Map<String, Object>{
                        'id' => 'sec_p0demo02',
                        'title' => 'Your message',
                        'style' => 'card', 'columns' => 1,
                        'elements' => extraElements
                    }
                }
            }
        }
    };

    if ((Boolean) v.get('themed')) {
        spec.put('theme', new Map<String, Object>{
            'source' => 'builtin',
            'name' => 'editorialIvory',
            'overrides' => new Map<String, Object>{
                'palette' => new Map<String, Object>{ 'pageBg' => '#dbeafe' },
                'effects' => new Map<String, Object>{ 'mesh' => 'aurora', 'texture' => 'dots' },
                'pageImage' => new Map<String, Object>{ 'url' => IMG_URL, 'fit' => (String) v.get('fit'), 'position' => 'center' }
            }
        });
    } else {
        spec.put('theme', null);
    }

    versions.add(new Form_Version__c(
        Name = 'P0 v' + String.valueOf(v.get('num')) + ' — ' + (String) v.get('label'),
        Form__c = form.Id,
        Version_Number__c = (Integer) v.get('num'),
        Is_Active__c = (Boolean) v.get('active'),
        Spec_JSON__c = JSON.serialize(spec),
        Engine_Version__c = 1
    ));
}
// ---- P1 multi-page variants: 3 pages, one section each -----------------------
List<Map<String, Object>> p1Variants = new List<Map<String, Object>>{
    new Map<String, Object>{ 'num' => 5, 'label' => 'Stepper Top Gated', 'type' => 'stepper',
        'options' => new Map<String, Object>{ 'placement' => 'top', 'mode' => 'numbered', 'navigation' => 'gated', 'showStepCount' => true } },
    new Map<String, Object>{ 'num' => 6, 'label' => 'Stepper Rail Free', 'type' => 'stepper',
        'options' => new Map<String, Object>{ 'placement' => 'leftRail', 'mode' => 'numbered', 'navigation' => 'free', 'railWidth' => 'standard' } },
    new Map<String, Object>{ 'num' => 7, 'label' => 'Stepper Progress Bar', 'type' => 'stepper',
        'options' => new Map<String, Object>{ 'placement' => 'top', 'mode' => 'progressBar', 'navigation' => 'gated', 'showStepCount' => true } },
    new Map<String, Object>{ 'num' => 8, 'label' => 'Tabs Underline', 'type' => 'tabs',
        'options' => new Map<String, Object>{ 'tabAlignment' => 'left', 'tabStyle' => 'underline' } },
    new Map<String, Object>{ 'num' => 9, 'label' => 'Accordion Single Open', 'type' => 'accordion',
        'options' => new Map<String, Object>{ 'allowMultiple' => false, 'firstPanelOpen' => true, 'iconPosition' => 'leading' } },
    new Map<String, Object>{ 'num' => 10, 'label' => 'Rail Left Both', 'type' => 'rail',
        'options' => new Map<String, Object>{ 'side' => 'left', 'railWidth' => 'standard', 'railContent' => 'both', 'sticky' => true, 'narrowBehavior' => 'topBar' } },
    new Map<String, Object>{ 'num' => 11, 'label' => 'One At A Time', 'type' => 'oneAtATime',
        'options' => new Map<String, Object>{ 'advanceTrigger' => 'keyboard', 'advanceLabel' => 'Continue', 'showProgressBar' => true, 'backLinkStyle' => 'text' } },
    new Map<String, Object>{ 'num' => 12, 'label' => 'Split Hero Pages', 'type' => 'splitHero',
        'options' => new Map<String, Object>{
            'side' => 'left', 'ratio' => 'half', 'sticky' => false, 'paneFlow' => 'pages',
            'paneImage' => new Map<String, Object>{ 'url' => IMG_URL },
            'paneBg' => '#0e7490', 'paneBgOpacity' => 60,
            'paneBrandName' => 'Acme Outdoors',
            'paneTitle' => '<p><strong>Adventure</strong> starts here</p>',
            'paneSubtitle' => '<p>Tell us where you want to go and we handle the rest.</p>',
            'paneHighlight' => new Map<String, Object>{ 'text' => 'Closes Friday!', 'variant' => 'badge', 'icon' => null, 'dismissible' => false },
            'blockPlacement' => new Map<String, Object>{ 'title' => 'center', 'subtitle' => 'center', 'highlight' => 'bottom' },
            'progressStyle' => 'default', 'navigation' => 'gated'
        } },
    new Map<String, Object>{ 'num' => 13, 'label' => 'Split Hero OneAtATime', 'type' => 'splitHero',
        'options' => new Map<String, Object>{
            // fullBleed:false = the Immersive toggle reverted — carded pane inside the panel
            'side' => 'left', 'ratio' => 'third', 'sticky' => false, 'paneFlow' => 'oneAtATime', 'fullBleed' => false,
            'paneImage' => new Map<String, Object>{ 'url' => IMG_URL },
            'paneBg' => '#1f2937', 'paneBgOpacity' => 70,
            'paneBrandName' => 'Acme Outdoors',
            'paneTitle' => '<p>One thing at a time</p>',
            'blockPlacement' => new Map<String, Object>{ 'title' => 'top' },
            'progressStyle' => 'horizontal', 'navigation' => 'gated'
        } }
};

for (Map<String, Object> sv : p1Variants) {
    Map<String, Object> spec = new Map<String, Object>{
        'specVersion' => 1,
        'form' => new Map<String, Object>{
            'id' => form.Id, 'name' => FORM_NAME, 'type' => 'form',
            'targetObject' => 'Contact', 'saveMode' => 'create'
        },
        'layout' => new Map<String, Object>{
            'type' => (String) sv.get('type'), 'options' => (Map<String, Object>) sv.get('options'),
            'maxWidth' => 'medium',
            'zonesDefault' => new Map<String, Object>{ 'arrangement' => 'single', 'gap' => 'md', 'collapse' => 'standard', 'collapseOrder' => 'source' }
        },
        'header' => new Map<String, Object>{
            'style' => 'standard', 'arrangement' => 'stacked',
            'brandName' => 'Acme Outdoors',
            'title' => 'P1 ' + (String) sv.get('label'),
            'description' => 'Checklist reel: one header, one progress, Submit only on the last step.'
        },
        'submit' => new Map<String, Object>{
            'label' => 'Submit', 'alignment' => 'right', 'placement' => 'inline',
            'nextLabel' => 'Continue', 'backLabel' => 'Back'
        },
        'theme' => new Map<String, Object>{
            'source' => 'builtin', 'name' => 'editorialIvory',
            'overrides' => new Map<String, Object>{
                'palette' => new Map<String, Object>{ 'pageBg' => '#dbeafe' },
                'effects' => new Map<String, Object>{ 'mesh' => 'aurora', 'texture' => 'dots' },
                'pageImage' => new Map<String, Object>{ 'url' => IMG_URL, 'fit' => 'cover', 'position' => 'center' }
            }
        },
        'pages' => new List<Object>{
            new Map<String, Object>{
                'id' => 'pg_p1step001', 'name' => 'Your name',
                'sections' => new List<Object>{ new Map<String, Object>{
                    'id' => 'sec_p1step01', 'title' => 'Your name', 'style' => 'card', 'columns' => 2,
                    'elements' => new List<Object>{
                        new Map<String, Object>{ 'id' => 'el_p1first01', 'type' => 'field',
                            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'FirstName' },
                            'label' => 'First name', 'required' => true,
                            'config' => new Map<String, Object>{ 'inputType' => 'text' } },
                        new Map<String, Object>{ 'id' => 'el_p1last01', 'type' => 'field',
                            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'LastName' },
                            'label' => 'Last name', 'required' => true,
                            'config' => new Map<String, Object>{ 'inputType' => 'text' } }
                    } } }
            },
            new Map<String, Object>{
                'id' => 'pg_p1step002', 'name' => 'Contact',
                'sections' => new List<Object>{ new Map<String, Object>{
                    'id' => 'sec_p1step02', 'title' => 'How do we reach you?', 'style' => 'card', 'columns' => 1,
                    'elements' => new List<Object>{
                        new Map<String, Object>{ 'id' => 'el_p1email01', 'type' => 'field',
                            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'Email' },
                            'label' => 'Email', 'required' => true,
                            'config' => new Map<String, Object>{ 'inputType' => 'email' } },
                        new Map<String, Object>{ 'id' => 'el_p1phone01', 'type' => 'field',
                            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'Phone' },
                            'label' => 'Phone',
                            'config' => new Map<String, Object>{ 'inputType' => 'tel' } }
                    } } }
            },
            new Map<String, Object>{
                'id' => 'pg_p1step003', 'name' => 'Message',
                'sections' => new List<Object>{ new Map<String, Object>{
                    'id' => 'sec_p1step03', 'title' => 'Your message', 'style' => 'card', 'columns' => 1,
                    'elements' => new List<Object>{
                        new Map<String, Object>{ 'id' => 'el_p1notes01', 'type' => 'field',
                            'binding' => new Map<String, Object>{ 'object' => 'Contact', 'field' => 'Description' },
                            'label' => 'Anything else?',
                            'config' => new Map<String, Object>{ 'inputType' => 'textarea' } }
                    } } }
            }
        }
    };

    versions.add(new Form_Version__c(
        Name = 'P1 v' + String.valueOf(sv.get('num')) + ' — ' + (String) sv.get('label'),
        Form__c = form.Id,
        Version_Number__c = (Integer) sv.get('num'),
        Is_Active__c = false,
        Spec_JSON__c = JSON.serialize(spec),
        Engine_Version__c = 1
    ));
}

insert versions;

Map<String, String> ids = new Map<String, String>{ 'formId' => form.Id };
for (Form_Version__c fv : [
    SELECT Id, Version_Number__c FROM Form_Version__c WHERE Form__c = :form.Id ORDER BY Version_Number__c
]) {
    ids.put('v' + String.valueOf(fv.Version_Number__c.intValue()), fv.Id);
}
System.debug('P0SEED|' + JSON.serialize(ids));
