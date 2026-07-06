/**
 * FinalAssetController — config-image storage for the rebuild (catalog §6 imageUploader).
 *
 * The proven FormAssetController contract, rebuilt under the final* namespace:
 * images live as Salesforce Files (ContentVersion) linked to the parent Form so
 * they travel with it and clean up with it. Public exposure is DERIVED from the
 * form's Allowed_Adapters__c (Public_Guest → public ContentDistribution link;
 * otherwise an authenticated shepherd URL). Only url + contentVersionId are
 * stored in Spec_JSON__c — never base64.
 *
 * Hardening over legacy: the data-URL prefix is REQUIRED (no unvalidated raw
 * base64), file names are sanitized, and an image extension is guaranteed on
 * PathOnClient so file previews resolve.
 */
public with sharing class FinalAssetController {
    private static final Map<String, String> ALLOWED_MIME = new Map<String, String>{
        'image/png' => 'png',
        'image/jpeg' => 'jpg',
        'image/jpg' => 'jpg',
        'image/gif' => 'gif',
        'image/webp' => 'webp'
    };

    @TestVisible
    private static Integer maxBytes = 5 * 1024 * 1024; // 5 MB

    public class ImageResult {
        @AuraEnabled
        public String url;
        @AuraEnabled
        public String contentVersionId;
        @AuraEnabled
        public Boolean isPublic;
    }

    @AuraEnabled
    public static ImageResult uploadImage(
        String base64Data,
        String fileName,
        Id formId
    ) {
        if (String.isBlank(base64Data) || !base64Data.startsWith('data:')) {
            throw new AuraHandledException(
                'No image data provided. Expected a data URL.'
            );
        }

        Integer semi = base64Data.indexOf(';');
        Integer comma = base64Data.indexOf(',');
        if (semi <= 5 || comma <= semi) {
            throw new AuraHandledException('Malformed image data URL.');
        }
        String mime = base64Data.substring(5, semi).toLowerCase();
        if (!ALLOWED_MIME.containsKey(mime)) {
            throw new AuraHandledException(
                'Unsupported image type. Use PNG, JPG, GIF, or WebP.'
            );
        }

        Blob fileBlob = EncodingUtil.base64Decode(
            base64Data.substring(comma + 1)
        );
        if (fileBlob.size() > maxBytes) {
            throw new AuraHandledException(
                'Image exceeds the ' + (maxBytes / (1024 * 1024)) + ' MB limit.'
            );
        }

        Boolean wantPublic = isFormPublic(formId);
        String safeName = sanitizeName(fileName, ALLOWED_MIME.get(mime));

        Savepoint sp = Database.setSavepoint();
        try {
            ContentVersion cv = new ContentVersion();
            cv.Title = safeName;
            cv.PathOnClient = safeName;
            cv.VersionData = fileBlob;
            cv.IsMajorVersion = true;
            insert as user cv;

            cv = [
                SELECT Id, ContentDocumentId
                FROM ContentVersion
                WHERE Id = :cv.Id
                WITH USER_MODE
                LIMIT 1
            ];

            if (formId != null) {
                ContentDocumentLink link = new ContentDocumentLink();
                link.ContentDocumentId = cv.ContentDocumentId;
                link.LinkedEntityId = formId;
                link.ShareType = 'V';
                link.Visibility = 'AllUsers';
                insert as user link;
            }

            ImageResult res = new ImageResult();
            res.contentVersionId = cv.Id;
            res.isPublic = wantPublic;

            if (wantPublic) {
                ContentDistribution cd = new ContentDistribution();
                cd.Name = safeName;
                cd.ContentVersionId = cv.Id;
                cd.PreferencesAllowViewInBrowser = true;
                cd.PreferencesAllowOriginalDownload = true;
                cd.PreferencesPasswordRequired = false;
                cd.PreferencesNotifyOnVisit = false;
                insert as user cd;

                cd = [
                    SELECT Id, ContentDownloadUrl
                    FROM ContentDistribution
                    WHERE Id = :cd.Id
                    WITH USER_MODE
                    LIMIT 1
                ];
                res.url = cd.ContentDownloadUrl;
            } else {
                res.url =
                    '/sfc/servlet.shepherd/version/download/' + cv.Id;
            }
            return res;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(
                'Error uploading image: ' + e.getMessage()
            );
        }
    }

    /**
     * Deletes a replaced/removed image. Deleting the ContentDocument cascades
     * the version and any ContentDistribution. Non-fatal by design — orphan
     * cleanup must never block the user's edit.
     */
    @AuraEnabled
    public static void deleteImage(Id contentVersionId) {
        if (contentVersionId == null) {
            return;
        }
        try {
            List<ContentVersion> versions = [
                SELECT ContentDocumentId
                FROM ContentVersion
                WHERE Id = :contentVersionId
                WITH USER_MODE
                LIMIT 1
            ];
            if (versions.isEmpty()) {
                return;
            }
            delete as user new ContentDocument(
                Id = versions[0].ContentDocumentId
            );
        } catch (Exception e) {
            System.debug(
                LoggingLevel.WARN,
                'FinalAssetController.deleteImage failed: ' + e.getMessage()
            );
        }
    }

    private static Boolean isFormPublic(Id formId) {
        if (formId == null) {
            return false;
        }
        List<Form__c> forms = [
            SELECT Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :formId
            WITH USER_MODE
            LIMIT 1
        ];
        return !forms.isEmpty() &&
            String.isNotBlank(forms[0].Allowed_Adapters__c) &&
            forms[0].Allowed_Adapters__c.contains('Public_Guest');
    }

    private static String sanitizeName(String fileName, String ext) {
        String base = String.isBlank(fileName)
            ? 'form-image'
            : fileName.replaceAll('[\\\\/:*?"<>|]', '-').trim();
        if (String.isBlank(base)) {
            base = 'form-image';
        }
        if (!base.toLowerCase().endsWith('.' + ext) &&
            !(ext == 'jpg' && base.toLowerCase().endsWith('.jpeg'))) {
            base += '.' + ext;
        }
        return base;
    }
}
