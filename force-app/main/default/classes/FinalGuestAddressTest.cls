/**
 * Address search for guests: FinalGuestController.addressStatus / addressSuggest
 * / addressDetails (ticket check, caps, gate). The provider is a fake behind
 * FinalAddressService.providerOverride and the cap counters live in
 * FinalAddressGuestGuard's in-memory stand-in, so nothing here touches a
 * callout or the real Org cache.
 */
@IsTest
private class FinalGuestAddressTest {
    private static Integer providerCalls = 0;

    public class FakeProvider implements FinalAddressProvider {
        public List<FinalAddress.Suggestion> suggest(FinalAddress.Query q) {
            providerCalls++;
            FinalAddress.Suggestion s = new FinalAddress.Suggestion();
            s.id = 'p1';
            s.title = '1 Main St';
            s.subtitle = 'Town';
            return new List<FinalAddress.Suggestion>{ s };
        }

        public FinalAddress.Result details(String id, String sessionToken) {
            providerCalls++;
            FinalAddress.Result r = new FinalAddress.Result();
            r.street = '1 Main St';
            r.city = 'Town';
            return r;
        }
    }

    private static final String ADDRESS_SPEC =
        '{"pages":[{"sections":[{"elements":[' +
        '{"id":"addr1","type":"field","config":{"inputType":"address","addressSearch":true}},' +
        '{"id":"addrOff","type":"field","config":{"inputType":"address","addressSearch":false}}' +
        ']}]}]}';

