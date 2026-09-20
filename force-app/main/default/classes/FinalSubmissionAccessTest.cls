/**
 * Who can read a Freeform submission (FREEFORM_SPEC §5.4, §7.3).
 *
 * `Form_Submission__c` is org-wide Private, and the reader runs under the
 * reader's OWN permissions. Two permission sets ship, and the difference
 * between them is the whole point:
 *
 *   - Freeform Submission Reader — see what is shared with you
 *   - Freeform Submission Admin  — see everything
 *
 * A permission set is metadata, so nothing about it fails a build when it is
 * wrong. These tests are the only thing that notices, which is why the first
 * one asserts a REFUSAL: the Reader set shipped with View All Records turned
 * on, and every assigned user could read every submission in the org.
 */
@IsTest
private class FinalSubmissionAccessTest {
    private static final String READER = 'ffreader@freeform.test.invalid';
    private static final String VIEWALL = 'ffadmin@freeform.test.invalid';

    /**
     * Users and their permission sets only. Setup objects cannot be created
     * in the same transaction as ordinary records, so the submissions
     * themselves are built inside each test.
     */
    @TestSetup
    static void makeUsers() {
        Id minimal = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Minimum Access - Salesforce'
            LIMIT 1
        ]
        .Id;
        List<User> users = new List<User>{
            newUser(minimal, READER),
            newUser(minimal, VIEWALL)
        };
        insert users;

        Map<String, Id> setIds = new Map<String, Id>();
        for (PermissionSet ps : [
            SELECT Id, Name
            FROM PermissionSet
            WHERE
                Name IN (
                    'Freeform_Submission_Reader',
                    'Freeform_Submission_Admin'
                )
        ]) {
            setIds.put(ps.Name, ps.Id);
        }
        insert new List<PermissionSetAssignment>{
            new PermissionSetAssignment(
                AssigneeId = users[0].Id,
                PermissionSetId = setIds.get('Freeform_Submission_Reader')
            ),
            new PermissionSetAssignment(
                AssigneeId = users[1].Id,
                PermissionSetId = setIds.get('Freeform_Submission_Admin')
            )
        };
    }

    private static User newUser(Id profileId, String username) {
        return new User(
            ProfileId = profileId,
            Username = username,
            Email = 'noreply@freeform.test.invalid',
            LastName = 'Reader',
            Alias = 'ffr',
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
    }

    private static User userNamed(String username) {
        return [SELECT Id FROM User WHERE Username = :username LIMIT 1];
    }

    /** A submission owned by the test's own (admin) context, shared with nobody. */
    private static Id unsharedSubmission() {
        Form__c form = new Form__c(
            Name = 'Access test',
            Form_Type__c = 'Freeform'
        );
        insert form;
        Form_Version__c version = new Form_Version__c(
            Form__c = form.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = JSON.serialize(
                new Map<String, Object>{
                    'specVersion' => 1,
                    'form' => new Map<String, Object>{ 'type' => 'freeform' },
                    'pages' => new List<Object>()
                }
            )
        );
        insert version;
        Form_Submission__c sub = new Form_Submission__c(
            Form__c = form.Id,
            Form_Version__c = version.Id,
            Submitted_Date__c = Datetime.now()
        );
        insert sub;
        return sub.Id;
    }

    @IsTest
    static void theReaderSetAloneSeesNothing() {
        Id submissionId = unsharedSubmission();
        Boolean refused = false;

        System.runAs(userNamed(READER)) {
            try {
                FinalSubmissionController.getSubmission(submissionId);
            } catch (Exception e) {
                refused = true;
            }
        }

        Assert.isTrue(
            refused,
            'a submission shared with nobody is not readable just because ' +
            'someone holds the Reader set'
        );
    }

    @IsTest
    static void theReaderSetSeesWhatIsSharedWithIt() {
        Id submissionId = unsharedSubmission();
        User reader = userNamed(READER);
        insert new Form_Submission__Share(
            ParentId = submissionId,
            UserOrGroupId = reader.Id,
            AccessLevel = 'Read',
            RowCause = Schema.Form_Submission__Share.RowCause.Manual
        );

        Map<String, Object> data;
        System.runAs(reader) {
            data = FinalSubmissionController.getSubmission(submissionId);
        }

        Assert.areEqual(
            'Access test',
            data.get('formName'),
            'sharing is what opens it, exactly as a Private object should'
        );
    }

    @IsTest
    static void theAdminSetSeesEverySubmission() {
        Id submissionId = unsharedSubmission();

        Map<String, Object> data;
        System.runAs(userNamed(VIEWALL)) {
            data = FinalSubmissionController.getSubmission(submissionId);
        }

        Assert.areEqual(
            'Access test',
            data.get('formName'),
            'View All is what this set is for, and it still works'
        );
    }
}
