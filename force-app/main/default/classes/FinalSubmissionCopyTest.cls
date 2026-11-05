/**
 * The saved PDF copy (IMPL_PLAN_FORM_PDF §6.4): queued by the trigger, built
 * from what was stored, recorded on the submission, never blocking a submit.
 */
@IsTest
private class FinalSubmissionCopyTest {
    private static Id version(Boolean saveCopy, String extraElementJson) {
        Form__c form = new Form__c(
            Name = 'Copy test',
            Form_Type__c = 'Freeform'
        );
        insert form;
        String spec =
            '{"specVersion":1,"form":{"type":"freeform","name":"Copy test"},' +
            '"settings":{"documents":{"saveCopy":' +
            saveCopy +
            '}},' +
            '"header":{"title":"Volunteer <sign-up>","description":"Thanks"},' +
            '"resolved":{"print":{"text":"#112233","headerBg":"#1f4f36","headerText":"#ffffff","accent":"red;}body{x:y","headerIsPaper":false}},' +
            '"pages":[{"id":"pg_1","name":"About you","sections":[{"id":"sec_1","title":"Basics","elements":[' +
            '{"id":"el_1","type":"field","label":"Name"},' +
            '{"id":"el_nps","type":"nps","label":"Recommend us?"},' +
            '{"id":"el_ok","type":"consent","label":"Consent","config":{"html":"<p>I agree.</p>"}}' +
            (extraElementJson == null ? '' : ',' + extraElementJson) +
            ']}]}]}';
        Form_Version__c v = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Spec_JSON__c = spec,
            Engine_Version__c = 1
        );
        insert v;
        return v.Id;
    }

    private static Form_Submission__c submit(Id versionId) {
        Form_Version__c v = [
            SELECT Form__c
            FROM Form_Version__c
            WHERE Id = :versionId
        ];
        Form_Submission__c sub = new Form_Submission__c(
            Form__c = v.Form__c,
            Form_Version__c = versionId,
            Submitted_Date__c = Datetime.now()
        );
        insert sub;
        insert new List<Form_Submission_Answer__c>{
            new Form_Submission_Answer__c(
                Form_Submission__c = sub.Id,
                Element_Key__c = 'el_1',
                Answer_Type__c = 'Text',
                Text_Value__c = '<script>alert(1)</script> Ana'
            ),
            new Form_Submission_Answer__c(
                Form_Submission__c = sub.Id,
                Element_Key__c = 'el_nps',
                Answer_Type__c = 'Number',
                Numeric_Value__c = 9
            ),
            new Form_Submission_Answer__c(
                Form_Submission__c = sub.Id,
                Element_Key__c = 'el_ok',
                Answer_Type__c = 'Boolean',
                Boolean_Value__c = true
            )
        };
        return sub;
    }

    private static Form_Submission__c reload(Id id) {
        return [
            SELECT Id, Name, Copy_Status__c, Copy_Message__c, Copy_File_Id__c
            FROM Form_Submission__c
            WHERE Id = :id
        ];
    }

    @IsTest
    static void aFormThatSavesCopiesQueuesAndSavesOne() {
        Id v = version(true, null);
        Test.startTest();
        Form_Submission__c sub = submit(v);
        Assert.areEqual(
            'Queued',
            reload(sub.Id).Copy_Status__c,
            'queued on insert'
        );
        Test.stopTest(); // runs the job

        Form_Submission__c after = reload(sub.Id);
        Assert.areEqual(
            'Saved',
            after.Copy_Status__c,
            'saved: ' + after.Copy_Message__c
        );
        ContentVersion cv = [
            SELECT Title, FileExtension, ContentSize, FirstPublishLocationId
            FROM ContentVersion
            WHERE Id = :after.Copy_File_Id__c
        ];
        Assert.areEqual(
            sub.Id,
            cv.FirstPublishLocationId,
            'filed on the submission'
        );
        Assert.isTrue(cv.Title.endsWith(' (saved copy)'), cv.Title);
        Assert.areEqual('pdf', cv.FileExtension);
    }

    @IsTest
    static void otherFormsAreNotNeeded() {
        Form_Submission__c sub = submit(version(false, null));
        Assert.areEqual('Not needed', reload(sub.Id).Copy_Status__c);
    }

    @IsTest
    static void htmlEscapesEveryAnswerAndRejectsNonHexColors() {
        Id v = version(false, null);
        Form_Submission__c sub = submit(v);
        FinalSubmissionCopy.Source full = FinalSubmissionCopy.sourceOf(sub.Id);
        List<Form_Submission_Answer__c> rows = FinalSubmissionCopy.answers(
            sub.Id
        );
        String html = FinalSubmissionCopy.html(
            full,
            rows,
            new List<String>{ 'cv.pdf' }
        );
        Assert.isFalse(html.contains('<script>'), 'answers are escaped');
        Assert.isTrue(html.contains('&lt;script&gt;'), 'and still shown');
        Assert.isTrue(
            html.contains('Volunteer &lt;sign-up&gt;'),
            'titles escaped'
        );
        Assert.isTrue(html.contains('9 out of 10'), 'shared wording');
        Assert.isTrue(
            html.contains('I agree.') && html.contains('Agreed'),
            'consent statement'
        );
        Assert.isTrue(html.contains('#112233'), 'frozen colors used');
        Assert.isFalse(
            html.contains('x:y'),
            'a non-hex color never reaches the CSS'
        );
        Assert.isTrue(html.contains('cv.pdf'), 'attachments listed by name');
    }

    @IsTest
    static void aFailedCopyIsRecordedAndTryAgainMakesIt() {
        Form_Submission__c sub = submit(version(false, null));
        Database.update(
            new Form_Submission__c(
                Id = sub.Id,
                Copy_Status__c = 'Failed',
                Copy_Message__c = 'Boom'
            ),
            true,
            AccessLevel.SYSTEM_MODE
        );
        Test.startTest();
        Map<String, Object> info = FinalSubmissionController.saveCopy(sub.Id);
        Test.stopTest();
        Assert.areEqual('Saved', info.get('status'));
        Assert.isNotNull(info.get('documentId'), 'the file to open');

        Map<String, Object> data = FinalSubmissionController.getSubmission(
            sub.Id
        );
        Assert.areEqual(
            'Saved',
            ((Map<String, Object>) data.get('copy')).get('status')
        );
        Assert.areEqual(
            0,
            ((List<Object>) data.get('files')).size(),
            'the copy is not an attachment'
        );
    }

    @IsTest
    static void aRetriedJobDoesNotMakeASecondCopy() {
        Form_Submission__c sub = submit(version(false, null));
        Id first = FinalSubmissionCopy.save(sub.Id, true);
        Assert.isNotNull(first);
        Assert.isNull(FinalSubmissionCopy.save(sub.Id, false), 'already saved');
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM ContentVersion
                WHERE FirstPublishLocationId = :sub.Id
            ]
        );
    }

    @IsTest
    static void noCapacityMarksFailedWithoutRefusingTheSubmit() {
        Id v = version(true, null);
        Form_Submission__c sub;
        Test.startTest();
        // use up the transaction's queueable allowance first
        Integer room =
            Limits.getLimitQueueableJobs() - Limits.getQueueableJobs();
        for (Integer i = 0; i < room; i++) {
            System.enqueueJob(new FinalSubmissionCopyJob(null));
        }
        sub = submit(v);
        Test.stopTest();
        Form_Submission__c after = reload(sub.Id);
        Assert.areEqual('Failed', after.Copy_Status__c);
        Assert.isTrue(
            after.Copy_Message__c.contains('capacity'),
            after.Copy_Message__c
        );
    }

    @IsTest
    static void colorsFallBackWhenNothingWasFrozen() {
        Map<String, String> c = FinalSubmissionCopy.colors(
            new Map<String, Object>()
        );
        Assert.areEqual('#1f2937', c.get('text'));
        Assert.areEqual('true', c.get('headerIsPaper'));
    }

    // ----- survey responses (Form_Response__c) -----

    private static Id surveyVersion(Boolean saveCopy) {
        Form__c form = new Form__c(
            Name = 'Survey copy test',
            Form_Type__c = 'Survey'
        );
        insert form;
        Form_Version__c v = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 2,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"type":"survey"},' +
                '"settings":{"documents":{"saveCopy":' +
                saveCopy +
                '}},' +
                '"pages":[{"id":"pg_1","sections":[{"id":"sec_1","title":"Feedback","elements":[' +
                '{"id":"el_nps","type":"nps","label":"Recommend us?"},' +
                '{"id":"el_yn","type":"yesNo","label":"Would you return?"},' +
                '{"id":"el_pick","type":"field","label":"Perks","config":{"inputType":"multipicklist","renderAs":"Checkbox_Group","options":[{"value":"g","label":"Gym"},{"value":"l","label":"Lunch"}]}},' +
                '{"id":"el_mx","type":"matrix","label":"Rate","config":{"rows":[{"value":"a","label":"Speed"}]}}' +
                ']}]}]}'
        );
        insert v;
        return v.Id;
    }

    private static Form_Response__c respond(Id versionId) {
        Form_Response__c r = new Form_Response__c(
            Form_Version__c = versionId,
            Status__c = 'Completed',
            Submitted_Date__c = Datetime.now()
        );
        insert r;
        insert new List<Form_Response_Answer__c>{
            new Form_Response_Answer__c(
                Form_Response__c = r.Id,
                Element_Key__c = 'el_nps',
                Numeric_Value__c = 9
            ),
            new Form_Response_Answer__c(
                Form_Response__c = r.Id,
                Element_Key__c = 'el_yn',
                Boolean_Value__c = false
            ),
            new Form_Response_Answer__c(
                Form_Response__c = r.Id,
                Element_Key__c = 'el_pick',
                Selected_Options_JSON__c = '["l","g"]'
            ),
            new Form_Response_Answer__c(
                Form_Response__c = r.Id,
                Element_Key__c = 'el_mx:a',
                Numeric_Value__c = 3
            )
        };
        return r;
    }

    @IsTest
    static void surveyResponsesGetSavedCopiesToo() {
        Id v = surveyVersion(true);
        Test.startTest();
        Form_Response__c r = respond(v);
        Assert.areEqual(
            'Queued',
            [SELECT Copy_Status__c FROM Form_Response__c WHERE Id = :r.Id]
            .Copy_Status__c
        );
        Test.stopTest();
        Form_Response__c after = [
            SELECT Copy_Status__c, Copy_Message__c, Copy_File_Id__c
            FROM Form_Response__c
            WHERE Id = :r.Id
        ];
        Assert.areEqual(
            'Saved',
            after.Copy_Status__c,
            'saved: ' + after.Copy_Message__c
        );
        Assert.areEqual(
            r.Id,
            [
                SELECT FirstPublishLocationId
                FROM ContentVersion
                WHERE Id = :after.Copy_File_Id__c
            ]
            .FirstPublishLocationId
        );
    }

    @IsTest
    static void surveyRowsReadWithTheSameWording() {
        Form_Response__c r = respond(surveyVersion(false));
        Assert.areEqual(
            'Not needed',
            [SELECT Copy_Status__c FROM Form_Response__c WHERE Id = :r.Id]
            .Copy_Status__c
        );
        String html = FinalSubmissionCopy.html(
            FinalSubmissionCopy.sourceOf(r.Id),
            FinalSubmissionCopy.answers(r.Id),
            new List<String>()
        );
        Assert.isTrue(
            html.contains('9 out of 10'),
            'number column → scale words'
        );
        Assert.isTrue(
            html.contains('Would you return?') && html.contains('>No<'),
            'no column set → yes/no'
        );
        Assert.isTrue(html.contains('Lunch, Gym'), 'options column → labels');
        Assert.isTrue(html.contains('Agree'), 'matrix point label');
        Assert.isTrue(html.contains('Version 2'), 'version from the response');
    }

    @IsTest
    static void surveyTypeIsReadFromTheColumnThatHoldsTheValue() {
        Assert.areEqual(
            'Options',
            FinalSubmissionCopy.asSubmissionAnswer(
                    new Form_Response_Answer__c(
                        Selected_Options_JSON__c = '["a"]'
                    )
                )
                .Answer_Type__c
        );
        Assert.areEqual(
            'Number',
            FinalSubmissionCopy.asSubmissionAnswer(
                    new Form_Response_Answer__c(Numeric_Value__c = 1)
                )
                .Answer_Type__c
        );
        Assert.areEqual(
            'Date',
            FinalSubmissionCopy.asSubmissionAnswer(
                    new Form_Response_Answer__c(Date_Value__c = Date.today())
                )
                .Answer_Type__c
        );
        Assert.areEqual(
            'Text',
            FinalSubmissionCopy.asSubmissionAnswer(
                    new Form_Response_Answer__c(Text_Value__c = 'x')
                )
                .Answer_Type__c
        );
        Assert.areEqual(
            'Boolean',
            FinalSubmissionCopy.asSubmissionAnswer(
                    new Form_Response_Answer__c(Boolean_Value__c = true)
                )
                .Answer_Type__c
        );
    }

    @IsTest
    static void saveCopyRefusesOtherRecords() {
        try {
            FinalSubmissionController.saveCopy(UserInfo.getUserId());
            Assert.fail('should refuse');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'only submissions and survey responses');
        }
    }
}
