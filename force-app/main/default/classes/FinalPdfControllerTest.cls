@IsTest
private class FinalPdfControllerTest {
    private static final String PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    @IsTest
    static void returnsImagesTheUserCanRead() {
        ContentVersion cv = new ContentVersion(
            Title = 'logo',
            PathOnClient = 'logo.png',
            VersionData = EncodingUtil.base64Decode(PNG_B64)
        );
        insert cv;
        Test.startTest();
        FinalPdfImageService.Result r = FinalPdfController.getImages(
            new List<Id>{ cv.Id }
        );
        Test.stopTest();
        Assert.areEqual(1, r.images.size(), 'own file comes back');
    }

    @IsTest
    static void nullListIsEmpty() {
        FinalPdfImageService.Result r = FinalPdfController.getImages(null);
        Assert.areEqual(0, r.images.size(), 'nothing asked, nothing back');
    }
}
