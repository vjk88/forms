/**
 * The fence (D36): system mode skips the permission check, so this list is
 * the only thing deciding what a mapping may write. Spec tests 1 and 2.
 */
@IsTest
private class FinalMappingWriterTest {
    private static FinalMappingWriter writer() {
        return new FinalMappingWriter(
            new List<Map<String, Object>>{
                FinalMappingTestData.createContact('act_a'),
                FinalMappingTestData.findOrCreateContact('act_b', 'update')
            }
        );
    }

    @IsTest
    static void anObjectNotInTheStepIsRefused() {
        // Test 1. A Form__c claiming to be step act_a's record.
        try {
            writer().insertFor('act_a', new Form__c(Name = 'Smuggled'));
            Assert.fail('a stranger must not get through');
        } catch (FinalMappingWriter.FenceException e) {
            Assert.isTrue(e.getMessage().contains('Form__c'), e.getMessage());
        }
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form__c WHERE Name = 'Smuggled']
        );
    }

    @IsTest
    static void aFieldNotInTheStepIsRefusedOnAnAllowedObject() {
        // Test 2. Contact is allowed; Title is not one of act_a's fields.
        try {
            writer()
                .insertFor(
                    'act_a',
                    new Contact(LastName = 'Ok', Title = 'Not allowed')
                );
            Assert.fail('an unlisted field must not get through');
        } catch (FinalMappingWriter.FenceException e) {
            Assert.isTrue(e.getMessage().contains('Title'), e.getMessage());
        }
    }

    @IsTest
    static void anUnknownStepIsRefused() {
        try {
            writer().insertFor('act_nope', new Contact(LastName = 'x'));
            Assert.fail('a step not in the published mapping must not write');
        } catch (FinalMappingWriter.FenceException e) {
            Assert.isTrue(e.getMessage().contains('act_nope'));
        }
    }

    @IsTest
    static void anUpdateMayOnlyTouchWriteOnMatchFields() {
        Contact existing = new Contact(
            LastName = 'Existing',
            Email = 'e@example.com'
        );
        insert existing;
        try {
            // Title has no writeOnMatch flag in the fixture.
            writer()
                .updateFor('act_b', new Contact(Id = existing.Id, Title = 'x'));
            Assert.fail('an update is limited to fields flagged writeOnMatch');
        } catch (FinalMappingWriter.FenceException e) {
            Assert.isTrue(e.getMessage().contains('Title'));
        }
    }

    @IsTest
    static void listedFieldsGoThrough() {
        Id created = writer()
            .insertFor(
                'act_a',
                new Contact(LastName = 'Allowed', Email = 'a@example.com')
            );
        Assert.areEqual(
            'Allowed',
            [SELECT LastName FROM Contact WHERE Id = :created].LastName
        );
    }
}
