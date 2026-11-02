/**
 * FinalGuestController.getGuestPdfImages (IMPL_PLAN_FORM_PDF §5): the guest
 * names nothing, the spec decides, and only when the author opted in.
 */
@IsTest
private class FinalGuestPdfTest {
    private static final String PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    private static Id png(String name) {
        ContentVersion cv = new ContentVersion(
            Title = name,
            PathOnClient = name + '.png',
            VersionData = EncodingUtil.base64Decode(PNG_B64)
        );
        insert cv;
        return cv.Id;
    }

    private static Form__c form(String status, String specJson) {
        Form__c f = new Form__c(
            Name = 'Guest PDF test',
            Primary_Context_Object__c = 'Contact',
            Status__c = status,
            Allowed_Adapters__c = 'Public_Guest',
            Layout_Config__c = '{}',
            Schema_Snapshot__c = '{}'
        );
        insert f;
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = specJson
        );
        return f;
    }

    private static String spec(Id logo, Boolean downloadCopy, Boolean closed) {
        return '{"specVersion":1,"form":{"name":"T"},' +
            '"settings":{"completion":{"downloadCopy":' +
            downloadCopy +
            '}' +
            (closed ? ',"availability":{"status":"closed"}' : '') +
            '},"header":{"logo":{"url":"/l","versionId":"' +
            logo +
            '"}},' +
            '"pages":[]}';
    }

    @IsTest
    static void servesOnlyTheSpecsImages() {
        Id logo = png('logo');
        Id other = png('someone-elses-file');
        Form__c f = form('Published', spec(logo, true, false));
        Test.startTest();
        FinalPdfImageService.Result r = FinalGuestController.getGuestPdfImages(
            f.Id
        );
        Test.stopTest();
        Assert.areEqual(1, r.images.size(), 'exactly the logo');
        Assert.areEqual(String.valueOf(logo), r.images[0].id, 'the logo');
        for (FinalPdfImageService.ImageData d : r.images) {
            Assert.areNotEqual(String.valueOf(other), d.id, 'no other file');
        }
    }

    @IsTest
    static void refusedUnlessTheAuthorOptedIn() {
        Form__c f = form('Published', spec(png('logo'), false, false));
        try {
            FinalGuestController.getGuestPdfImages(f.Id);
            Assert.fail('should refuse');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'download copy is off');
        }
    }

    @IsTest
    static void closedFormKeepsTheAvailabilityGate() {
        // PLAN_DOCUMENTS_AND_PAYMENTS: availability gates stay until a
        // receipt-download policy exists; the browser builds the PDF
        // without images instead.
        Form__c f = form('Published', spec(png('logo'), true, true));
        try {
            FinalGuestController.getGuestPdfImages(f.Id);
            Assert.fail('should refuse');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'closed form refused');
        }
    }

    @IsTest
    static void downloadSettingsSurviveTheGuestProjection() {
        Form__c f = form('Published', spec(png('logo'), true, false));
        Map<String, Object> res = FinalGuestController.getGuestRuntimeSpec(
            f.Id
        );
        String json = JSON.serialize(res.get('spec'));
        Assert.isTrue(
            json.contains('"downloadCopy":true'),
            'the viewer must see the author switch'
        );
    }

    @IsTest
    static void gateStillApplies() {
        Form__c f = form('Draft', spec(png('logo'), true, false));
        try {
            FinalGuestController.getGuestPdfImages(f.Id);
            Assert.fail('should refuse');
        } catch (AuraHandledException e) {
            Assert.isTrue(true, 'unpublished form refused');
        }
    }
}
