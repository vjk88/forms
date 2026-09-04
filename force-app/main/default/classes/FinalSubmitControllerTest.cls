@IsTest
private class FinalSubmitControllerTest {
    private static Id makeActiveVersion(String targetObject, String pagesJson) {
        Form__c f = new Form__c(
            Name = 'Submit test',
            Primary_Context_Object__c = targetObject
        );
        insert f;
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"targetObject":"' +
                targetObject +
                '"},"pages":' +
                pagesJson +
                '}'
        );
        insert v;
        return v.Id;
    }

    @IsTest
    static void mapsAnswersCoercesTypesAndInserts() {
        Id versionId = makeActiveVersion(
            'Contact',
            '[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
                '{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}},' +
                '{"id":"el_em","type":"field","binding":{"object":"Contact","field":"Email"}},' +
                '{"id":"el_bd","type":"field","binding":{"object":"Contact","field":"Birthdate"}},' +
                '{"id":"el_dnc","type":"field","binding":{"object":"Contact","field":"DoNotCall"}},' +
                '{"id":"el_unbound","type":"field"}' +
                ']}]}]'
        );
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{
                    'el_ln' => 'Riley',
                    'el_em' => 'riley@example.com',
                    'el_bd' => '1990-04-01',
                    'el_dnc' => true,
                    'el_unbound' => 'ignored',
                    'el_ghost' => 'ignored too'
                }
            }
        );

        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            versionId,
            payload
        );
        Test.stopTest();

        Contact saved = [
            SELECT LastName, Email, Birthdate
            FROM Contact
            WHERE Id = :res.recordId
        ];
        Assert.areEqual('Riley', saved.LastName);
        Assert.areEqual('riley@example.com', saved.Email);
        Assert.areEqual(Date.newInstance(1990, 4, 1), saved.Birthdate);
        // DoNotCall stays in the payload to exercise boolean coercion, but
        // its FLS is org-dependent (stripInaccessible may drop it) — no
        // persisted assert.
        Assert.areEqual(0, res.childCount);
    }

    @IsTest
    static void repeatsInsertChildrenLinkedToTheParent() {
        // parent Contact / child Case — this dev org blocks EVERY Account
        // insert (joke always-true rule) and assets demand account-parented
        // contacts; cases parent to contacts freely
        Id versionId = makeActiveVersion(
            'Contact',
            '[{"id":"pg_1","sections":[' +
                '{"id":"sec_1","elements":[{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]},' +
                '{"id":"sec_rep","repeat":{"childObject":"Case","relationshipField":"ContactId"},' +
                '"elements":[{"id":"el_an","type":"field","binding":{"object":"Case","field":"Subject"}}]}' +
                ']}]'
        );
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Parent' },
                'repeats' => new Map<String, Object>{
                    'sec_rep' => new List<Object>{
                        new Map<String, Object>{ 'el_an' => 'One' },
                        new Map<String, Object>{ 'el_an' => 'Two' },
                        new Map<String, Object>{ 'el_an' => '' } // blank entry inserts nothing
                    }
                }
            }
        );

        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            versionId,
            payload
        );
        Test.stopTest();

        Assert.areEqual(2, res.childCount);
        List<Case> kids = [
            SELECT Subject
            FROM Case
            WHERE ContactId = :res.recordId
            ORDER BY Subject
        ];
        Assert.areEqual(2, kids.size());
        Assert.areEqual('One', kids[0].Subject);
    }

    @IsTest
    static void aFailingChildRollsBackTheParent() {
        Id versionId = makeActiveVersion(
            'Contact',
            '[{"id":"pg_1","sections":[' +
                '{"id":"sec_1","elements":[{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]},' +
                '{"id":"sec_rep","repeat":{"childObject":"Asset","relationshipField":"ContactId"},' +
                '"elements":[' +
                '{"id":"el_an","type":"field","binding":{"object":"Asset","field":"Name"}},' +
                '{"id":"el_dt","type":"field","binding":{"object":"Asset","field":"InstallDate"}}' +
                ']}' +
                ']}]'
        );
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Doomed' },
                'repeats' => new Map<String, Object>{
                    'sec_rep' => new List<Object>{
                        new Map<String, Object>{
                            'el_an' => 'Bad',
                            'el_dt' => 'not-a-date'
                        }
                    }
                }
            }
        );

        Integer before = [
            SELECT COUNT()
            FROM Contact
            WHERE LastName = 'Doomed'
        ];
        try {
            FinalSubmitController.submitForm(null, versionId, payload);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        Assert.areEqual(
            before,
            [SELECT COUNT() FROM Contact WHERE LastName = 'Doomed'],
            'parent rolled back with the failing child'
        );
    }

    @IsTest
    static void resolvesTheActiveVersionFromTheFormId() {
        Form__c f = new Form__c(
            Name = 'Active pick',
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"targetObject":"Contact"},"pages":[{"id":"pg_1","sections":[{"id":"sec_1","elements":[{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}}]}]}]}'
        );
        // an inactive DRAFT above it must NOT be the submit target
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 2,
            Is_Active__c = false,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"targetObject":"Account"},"pages":[]}'
        );

        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            f.Id,
            null,
            '{"answers":{"el_ln":"ViaForm"}}'
        );
        Assert.areEqual(
            'ViaForm',
            [SELECT LastName FROM Contact WHERE Id = :res.recordId].LastName
        );
    }

    @IsTest
    static void guardsRejectMissingInputs() {
        try {
            FinalSubmitController.submitForm(null, null, '{}');
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        try {
            FinalSubmitController.submitForm(null, null, null);
            Assert.fail('should throw');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    // ---- File upload (schema §8 `files`) -------------------------------

    /** One bound LastName + one `file` element, with optional accept config
     *  and an optional repeatable section holding a second file element (the
     *  §4.1 backstop case). */
    private static Id makeFileVersion(String accept, Boolean withRepeatFile) {
        String cfg = accept == null
            ? ''
            : ',"config":{"accept":"' + accept + '"}';
        String repeatSection = withRepeatFile
            ? ',{"id":"sec_rep","repeat":{"childObject":"Case","relationshipField":"ContactId"},' +
              '"elements":[{"id":"el_repfile","type":"file"}]}'
            : '';
        return makeActiveVersion(
            'Contact',
            '[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
                '{"id":"el_ln","type":"field","binding":{"object":"Contact","field":"LastName"}},' +
                '{"id":"el_file","type":"file"' +
                cfg +
                '}' +
                ']}' +
                repeatSection +
                ']}]'
        );
    }

    private static String payloadWithFile(
        String elementId,
        String name,
        String b64
    ) {
        return JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Filer' },
                'files' => new List<Object>{
                    new Map<String, Object>{
                        'elementId' => elementId,
                        'name' => name,
                        'base64' => b64
                    }
                }
            }
        );
    }

    private static String b64Of(String content) {
        return EncodingUtil.base64Encode(Blob.valueOf(content));
    }

    @IsTest
    static void attachesContentVersionToTheNewRecord() {
        Id versionId = makeFileVersion(null, false);

        Test.startTest();
        FinalSubmitController.SubmitResult res = FinalSubmitController.submitForm(
            null,
            versionId,
            payloadWithFile('el_file', 'notes.txt', b64Of('hello world'))
        );
        Test.stopTest();

        List<ContentDocumentLink> links = [
            SELECT ContentDocument.LatestPublishedVersion.Title
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :res.recordId
        ];
        Assert.areEqual(1, links.size(), 'file links to the new record');
        Assert.areEqual(
            'notes.txt',
            links[0].ContentDocument.LatestPublishedVersion.Title
        );
    }

    /** The security boundary: an elementId that isn't an authored `file`
     *  element is refused, and the record rolls back with it. */
    @IsTest
    static void rejectsFilesForNonFileElements() {
        Id versionId = makeFileVersion(null, false);
        Integer before = [SELECT COUNT() FROM Contact];

        Test.startTest();
        try {
            FinalSubmitController.submitForm(
                null,
                versionId,
                payloadWithFile('el_ln', 'sneaky.txt', b64Of('nope'))
            );
            Assert.fail('should reject a non-file elementId');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        Test.stopTest();

        Assert.areEqual(before, [SELECT COUNT() FROM Contact], 'rolled back');
    }

    /** Schema §4.1 backstop: even if a spec somehow carries a file element
     *  inside a repeatable section, the server refuses it. */
    @IsTest
    static void rejectsFileElementInsideARepeatableSection() {
        Id versionId = makeFileVersion(null, true);

        Test.startTest();
        try {
            FinalSubmitController.submitForm(
                null,
                versionId,
                payloadWithFile('el_repfile', 'child.txt', b64Of('x'))
            );
            Assert.fail('§4.1: repeat-section file must be refused');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        Test.stopTest();
    }

    @IsTest
    static void rejectsDisallowedExtensions() {
        // denied outright, whatever the author configured
        Id anyType = makeFileVersion(null, false);
        try {
            FinalSubmitController.submitForm(
                null,
                anyType,
                payloadWithFile('el_file', 'payload.exe', b64Of('MZ'))
            );
            Assert.fail('executables are always refused');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }

        // outside the author's accept list
        Id pdfOnly = makeFileVersion('.pdf', false);
        try {
            FinalSubmitController.submitForm(
                null,
                pdfOnly,
                payloadWithFile('el_file', 'sheet.csv', b64Of('a,b'))
            );
            Assert.fail('accept list must be enforced server-side');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }

        // and the allowed one still lands
        FinalSubmitController.SubmitResult ok = FinalSubmitController.submitForm(
            null,
            pdfOnly,
            payloadWithFile('el_file', 'report.pdf', b64Of('%PDF-1.4'))
        );
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :ok.recordId
            ]
        );
    }

    /** A forged contentType must not buy anything — the server derives the
     *  type from the name and never reads that field. */
    @IsTest
    static void ignoresClientSuppliedContentType() {
        Id pdfOnly = makeFileVersion('.pdf', false);
        String payload = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Filer' },
                'files' => new List<Object>{
                    new Map<String, Object>{
                        'elementId' => 'el_file',
                        'name' => 'payload.exe',
                        'contentType' => 'application/pdf', // forged
                        'base64' => b64Of('MZ')
                    }
                }
            }
        );
        try {
            FinalSubmitController.submitForm(null, pdfOnly, payload);
            Assert.fail('contentType must not override the real extension');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void rejectsOversizeFileAndRollsBack() {
        Id versionId = makeFileVersion(null, false);
        Integer before = [SELECT COUNT() FROM Contact];
        // one char over the per-file cap, cheap to build (no real payload)
        String tooBig = 'A'.repeat(FinalSubmitService.MAX_FILE_B64_CHARS + 1);

        Test.startTest();
        try {
            FinalSubmitController.submitForm(
                null,
                versionId,
                payloadWithFile('el_file', 'big.txt', tooBig)
            );
            Assert.fail('oversize file must be refused');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
        Test.stopTest();

        Assert.areEqual(before, [SELECT COUNT() FROM Contact], 'rolled back');
    }

    /**
     * The measurement IMPL_PLAN_FILE_UPLOAD §4.4 demands, walking the REAL
     * path — payloadJson → deserialize → decode — because that is where the
     * base64 is held three times at once. A decode-only check passes at sizes
     * the actual submit cannot survive, which is how the first draft of this
     * feature ended up with a 4.3 MB cap that blew heap on contact.
     *
     * If this fails, LOWER the constants; never raise the assertion.
     */
    @IsTest
    static void heapHeadroomHoldsAtTheCap() {
        Integer cap = FinalSubmitService.MAX_PAYLOAD_B64_CHARS;
        String b64 = 'A'.repeat(cap);
        String payloadJson = JSON.serialize(
            new Map<String, Object>{
                'answers' => new Map<String, Object>{ 'el_ln' => 'Filer' },
                'files' => new List<Object>{
                    new Map<String, Object>{
                        'elementId' => 'el_file',
                        'name' => 'f.pdf',
                        'base64' => b64
                    }
                }
            }
        );
        Map<String, Object> parsed = (Map<String, Object>) JSON.deserializeUntyped(
            payloadJson
        );
        List<Object> files = (List<Object>) parsed.get('files');
        Map<String, Object> first = (Map<String, Object>) files[0];
        Blob decoded = EncodingUtil.base64Decode((String) first.get('base64'));

        Assert.isTrue(decoded.size() > 0, 'decoded');
        // Headroom, not merely "did not throw": the real transaction still has
        // the spec, describe maps and the records to allocate after this.
        Integer used = Limits.getHeapSize();
        Integer ceiling = Limits.getLimitHeapSize();
        Assert.isTrue(
            used < (ceiling * 3) / 4,
            'a payload at the aggregate cap must leave a quarter of the heap ' +
                'for the rest of the submit — used ' +
                used +
                ' of ' +
                ceiling
        );
    }
}
