@IsTest
private class FinalThemeDeleteGuardTest {
    private static Theme_Definition__c theme(String name) {
        Theme_Definition__c t = new Theme_Definition__c(
            Name = name,
            Theme_JSON__c = '{"accent":"#112233"}'
        );
        insert t;
        return t;
    }

    private static String specUsing(Id themeId) {
        return '{"specVersion":1,"theme":{"source":"custom","name":"' +
            themeId +
            '"}}';
    }

    private static String plainSpec() {
        return '{"specVersion":1,"theme":{"source":"preset","name":"x"}}';
    }

    private static Form__c form(String name, String status) {
        Form__c f = new Form__c(
            Name = name,
            Primary_Context_Object__c = 'Contact'
        );
        if (status != null) {
            f.Status__c = status;
        }
        insert f;
        return f;
    }

    private static Form_Version__c version(
        Form__c f,
        Integer num,
        Boolean active,
        String spec
    ) {
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = num,
            Is_Active__c = active,
            Engine_Version__c = 1,
            Spec_JSON__c = spec
        );
        insert v;
        return v;
    }

    @IsTest
    static void draftReferenceBlocksDelete() {
        Theme_Definition__c t = theme('T');
        Form__c f = form('Draft Form', null);
        version(f, 1, true, plainSpec());
        version(f, 2, false, specUsing(t.Id));
        Database.DeleteResult r = Database.delete(t, false);
        Assert.isFalse(r.isSuccess());
        Assert.areEqual(
            'This theme is used by 1 form: Draft Form. Switch it to another theme first.',
            r.getErrors()[0].getMessage()
        );
    }

    @IsTest
    static void activeOnlyReferenceBlocksDelete() {
        Theme_Definition__c t = theme('T');
        Form__c f = form('Active Form', null);
        version(f, 1, true, specUsing(t.Id));
        Database.DeleteResult r = Database.delete(t, false);
        Assert.isFalse(r.isSuccess());
        Assert.isTrue(r.getErrors()[0].getMessage().contains('Active Form'));
    }

    @IsTest
    static void oldHistoryVersionDoesNotBlock() {
        Theme_Definition__c t = theme('T');
        Form__c f = form('History Form', null);
        version(f, 1, false, specUsing(t.Id)); // old history
        version(f, 2, true, plainSpec());
        Database.DeleteResult r = Database.delete(t, false);
        Assert.isTrue(r.isSuccess());
    }

    @IsTest
    static void archivedFormDoesNotBlock() {
        Theme_Definition__c t = theme('T');
        Form__c f = form('Old Form', 'Archived');
        version(f, 1, true, specUsing(t.Id));
        Database.DeleteResult r = Database.delete(t, false);
        Assert.isTrue(r.isSuccess());
    }

    @IsTest
    static void unusedThemeDeletes() {
        Theme_Definition__c t = theme('T');
        Form__c f = form('Other Form', null);
        version(f, 1, true, plainSpec());
        Database.DeleteResult r = Database.delete(t, false);
        Assert.isTrue(r.isSuccess());
        Assert.areEqual(0, [SELECT COUNT() FROM Theme_Definition__c]);
    }

    @IsTest
    static void bulkDeleteFailsOnlyTheUsedOne() {
        Theme_Definition__c used = theme('Used');
        Theme_Definition__c free = theme('Free');
        Form__c f = form('Bulk Form', null);
        version(f, 1, true, specUsing(used.Id));
        List<Database.DeleteResult> rs = Database.delete(
            new List<Theme_Definition__c>{ used, free },
            false
        );
        Assert.isFalse(rs[0].isSuccess());
        Assert.isTrue(rs[1].isSuccess());
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Theme_Definition__c WHERE Id = :used.Id]
        );
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Theme_Definition__c WHERE Id = :free.Id]
        );
    }

    @IsTest
    static void manyFormsSaysAndMore() {
        Theme_Definition__c t = theme('T');
        for (Integer i = 1; i <= 4; i++) {
            Form__c f = form('Form ' + i, null);
            version(f, 1, true, specUsing(t.Id));
        }
        Database.DeleteResult r = Database.delete(t, false);
        Assert.isFalse(r.isSuccess());
        String msg = r.getErrors()[0].getMessage();
        Assert.isTrue(msg.contains('used by 4 forms'), msg);
        Assert.isTrue(msg.contains(' and 1 more'), msg);
    }
}
