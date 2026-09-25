@IsTest
private class FinalGuestContextServiceTest {
    private static Map<String, Object> linkSpec(List<Object> mappings) {
        return new Map<String, Object>{
            'pages' => new List<Object>(),
            'form' => new Map<String, Object>{ 'type' => 'freeform' },
            'settings' => new Map<String, Object>{
                'prefill' => new Map<String, Object>{
                    'rulesVersion' => 1,
                    'autofillRules' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'af_link',
                            'enabled' => true,
                            'source' => new Map<String, Object>{
                                'type' => 'link',
                                'objectApiName' => 'Contact'
                            },
                            'mappings' => mappings
                        }
                    }
                }
            }
        };
    }

    private static Map<String, Object> m(
        String fromField,
        String toEl,
        Boolean guest
    ) {
        return new Map<String, Object>{
            'from' => fromField,
            'to' => toEl,
            'guestAllowed' => guest
        };
    }

    @IsTest
    static void aGuestGetsTickedFieldsAndHopsKeyedByQuestion() {
        Contact c = new Contact(LastName = 'Rivera');
        insert c;
        Map<String, Object> out = FinalGuestContextService.compute(
            linkSpec(
                new List<Object>{
                    m('LastName', 'el_last', true),
                    m('Account.Name', 'el_company', true),
                    // not ticked: never read for a guest
                    m('Email', 'el_email', false)
                }
            ),
            'Contact',
            c.Id
        );
        List<Object> autofill = (List<Object>) out.get('autofill');
        Assert.areEqual(1, autofill.size());
        Map<String, Object> values = (Map<String, Object>) ((Map<String, Object>) autofill[0])
            .get('values');
        Assert.areEqual('Rivera', values.get('el_last'));
        // an empty lookup: present and null
        Assert.isTrue(values.containsKey('el_company'));
        Assert.isNull(values.get('el_company'));
        // never the unticked field, and never keyed by a field name
        Assert.isFalse(values.containsKey('el_email'));
        Assert.isFalse(values.containsKey('LastName'));
        Assert.isFalse(values.containsKey('Account.Name'));
    }

    @IsTest
    static void twoHopsAreNeverRead() {
        Contact c = new Contact(LastName = 'Kim');
        insert c;
        Map<String, Object> out = FinalGuestContextService.compute(
            linkSpec(new List<Object>{ m('Account.Owner.Name', 'el_x', true) }),
            'Contact',
            c.Id
        );
        List<Object> autofill = (List<Object>) out.get('autofill');
        Map<String, Object> values = autofill.isEmpty()
            ? new Map<String, Object>()
            : (Map<String, Object>) ((Map<String, Object>) autofill[0])
                  .get('values');
        Assert.isFalse(values.containsKey('el_x'));
    }
}
