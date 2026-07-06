@IsTest
private class FinalAssetControllerTest {
    // 1x1 transparent PNG
    private static final String PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    private static final String PNG_DATA_URL = 'data:image/png;base64,' + PNG_B64;

    @TestSetup
    static void setup() {
        insert new List<Form__c>{
            new Form__c(
                Name = 'Private Form',
                Primary_Context_Object__c = 'Contact'
            ),
            new Form__c(
                Name = 'Public Form',
                Primary_Context_Object__c = 'Contact',
                Allowed_Adapters__c = 'Public_Guest'
            )
        };
    }

    private static Id formId(String name) {
        return [SELECT Id FROM Form__c WHERE Name = :name LIMIT 1].Id;
    }

    @IsTest
    static void uploadPrivateFormLinksFileAndStaysInternal() {
        Id fid = formId('Private Form');

        Test.startTest();
        FinalAssetController.ImageResult res = FinalAssetController.uploadImage(
            PNG_DATA_URL,
            'logo.png',
            fid
        );
        Test.stopTest();

        System.assertEquals(false, res.isPublic, 'Private form stays internal');
        System.assert(
            res.url.contains('/sfc/servlet.shepherd/version/download/'),
            'Internal URL is the authenticated shepherd path: ' + res.url
        );
        ContentVersion cv = [
            SELECT ContentDocumentId, PathOnClient
            FROM ContentVersion
            WHERE Id = :res.contentVersionId
        ];
        System.assertEquals('logo.png', cv.PathOnClient);
        List<ContentDocumentLink> links = [
            SELECT Id
            FROM ContentDocumentLink
            WHERE
                ContentDocumentId = :cv.ContentDocumentId
                AND LinkedEntityId = :fid
        ];
        System.assertEquals(1, links.size(), 'File is linked to the form');
        System.assertEquals(
            0,
            [
                SELECT COUNT()
                FROM ContentDistribution
                WHERE ContentVersionId = :res.contentVersionId
            ],
            'No public link for a private form'
        );
    }

    @IsTest
    static void uploadPublicFormMintsPublicLink() {
        Id fid = formId('Public Form');

        Test.startTest();
        FinalAssetController.ImageResult res = FinalAssetController.uploadImage(
            PNG_DATA_URL,
            'hero',
            fid
        );
        Test.stopTest();

        System.assertEquals(true, res.isPublic);
        System.assert(String.isNotBlank(res.url), 'Public URL returned');
        System.assertEquals(
            1,
            [
                SELECT COUNT()
                FROM ContentDistribution
                WHERE ContentVersionId = :res.contentVersionId
            ],
            'Public form gets a ContentDistribution'
        );
        // extension guaranteed when the client omitted it
        System.assertEquals(
            'hero.png',
            [
                SELECT PathOnClient
                FROM ContentVersion
                WHERE Id = :res.contentVersionId
            ]
            .PathOnClient
        );
    }

    @IsTest
    static void rejectsRawBase64WithoutDataUrlPrefix() {
        try {
            FinalAssetController.uploadImage(PNG_B64, 'x.png', null);
            System.assert(false, 'Expected exception');
        } catch (AuraHandledException e) {
            System.assert(true, 'Raw base64 without prefix rejected');
        }
    }

    @IsTest
    static void rejectsDisallowedMime() {
        try {
            FinalAssetController.uploadImage(
                'data:text/html;base64,' + PNG_B64,
                'evil.html',
                null
            );
            System.assert(false, 'Expected exception');
        } catch (AuraHandledException e) {
            System.assert(true, 'Non-image MIME rejected');
        }
    }

    @IsTest
    static void rejectsOversizeImage() {
        FinalAssetController.maxBytes = 10;
        try {
            FinalAssetController.uploadImage(PNG_DATA_URL, 'big.png', null);
            System.assert(false, 'Expected exception');
        } catch (AuraHandledException e) {
            System.assert(true, 'Oversize image rejected');
        }
    }

    @IsTest
    static void deleteImageCascadesDocument() {
        FinalAssetController.ImageResult res = FinalAssetController.uploadImage(
            PNG_DATA_URL,
            'gone.png',
            formId('Private Form')
        );

        Test.startTest();
        FinalAssetController.deleteImage(res.contentVersionId);
        Test.stopTest();

        System.assertEquals(
            0,
            [
                SELECT COUNT()
                FROM ContentVersion
                WHERE Id = :res.contentVersionId
            ],
            'Version deleted via document cascade'
        );
    }

    @IsTest
    static void deleteImageNullAndMissingAreNoOps() {
        FinalAssetController.deleteImage(null);
        // a made-up (deleted) version id — must not throw
        FinalAssetController.ImageResult res = FinalAssetController.uploadImage(
            PNG_DATA_URL,
            'temp.png',
            null
        );
        FinalAssetController.deleteImage(res.contentVersionId);
        FinalAssetController.deleteImage(res.contentVersionId);
        System.assert(true, 'No exception on null/already-deleted');
    }

    @IsTest
    static void sanitizesHostileFileName() {
        FinalAssetController.ImageResult res = FinalAssetController.uploadImage(
            PNG_DATA_URL,
            'a/b\\c:d*e.png',
            null
        );
        String path = [
            SELECT PathOnClient
            FROM ContentVersion
            WHERE Id = :res.contentVersionId
        ]
        .PathOnClient;
        System.assert(
            !path.contains('/') && !path.contains('\\') && !path.contains(':'),
            'Separators stripped: ' + path
        );
    }
}
