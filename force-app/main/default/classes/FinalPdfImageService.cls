/**
 * FinalPdfImageService — hands image files to the browser's PDF builder as
 * base64 (IMPL_PLAN_FORM_PDF §5).
 *
 * Why the server is involved at all: a form's logo, banner and image blocks
 * are Salesforce Files. Their addresses live on a different domain from the
 * page (file.force.com, or a public ContentDistribution link), so the browser
 * may SHOW them but cannot READ their bytes, and a PDF needs the bytes.
 *
 * This class only reads; it never decides WHICH files a caller may have.
 * The callers do:
 *   - FinalPdfController (signed-in users) passes the ids the browser asked
 *     for and reads them in USER MODE: nobody gets a file they can't open.
 *   - FinalGuestController (guests) passes only ids the gated, active,
 *     published spec references, and reads them in SYSTEM MODE.
 *
 * Caps keep a response inside the heap: images only, at most MAX_FILES, each
 * at most MAX_FILE_BYTES, all together at most MAX_TOTAL_BYTES. A file over
 * a cap is reported as skipped; the PDF is built without it.
 */
public inherited sharing class FinalPdfImageService {
    @TestVisible
    static Integer maxFiles = 12;
    @TestVisible
    static Integer maxFileBytes = 2 * 1024 * 1024;
    @TestVisible
    static Integer maxTotalBytes = 3 * 1024 * 1024;

    private static final Map<String, String> MIME = new Map<String, String>{
        'PNG' => 'image/png',
        'JPG' => 'image/jpeg',
        'JPEG' => 'image/jpeg',
        'GIF' => 'image/gif',
        'WEBP' => 'image/webp'
    };

    public class ImageData {
        @AuraEnabled
        public String id;
        @AuraEnabled
        public String mimeType;
        @AuraEnabled
        public String base64;
    }

    public class Result {
        @AuraEnabled
        public List<ImageData> images = new List<ImageData>();
        /** ids left out: not an image, too large, over the total, or unreadable */
        @AuraEnabled
        public List<String> skipped = new List<String>();
    }

    /**
     * @param ids      ContentVersion ids, already allowed by the caller
     * @param userMode true = read with the running user's access
     */
    public static Result read(Set<Id> ids, Boolean userMode) {
        Result out = new Result();
        Set<Id> wanted = new Set<Id>();
        for (Id i : ids == null ? new Set<Id>() : ids) {
            if (
                i != null &&
                i.getSObjectType() == ContentVersion.SObjectType &&
                wanted.size() < maxFiles
            ) {
                wanted.add(i);
            } else if (i != null) {
                out.skipped.add(String.valueOf(i));
            }
        }
        if (wanted.isEmpty()) {
            return out;
        }
        // Size and type first, WITHOUT the blob, so an oversized file is
        // never loaded into the heap at all.
        List<ContentVersion> heads = userMode
            ? [
                  SELECT Id, FileType, ContentSize
                  FROM ContentVersion
                  WHERE Id IN :wanted
                  WITH USER_MODE
              ]
            : [
                  SELECT Id, FileType, ContentSize
                  FROM ContentVersion
                  WHERE Id IN :wanted
                  WITH SYSTEM_MODE
              ];
        Set<Id> load = new Set<Id>();
        Integer total = 0;
        Set<Id> found = new Set<Id>();
        for (ContentVersion cv : heads) {
            found.add(cv.Id);
            String type = cv.FileType == null ? '' : cv.FileType.toUpperCase();
            Integer size = cv.ContentSize == null ? 0 : cv.ContentSize;
            if (
                !MIME.containsKey(type) ||
                size > maxFileBytes ||
                total + size > maxTotalBytes
            ) {
                out.skipped.add(String.valueOf(cv.Id));
                continue;
            }
            total += size;
            load.add(cv.Id);
        }
        for (Id i : wanted) {
            if (!found.contains(i)) {
                out.skipped.add(String.valueOf(i));
            }
        }
        if (load.isEmpty()) {
            return out;
        }
        List<ContentVersion> blobs = userMode
            ? [
                  SELECT Id, FileType, VersionData
                  FROM ContentVersion
                  WHERE Id IN :load
                  WITH USER_MODE
              ]
            : [
                  SELECT Id, FileType, VersionData
                  FROM ContentVersion
                  WHERE Id IN :load
                  WITH SYSTEM_MODE
              ];
        for (ContentVersion cv : blobs) {
            ImageData d = new ImageData();
            d.id = String.valueOf(cv.Id);
            d.mimeType = MIME.get(cv.FileType.toUpperCase());
            d.base64 = EncodingUtil.base64Encode(cv.VersionData);
            out.images.add(d);
        }
        return out;
    }

    /**
     * Every ContentVersion id a spec references for display: the header's
     * logo and banner, image blocks, and any other node carrying a
     * `versionId` / `contentVersionId` (the two keys the builders write).
     */
    public static Set<Id> referencedIds(Object node) {
        Set<Id> out = new Set<Id>();
        collect(node, out);
        return out;
    }

    private static void collect(Object node, Set<Id> out) {
        if (node instanceof Map<String, Object>) {
            Map<String, Object> m = (Map<String, Object>) node;
            for (
                String key : new List<String>{ 'versionId', 'contentVersionId' }
            ) {
                Object v = m.get(key);
                if (v instanceof String && ((String) v).startsWith('068')) {
                    try {
                        out.add((Id) (String) v);
                    } catch (Exception ignored) {
                        // not an id: nothing to serve
                    }
                }
            }
            for (Object v : m.values()) {
                collect(v, out);
            }
        } else if (node instanceof List<Object>) {
            for (Object v : (List<Object>) node) {
                collect(v, out);
            }
        }
    }
}