    private static Form__c makeForm(Boolean isPublic) {
        Form__c f = new Form__c(
            Name = 'Guest address test',
            Primary_Context_Object__c = 'Contact',
            Status__c = 'Published',
            Is_Public__c = isPublic,
            Layout_Config__c = '{}',
            Schema_Snapshot__c = '{}'
        );
        insert f;
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = ADDRESS_SPEC
        );
        return f;
    }

    private static void setup() {
        providerCalls = 0;
        FinalAddressService.providerOverride = new FakeProvider();
        FinalAddressService.providerNameOverride = 'Custom';
        FinalAddressGuestGuard.memoryCache = new Map<String, Integer>();
        FinalAddressGuestGuard.cacheUnavailable = false;
    }

    private static String suggestError(
        Id formId,
        String elementId,
        String text,
        String ticket
    ) {
        try {
            FinalGuestController.addressSuggest(
                formId,
                elementId,
                text,
                'token-12345',
                null,
                ticket
            );
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return 'NONE';
    }

    private static String detailsError(Id formId, String ticket) {
        try {
            FinalGuestController.addressDetails(
                formId,
                'addr1',
                'p1',
                'token-12345',
                ticket
            );
        } catch (AuraHandledException e) {
            return e.getMessage();
        }
        return 'NONE';
    }

    // ----- happy path -----

    @IsTest
    static void suggestAndDetailsWork() {
        setup();
        Form__c f = makeForm(true);
        // fresh and unsolved (difficulty 16, 0.5 s old): enough for search
        String ticket = FinalGuestTicketTestUtil.ticketAged(f.Id, 500, 16);

        List<FinalAddress.Suggestion> rows = FinalGuestController.addressSuggest(
            f.Id,
            'addr1',
            'main street',
            'token-12345',
            null,
            ticket
        );
        FinalAddress.Result r = FinalGuestController.addressDetails(
            f.Id,
            'addr1',
            'p1',
            'token-12345',
            ticket
        );

        Assert.areEqual(1, rows.size());
        Assert.areEqual('1 Main St', rows[0].title);
        Assert.areEqual('1 Main St', r.street);
        Assert.areEqual(2, providerCalls);
    }

    @IsTest
    static void addressStatusReportsTheProvider() {
        setup();
        Form__c f = makeForm(true);
        FinalAddressService.Status s = FinalGuestController.addressStatus(f.Id);
        Assert.isTrue(s.configured);
    }

    @IsTest
    static void addressStatusIsGated() {
        setup();
        Form__c f = makeForm(false);
        try {
            FinalGuestController.addressStatus(f.Id);
            Assert.fail('a non-public form must be refused');
        } catch (AuraHandledException e) {
            // gate() refuses without setMessage, so only the type is stable
            Assert.isNotNull(e);
        }
    }

    // ----- refusals -----

    @IsTest
    static void nonPublicFormIsRefused() {
        setup();
        Form__c f = makeForm(false);
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        // gate() refuses with an AuraHandledException that carries no
        // readable message in tests; the point is that it refused before
        // any provider call.
        Assert.areNotEqual(
            'NONE',
            suggestError(f.Id, 'addr1', 'main street', ticket)
        );
        Assert.areNotEqual('NONE', detailsError(f.Id, ticket));
        Assert.areEqual(0, providerCalls);
    }

    @IsTest
    static void questionWithoutSearchIsNotAllowed() {
        setup();
        Form__c f = makeForm(true);
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(f.Id, 'addrOff', 'main street', ticket)
        );
        Assert.areEqual(
            'FINAL_ADDR:NOT_ALLOWED',
            suggestError(f.Id, 'nope', 'main street', ticket)
        );
        Assert.areEqual(0, providerCalls);
    }

    @IsTest
    static void badTicketIsAFinalBotRefusal() {
        setup();
        Form__c f = makeForm(true);
        Assert.areEqual(
            FinalGuestTicket.INVALID,
            suggestError(f.Id, 'addr1', 'main street', 'garbage')
        );
        Assert.areEqual(
            FinalGuestTicket.INVALID,
            suggestError(f.Id, 'addr1', 'main street', null)
        );
        Assert.areEqual(
            FinalGuestTicket.INVALID,
            detailsError(f.Id, 'garbage')
        );
        Assert.areEqual(0, providerCalls);
    }

    @IsTest
    static void ticketForAnotherFormIsRefused() {
        setup();
        Form__c f = makeForm(true);
        Form__c other = makeForm(true);
        String ticket = FinalGuestTicketTestUtil.agedTicket(other.Id);
        Assert.areEqual(
            FinalGuestTicket.INVALID,
            suggestError(f.Id, 'addr1', 'main street', ticket)
        );
    }

    @IsTest
    static void expiredTicketIsRefused() {
        setup();
        Form__c f = makeForm(true);
        String old = FinalGuestTicketTestUtil.ticketAged(
            f.Id,
            FinalGuestTicket.LIFETIME_MS + 5000,
            0
        );
        Assert.areEqual(
            FinalGuestTicket.EXPIRED,
            suggestError(f.Id, 'addr1', 'main street', old)
        );
        Assert.areEqual(FinalGuestTicket.EXPIRED, detailsError(f.Id, old));
    }

    // ----- caps -----

    @IsTest
    static void thirtyFirstSuggestIsLimited() {
        setup();
        Form__c f = makeForm(true);
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        for (Integer i = 0; i < 30; i++) {
            Assert.areEqual(
                'NONE',
                suggestError(f.Id, 'addr1', 'main street', ticket)
            );
        }
        Assert.areEqual(
            'FINAL_ADDR:LIMIT',
            suggestError(f.Id, 'addr1', 'main street', ticket)
        );
        Assert.areEqual(30, providerCalls);
    }

    @IsTest
    static void sixthDetailsIsLimited() {
        setup();
        Form__c f = makeForm(true);
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        for (Integer i = 0; i < 5; i++) {
            Assert.areEqual('NONE', detailsError(f.Id, ticket));
        }
        Assert.areEqual('FINAL_ADDR:LIMIT', detailsError(f.Id, ticket));
        // the suggest allowance is separate
        Assert.areEqual(
            'NONE',
            suggestError(f.Id, 'addr1', 'main street', ticket)
        );
    }

    @IsTest
    static void orgWideCapIsLimited() {
        setup();
        FinalAddressGuestGuard.hourCapOverride = 2;
        Form__c f = makeForm(true);
        // different tickets: the ceiling is shared by all of them
        String a = FinalGuestTicketTestUtil.agedTicket(f.Id);
        String b = FinalGuestTicketTestUtil.ticketAged(f.Id, 20000, 0);
        Assert.areEqual('NONE', suggestError(f.Id, 'addr1', 'main street', a));
        Assert.areEqual('NONE', suggestError(f.Id, 'addr1', 'main street', b));
        Assert.areEqual(
            'FINAL_ADDR:LIMIT',
            suggestError(f.Id, 'addr1', 'main street', a)
        );
        Assert.areEqual('FINAL_ADDR:LIMIT', detailsError(f.Id, b));
    }

    @IsTest
    static void cacheUnavailableFailsClosed() {
        setup();
        FinalAddressGuestGuard.cacheUnavailable = true;
        Form__c f = makeForm(true);
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        Assert.areEqual(
            'FINAL_ADDR:LIMIT',
            suggestError(f.Id, 'addr1', 'main street', ticket)
        );
        Assert.areEqual('FINAL_ADDR:LIMIT', detailsError(f.Id, ticket));
        Assert.areEqual(0, providerCalls);
    }

    @IsTest
    static void shortTextAnswersEmptyAndSpendsNothing() {
        setup();
        Form__c f = makeForm(true);
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        List<FinalAddress.Suggestion> rows = FinalGuestController.addressSuggest(
            f.Id,
            'addr1',
            'ma',
            'token-12345',
            null,
            ticket
        );

        Assert.isTrue(rows.isEmpty());
        Assert.areEqual(0, providerCalls);
        Assert.isTrue(
            FinalAddressGuestGuard.memoryCache.isEmpty(),
            'nothing counted'
        );
    }
}
