/** Public-host controller journey. Actual anonymous native transport remains a browser QA check. */
@IsTest
private with sharing class FinalUploadGuestTest {
    @IsTest
    static void publicControllerLinksFilesAndReturnsNoRecordIds() {
        Form_Version__c v = FinalUploadTestData.published(false);
        Map<String, Object> opened = FinalGuestController.uploadRequest(
            JSON.serialize(
                new Map<String, Object>{
                    'action' => 'create',
                    'formId' => v.Form__c,
                    'versionId' => v.Id
                }
            )
        );
        String token = (String) opened.get('sessionToken');
        Map<String, Object> slot = FinalGuestController.uploadRequest(
            JSON.serialize(
                new Map<String, Object>{
                    'action' => 'reserve',
                    'sessionToken' => token,
                    'elementId' => 'docs'
                }
            )
        );
        FinalUploadTestData.upload(
            (String) slot.get('slotToken'),
            'public.txt'
        );
        String payload = FinalGuestTicketTestUtil.withTicket(
            v.Form__c,
            JSON.serialize(
                FinalUploadTestData.payload(
                    v,
                    token,
                    new List<Map<String, Object>>{ slot }
                )
            )
        );
        Test.startTest();
        FinalGuestController.GuestSubmitResult result = FinalGuestController.submitGuest(
            v.Form__c,
            payload
        );
        FinalGuestController.GuestSubmitResult replay = FinalGuestController.submitGuest(
            v.Form__c,
            payload
        );
        Test.stopTest();
        Assert.isTrue(result.success, 'Public-host submission succeeds');
        Assert.isTrue(
            replay.success,
            'Consumed attempt answers retry before used-ticket refusal'
        );
        Assert.isFalse(
            JSON.serialize(result).contains('recordId'),
            'Guest result discloses no record IDs'
        );
        Form_Upload__c a = [
            SELECT Result_Record_Id__c, Status__c
            FROM Form_Upload__c
            LIMIT 1
        ];
        Id target = (Id) a.Result_Record_Id__c;
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :target
            ],
            'File linked to server-created record'
        );
        Assert.areEqual(
            'AllUsers',
            [
                SELECT Visibility
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :target
                LIMIT 1
            ]
            .Visibility,
            'Guests cannot create InternalUsers links'
        );
    }
    @IsTest
    static void publicEndpointCannotUploadToPrivateForm() {
        Form_Version__c v = FinalUploadTestData.published(false);
        update new Form__c(Id = v.Form__c, Is_Public__c = false);
        Test.startTest();
        try {
            FinalGuestController.uploadRequest(
                JSON.serialize(
                    new Map<String, Object>{
                        'action' => 'create',
                        'formId' => v.Form__c,
                        'versionId' => v.Id
                    }
                )
            );
            Assert.fail('Private form accepted by public upload endpoint');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().length() > 0,
                'Safe public gate refusal'
            );
        }
        Test.stopTest();
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Form_Upload__c],
            'No upload attempt created'
        );
    }
    @IsTest
    static void guestBase64CannotBeMixedWithReceipts() {
        Form_Version__c v = FinalUploadTestData.published(false);
        String token = (String) FinalGuestController.uploadRequest(
                JSON.serialize(
                    new Map<String, Object>{
                        'action' => 'create',
                        'formId' => v.Form__c,
                        'versionId' => v.Id
                    }
                )
            )
            .get('sessionToken');
        Map<String, Object> payload = FinalUploadTestData.payload(
            v,
            token,
            new List<Map<String, Object>>()
        );
        payload.put(
            'files',
            new List<Object>{
                new Map<String, Object>{
                    'elementId' => 'docs',
                    'base64' => 'c2FtcGxl',
                    'name' => 'sample.txt'
                }
            }
        );
        Test.startTest();
        try {
            FinalGuestController.submitGuest(
                v.Form__c,
                FinalGuestTicketTestUtil.withTicket(
                    v.Form__c,
                    JSON.serialize(payload)
                )
            );
            Assert.fail('Mixed transport accepted');
        } catch (AuraHandledException e) {
            Assert.isTrue(
                e.getMessage().length() > 0,
                'Mixed transport refused'
            );
        }
        Test.stopTest();
    }
}
