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

    // ---- audience: guests get ticked rows; signed-in people get the rest ----
    // (owner 2026-11-22). Job_Application__c is a custom object a Minimum
    // Access user can't see until a permission set says so, which lets us
    // control exactly which fields that user can read. Its sharing model is
    // ReadWrite, so "no sharing to the record" can't be staged here; that
    // half is enforced by AccessLevel.USER_MODE itself (the user-mode query
    // returns no row) and is covered only by that platform guarantee.

    private static Map<String, Object> jobSpec() {
        return new Map<String, Object>{
            'pages' => new List<Object>(),
            'form' => new Map<String, Object>{ 'type' => 'freeform' },
            'settings' => new Map<String, Object>{
                'prefill' => new Map<String, Object>{
                    'rulesVersion' => 1,
                    'autofillRules' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'af_job',
                            'enabled' => true,
                            'source' => new Map<String, Object>{
                                'type' => 'link',
                                'objectApiName' => 'Job_Application__c'
                            },
                            'mappings' => new List<Object>{
                                m('Applicant_Name__c', 'el_name', true),
                                m('Desired_Salary__c', 'el_salary', false),
                                m('Available_Start_Date__c', 'el_start', false)
                            }
                        }
                    }
                }
            }
        };
    }

    private static Map<String, Object> valuesOf(Map<String, Object> out) {
        List<Object> autofill = (List<Object>) out.get('autofill');
        Assert.areEqual(1, autofill.size(), 'one rule answers');
        return (Map<String, Object>) ((Map<String, Object>) autofill[0])
            .get('values');
    }

    private static Job_Application__c jobRecord() {
        Job_Application__c ja = new Job_Application__c(
            Applicant_Name__c = 'Ada Lovelace',
            Desired_Salary__c = 250,
            Available_Start_Date__c = Date.newInstance(2027, 1, 15)
        );
        insert ja;
        return ja;
    }

    @IsTest
    static void aSignedInAdminGetsTickedAndUntickedRows() {
        Job_Application__c ja = jobRecord();
        Map<String, Object> out = FinalGuestContextService.compute(
            jobSpec(),
            'Job_Application__c',
            ja.Id,
            true
        );
        Map<String, Object> values = valuesOf(out);
        Assert.areEqual('Ada Lovelace', values.get('el_name'));
        Assert.isTrue(((Decimal) values.get('el_salary')) == 250);
        Assert.areEqual(Date.newInstance(2027, 1, 15), values.get('el_start'));
        Assert.areNotEqual(false, out.get('recordFound'));
    }

    @IsTest
    static void aGuestCallGetsTickedRowsOnly() {
        Job_Application__c ja = jobRecord();
        // the 3-argument form is the guest entry point's call
        Map<String, Object> guest = valuesOf(
            FinalGuestContextService.compute(
                jobSpec(),
                'Job_Application__c',
                ja.Id
            )
        );
        // an explicit false is the same
        Map<String, Object> explicitFalse = valuesOf(
            FinalGuestContextService.compute(
                jobSpec(),
                'Job_Application__c',
                ja.Id,
                false
            )
        );
        for (
            Map<String, Object> values : new List<Map<String, Object>>{
                guest,
                explicitFalse
            }
        ) {
            Assert.areEqual('Ada Lovelace', values.get('el_name'));
            Assert.isFalse(values.containsKey('el_salary'));
            Assert.isFalse(values.containsKey('el_start'));
        }
    }

    @IsTest
    static void onlyUntickedRowsStillAppliesForASignedInUser() {
        Job_Application__c ja = jobRecord();
        Map<String, Object> spec = jobSpec();
        // untick the one ticked row
        Map<String, Object> rule = (Map<String, Object>) ((List<Object>) ((Map<String, Object>) ((Map<String, Object>) spec.get(
                    'settings'
                ))
                .get('prefill'))
            .get('autofillRules'))[0];
        ((Map<String, Object>) ((List<Object>) rule.get('mappings'))[0])
            .put('guestAllowed', false);
        Map<String, Object> out = FinalGuestContextService.compute(
            spec,
            'Job_Application__c',
            ja.Id,
            true
        );
        // the record is found even though no ticked field was read
        Assert.areNotEqual(false, out.get('recordFound'));
        Assert.areEqual('Ada Lovelace', valuesOf(out).get('el_name'));
        // a guest asking the same spec gets no rows at all
        Map<String, Object> guestOut = FinalGuestContextService.compute(
            spec,
            'Job_Application__c',
            ja.Id
        );
        Assert.isTrue(
            guestOut.get('autofill') == null ||
            ((List<Object>) guestOut.get('autofill')).isEmpty()
        );
    }

    @IsTest
    static void aSignedInUserWithoutFieldAccessGetsNoValueForThatRow() {
        Job_Application__c ja = jobRecord();
        User u;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id minimal = [
                SELECT Id
                FROM Profile
                WHERE Name = 'Minimum Access - Salesforce'
                LIMIT 1
            ]
            .Id;
            u = new User(
                ProfileId = minimal,
                Username = 'lnk.ctx.' +
                    String.valueOf(Crypto.getRandomInteger())
                        .replace('-', 'n') +
                    '@freeform.test.invalid',
                Email = 'noreply@freeform.test.invalid',
                LastName = 'LinkCtx',
                Alias = 'lnkctx',
                TimeZoneSidKey = 'America/Los_Angeles',
                LocaleSidKey = 'en_US',
                EmailEncodingKey = 'UTF-8',
                LanguageLocaleKey = 'en_US'
            );
            insert u;
            PermissionSet ps = new PermissionSet(
                Name = 'LinkCtxFlsPS',
                Label = 'LinkCtxFlsPS'
            );
            insert ps;
            insert new ObjectPermissions(
                ParentId = ps.Id,
                SobjectType = 'Job_Application__c',
                PermissionsRead = true
            );
            // can read the name and start date; Desired_Salary__c is NOT granted
            insert new List<FieldPermissions>{
                new FieldPermissions(
                    ParentId = ps.Id,
                    SobjectType = 'Job_Application__c',
                    Field = 'Job_Application__c.Applicant_Name__c',
                    PermissionsRead = true
                ),
                new FieldPermissions(
                    ParentId = ps.Id,
                    SobjectType = 'Job_Application__c',
                    Field = 'Job_Application__c.Available_Start_Date__c',
                    PermissionsRead = true
                )
            };
            insert new PermissionSetAssignment(
                AssigneeId = u.Id,
                PermissionSetId = ps.Id
            );
        }

        Map<String, Object> signedIn;
        Map<String, Object> guest;
        // a fresh runAs after the permission set exists
        System.runAs(u) {
            signedIn = valuesOf(
                FinalGuestContextService.compute(
                    jobSpec(),
                    'Job_Application__c',
                    ja.Id,
                    true
                )
            );
            guest = valuesOf(
                FinalGuestContextService.compute(
                    jobSpec(),
                    'Job_Application__c',
                    ja.Id
                )
            );
        }
        // ticked row: the server's read, so it fills
        Assert.areEqual('Ada Lovelace', signedIn.get('el_name'));
        // unticked + readable: filled with the user's own access
        Assert.areEqual(
            Date.newInstance(2027, 1, 15),
            signedIn.get('el_start')
        );
        // unticked + no field access: no value, no error, no leak
        Assert.isFalse(signedIn.containsKey('el_salary'));
        // and the guest-style call still gets the ticked row only
        Assert.areEqual('Ada Lovelace', guest.get('el_name'));
        Assert.isFalse(guest.containsKey('el_start'));
        Assert.isFalse(guest.containsKey('el_salary'));
    }

    @IsTest
    static void aSignedInUserWithNoObjectAccessStillGetsTickedRows() {
        Job_Application__c ja = jobRecord();
        User u;
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Id minimal = [
                SELECT Id
                FROM Profile
                WHERE Name = 'Minimum Access - Salesforce'
                LIMIT 1
            ]
            .Id;
            u = new User(
                ProfileId = minimal,
                Username = 'lnk.noobj.' +
                    String.valueOf(Crypto.getRandomInteger())
                        .replace('-', 'n') +
                    '@freeform.test.invalid',
                Email = 'noreply@freeform.test.invalid',
                LastName = 'LinkNoObj',
                Alias = 'lnknoob',
                TimeZoneSidKey = 'America/Los_Angeles',
                LocaleSidKey = 'en_US',
                EmailEncodingKey = 'UTF-8',
                LanguageLocaleKey = 'en_US'
            );
            insert u;
        }
        Map<String, Object> values;
        System.runAs(u) {
            values = valuesOf(
                FinalGuestContextService.compute(
                    jobSpec(),
                    'Job_Application__c',
                    ja.Id,
                    true
                )
            );
        }
        Assert.areEqual('Ada Lovelace', values.get('el_name'));
        Assert.isFalse(values.containsKey('el_salary'));
        Assert.isFalse(values.containsKey('el_start'));
    }

    @IsTest
    static void aSignedInEmptyLookupHopReadsAsPresentAndNull() {
        Contact c = new Contact(LastName = 'Okafor');
        insert c;
        Map<String, Object> out = FinalGuestContextService.compute(
            linkSpec(
                new List<Object>{
                    m('LastName', 'el_last', false),
                    m('Account.Name', 'el_company', false)
                }
            ),
            'Contact',
            c.Id,
            true
        );
        Map<String, Object> values = valuesOf(out);
        Assert.areEqual('Okafor', values.get('el_last'));
        Assert.isTrue(values.containsKey('el_company'));
        Assert.isNull(values.get('el_company'));
    }
}
