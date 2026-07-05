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
insert versions;

Map<String, String> ids = new Map<String, String>{ 'formId' => form.Id };
for (Form_Version__c fv : [
    SELECT Id, Version_Number__c FROM Form_Version__c WHERE Form__c = :form.Id ORDER BY Version_Number__c
]) {
    ids.put('v' + String.valueOf(fv.Version_Number__c.intValue()), fv.Id);
}
System.debug('P0SEED|' + JSON.serialize(ids));
