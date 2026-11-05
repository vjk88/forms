@IsTest
private class FinalPdfImageServiceTest {
    // 1x1 transparent PNG
    private static final String PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    private static Id file(String name, String ext, Blob data) {
        ContentVersion cv = new ContentVersion(
            Title = name,
            PathOnClient = name + '.' + ext,
            VersionData = data
        );
        insert cv;
        return cv.Id;
    }

    private static Id png(String name) {
        return file(name, 'png', EncodingUtil.base64Decode(PNG_B64));
    }

    @IsTest
    static void readsImagesAsBase64() {
        Id a = png('logo');
        FinalPdfImageService.Result r = FinalPdfImageService.read(
            new Set<Id>{ a },
            true
        );
        Assert.areEqual(1, r.images.size(), 'one image back');
        Assert.areEqual(
            'image/png',
            r.images[0].mimeType,
            'mime from FileType'
        );
        Assert.areEqual(PNG_B64, r.images[0].base64, 'bytes round-trip');
        Assert.areEqual(0, r.skipped.size(), 'nothing skipped');
    }

    @IsTest
    static void skipsNonImagesAndUnknownIds() {
        Id txt = file('notes', 'txt', Blob.valueOf('hello'));
        Id ghost =
            ContentVersion.SObjectType.getDescribe().getKeyPrefix() +
            '000000000000AAA';
        FinalPdfImageService.Result r = FinalPdfImageService.read(
            new Set<Id>{ txt, ghost },
            false
        );
        Assert.areEqual(0, r.images.size(), 'no images');
        Assert.isTrue(r.skipped.contains(String.valueOf(txt)), 'text skipped');
        Assert.isTrue(
            r.skipped.contains(String.valueOf(ghost)),
            'ghost skipped'
        );
    }

    @IsTest
    static void enforcesSizeCaps() {
        Id a = png('a');
        Id b = png('b');
        FinalPdfImageService.maxTotalBytes = 1; // nothing fits
        FinalPdfImageService.Result r = FinalPdfImageService.read(
            new Set<Id>{ a, b },
            true
        );
        Assert.areEqual(0, r.images.size(), 'over the total cap');
        Assert.areEqual(2, r.skipped.size(), 'both reported');
    }

    @IsTest
    static void refusesIdsOfOtherObjects() {
        // A User Id: needs no DML, so org validation rules can't interfere.
        FinalPdfImageService.Result r = FinalPdfImageService.read(
            new Set<Id>{ UserInfo.getUserId() },
            false
        );
        Assert.areEqual(0, r.images.size(), 'only ContentVersion ids');
        Assert.areEqual(1, r.skipped.size(), 'reported as skipped');
    }

    @IsTest
    static void collectsReferencedIdsFromBothKeys() {
        Id a = png('a');
        Id b = png('b');
        Map<String, Object> spec = (Map<String, Object>) JSON.deserializeUntyped(
            '{"header":{"logo":{"url":"/x","versionId":"' +
                a +
                '"}},' +
                '"pages":[{"sections":[{"elements":[{"type":"image","config":{"src":"/y","contentVersionId":"' +
                b +
                '"}},{"type":"field","config":{"versionId":"not-an-id"}}]}]}]}'
        );
        Set<Id> ids = FinalPdfImageService.referencedIds(spec);
        Assert.areEqual(new Set<Id>{ a, b }, ids, 'both keys, junk ignored');
    }
}
