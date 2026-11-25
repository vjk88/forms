/** Authenticated upload endpoint; public hosts use the existing guest controller surface. */
public with sharing class FinalUploadController {
    @AuraEnabled
    public static Map<String, Object> uploadRequest(String requestJson) {
        if (UserInfo.getUserType() == 'Guest') {
            throw FinalUploadService.refuse(null);
        }
        return FinalUploadService.handle(requestJson, false);
    }
}
