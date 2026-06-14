public with sharing class Z_FormAssetController {
  private static final Set<String> ALLOWED_MIME = new Set<String>{
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp'
  };
  private static final Integer MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  public class ImageResult {
    @AuraEnabled public String url;
    @AuraEnabled public String contentVersionId;
    @AuraEnabled public Boolean isPublic;
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
      res.isPublic = false;
      res.url = '/sfc/servlet.shepherd/version/download/' + cv.Id;

      return res;
    } catch (Exception e) {
      Database.rollback(sp);
      throw new AuraHandledException('Error uploading image: ' + e.getMessage());
    }
  }

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
      System.debug('deleteImage failed: ' + e.getMessage());
    }
  }
}
