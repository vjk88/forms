/** Isolated data factory for upload tests; no existing org records or large Blobs. */
@IsTest
public with sharing class FinalUploadTestData {
    public static Form_Version__c published(Boolean required) {
        FinalGuestTicketTestUtil.ensureKeys(); // upload tokens are signed with these
        insert new Final_Settings__c(Name = 'org', Uploads_Enabled__c = true);
        Form__c f = new Form__c(
            Name = 'Upload test',
            Status__c = 'Published',
            Is_Public__c = true,
            Primary_Context_Object__c = 'Contact'
        );
        insert f;
        Map<String, Object> spec = new Map<String, Object>{
            'specVersion' => 1,
            'form' => new Map<String, Object>{
                'type' => 'form',
                'targetObject' => 'Contact'
            },
            'settings' => new Map<String, Object>{
                'uploads' => new Map<String, Object>{
                    'transport' => 'stagedV1'
                }
            },
            'pages' => new List<Object>{
                new Map<String, Object>{
                    'id' => 'pg',
                    'sections' => new List<Object>{
                        new Map<String, Object>{
                            'id' => 'sec',
                            'elements' => new List<Object>{
                                new Map<String, Object>{
                                    'id' => 'name',
                                    'type' => 'field',
                                    'binding' => new Map<String, Object>{
                                        'object' => 'Contact',
                                        'field' => 'LastName'
                                    }
                                },
                                new Map<String, Object>{
                                    'id' => 'docs',
                                    'type' => 'file',
                                    'label' => 'Documents',
                                    'config' => new Map<String, Object>{
                                        'multiple' => true,
                                        'accept' => '.pdf,.txt'
                                    },
                                    'validation' => required
                                        ? new List<Object>{
                                              new Map<String, Object>{
                                                  'type' => 'required'
                                              }
                                          }
                                        : new List<Object>()
                                }
                            }
                        }
                    }
                }
            }
        };
        Form_Version__c v = new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1
        );
        FinalSpecStore.write(v, JSON.serialize(spec));
        insert v;
        return v;
    }
    public static Map<String, Object> call(Map<String, Object> operation) {
        return FinalUploadController.uploadRequest(JSON.serialize(operation));
    }
    public static String attempt(Form_Version__c v) {
        return (String) call(
                new Map<String, Object>{
                    'action' => 'create',
                    'formId' => v.Form__c,
                    'versionId' => v.Id
                }
            )
            .get('sessionToken');
    }
    public static Map<String, Object> reserve(String token) {
        return call(
            new Map<String, Object>{
                'action' => 'reserve',
                'sessionToken' => token,
                'elementId' => 'docs'
            }
        );
    }
    /** Server keys of the session's READY files, in arrival order. */
    public static List<String> keys(String token) {
        return keys(token, false);
    }
    /** As keys(token), asking the endpoint for the session's host. */
    public static List<String> keys(String token, Boolean publicHost) {
        List<String> result = new List<String>();
        String request = JSON.serialize(
            new Map<String, Object>{
                'action' => 'status',
                'sessionToken' => token
            }
        );
        Map<String, Object> status = publicHost
            ? FinalGuestController.uploadRequest(request)
            : FinalUploadController.uploadRequest(request);
        for (Object value : (List<Object>) status.get('files')) {
            Map<String, Object> f = (Map<String, Object>) value;
            if (f.get('state') == 'READY') {
                result.add((String) f.get('key'));
            }
        }
        return result;
    }
    public static Map<String, Object> remove(String token, String fileKey) {
        return call(
            new Map<String, Object>{
                'action' => 'remove',
                'sessionToken' => token,
                'fileKey' => fileKey
            }
        );
    }
    /** Remove the session's first READY file. */
    public static Map<String, Object> removeFirst(String token) {
        return remove(token, keys(token)[0]);
    }
    /** Insert without throwing; for refusal tests. */
    public static Database.SaveResult tryUpload(String marker, String name) {
        return Database.insert(
            new ContentVersion(
                Title = name,
                PathOnClient = name,
                VersionData = Blob.valueOf('sample'),
                Final_Upload_fileupload__c = marker
            ),
            false
        );
    }
    /** The token with one character of its signature changed. */
    public static String tamper(String token) {
        Integer at = token.length() - 5;
        String c = token.substring(at, at + 1);
        return token.left(at) +
            (c == 'A' ? 'B' : 'A') +
            token.substring(at + 1);
    }
    public static ContentVersion upload(String marker, String name) {
        ContentVersion v = new ContentVersion(
            Title = name,
            PathOnClient = name,
            VersionData = Blob.valueOf('sample'),
            Final_Upload_fileupload__c = marker
        );
        insert v;
        return v;
    }
    /**
     * A submit payload. With any tags passed, it references every file that
     * arrived for this session (by server key), as the browser does; with
     * none, it references no files.
     */
    public static Map<String, Object> payload(
        Form_Version__c v,
        String token,
        List<Map<String, Object>> tags
    ) {
        return payload(v, token, tags, false);
    }
    public static Map<String, Object> payload(
        Form_Version__c v,
        String token,
        List<Map<String, Object>> tags,
        Boolean publicHost
    ) {
        List<Object> refs = new List<Object>();
        if (!tags.isEmpty()) {
            for (String key : keys(token, publicHost)) {
                refs.add(
                    new Map<String, Object>{
                        'elementId' => 'docs',
                        'fileKey' => key
                    }
                );
            }
        }
        return new Map<String, Object>{
            'answers' => new Map<String, Object>{
                'name' => 'Upload respondent'
            },
            'fileRefs' => refs,
            'meta' => new Map<String, Object>{
                'specVersionId' => v.Id,
                'uploadSessionToken' => token,
                'submissionKey' => 'stable-upload-key'
            }
        };
    }
}
