/**
 * Handles form-config image uploads (logo / background).
 *
 * Images are stored as Salesforce Files (ContentVersion) linked to the parent
 * Form so they travel with it and can be cleaned up. Whether an image is
 * exposed publicly is DERIVED from the form's Allowed_Adapters__c — public
 * forms (Public_Guest) get a public ContentDistribution link so guests can
 * render them; internal-only forms keep the file private. Only the resulting
 * URL (plus the ContentVersion Id for lifecycle management) is stored in the
 * form layout JSON — never base64.
 */
public with sharing class FormAssetController {
  private static final Set<String> ALLOWED_MIME = new Set<String>{
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp'
  };
  private static final Integer MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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
    if (String.isBlank(base64Data)) {
      throw new AuraHandledException('No image data provided.');
    }

    // Parse the data-URL prefix ("data:image/png;base64,....") to validate MIME
    String mime = '';
    String cleaned = base64Data;
    if (base64Data.startsWith('data:')) {
      Integer comma = base64Data.indexOf(',');
      Integer semi = base64Data.indexOf(';');
      if (semi > 5) {
        mime = base64Data.substring(5, semi).toLowerCase();
      }
      if (comma > -1) {
        cleaned = base64Data.substring(comma + 1);
      }
    }
    if (String.isNotBlank(mime) && !ALLOWED_MIME.contains(mime)) {
      throw new AuraHandledException(
        'Unsupported image type. Use PNG, JPG, GIF, or WebP.'
      );
    }

    Blob fileBlob = EncodingUtil.base64Decode(cleaned);
    if (fileBlob.size() > MAX_BYTES) {
      throw new AuraHandledException('Image exceeds the 5 MB limit.');
    }

    Boolean wantPublic = isFormPublic(formId);
    String safeName = String.isBlank(fileName) ? 'form-image' : fileName;

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

      // Link the file to the parent Form so it travels with it / cleans up
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
        // Public form → mint a public distribution so guests can render it
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
        // Internal-only → authenticated file URL (no public exposure)
        res.url = '/sfc/servlet.shepherd/version/download/' + cv.Id;
      }

      return res;
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException('Error uploading image: ' + e.getMessage());
    }
  }

  /**
   * Deletes an uploaded image (and its public link, if any) when it is
   * replaced or removed. Deleting the ContentDocument cascades the version
   * and any ContentDistribution.
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
      ContentDocument doc = new ContentDocument(
        Id = versions[0].ContentDocumentId
      );
      delete as user doc;
    } catch (Exception e) {
      // Non-fatal — orphan cleanup shouldn't block the user's edit
      System.debug('deleteImage failed: ' + e.getMessage());
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
    if (forms.isEmpty() || String.isBlank(forms[0].Allowed_Adapters__c)) {
      return false;
    }
    return forms[0].Allowed_Adapters__c.contains('Public_Guest');
  }
}
