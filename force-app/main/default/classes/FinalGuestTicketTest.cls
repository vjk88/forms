/**
 * The invisible guest bot checks (FinalGuestTicket + its wiring in
 * FinalGuestController). IMPL_PLAN_GUEST_BOT_CHECKS.md, Tests section.
 *
 * Apex tests cannot run requests concurrently, so the documented concurrency
 * limit (check-then-mark is not atomic) is not asserted. The cache is driven
 * through FinalGuestTicket's @TestVisible seams (an in-memory stand-in and an
 * "unavailable" switch) so markers are deterministic; one test also walks the
 * real Cache.Org path to prove it can never block a submit.
 */
@IsTest
private class FinalGuestTicketTest {
    // ----- fixtures -----

    private static String specJson(String validation, String settingsInner) {
        return '{"specVersion":1,' +
            '"form":{"name":"T","targetObject":"Contact"},' +
            '"settings":{' +
            settingsInner +
            '},' +
            '"pages":[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
            '{"id":"el_ln","type":"field",' +
            validation +
            '"binding":{"object":"Contact","field":"LastName"}}]}]}]}';
    }

    private static Form__c makeForm(String spec) {
        Form__c f = new Form__c(
            Name = 'Ticket test',
            Primary_Context_Object__c = 'Contact',
            Status__c = 'Published',
            Is_Public__c = true,
            Layout_Config__c = '{}',
            Schema_Snapshot__c = '{}'
        );
        insert f;
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = spec
        );
        return f;
    }

    private static Form__c openForm() {
        return makeForm(specJson('', '"spamProtection":"honeypot"'));
    }

    private static String answer(String lastName) {
        return '{"answers":{"el_ln":"' + lastName + '"}}';
    }

    /** A Freeform form (its own durable retry lookup runs before the ticket). */
    private static Form__c freeformForm() {
        Form__c f = new Form__c(
            Name = 'Ticket freeform',
            Form_Type__c = 'Freeform',
            Status__c = 'Published',
            Is_Public__c = true,
            Layout_Config__c = '{}',
            Schema_Snapshot__c = '{}'
        );
        insert f;
        insert new Form_Version__c(
            Form__c = f.Id,
            Version_Number__c = 1,
            Is_Active__c = true,
            Engine_Version__c = 1,
            Spec_JSON__c = '{"specVersion":1,"form":{"name":"F","type":"freeform"},' +
                '"settings":{},"pages":[{"id":"pg_1","sections":[{"id":"sec_1","elements":[' +
                '{"id":"el_t","type":"field","label":"Anything"}]}]}]}'
        );
        return f;
    }

    private static String b64url(Blob b) {
        return EncodingUtil.base64Encode(b)
            .replace('+', '-')
            .replace('/', '_')
            .replace('=', '');
    }

    /** A correctly SIGNED ticket for an arbitrary payload string, so a test
     *  can build claims the real mint would never produce. */
    private static String signed(String payload) {
        FinalGuestTicketTestUtil.ensureKeys();
        Blob key = Crypto.generateMac(
            'hmacSHA256',
            Blob.valueOf('guest-ticket-v1'),
            FinalLinkKeys.macKey()
        );
        Blob body = Blob.valueOf(payload);
        return b64url(body) +
            '.' +
            b64url(Crypto.generateMac('hmacSHA256', body, key));
    }

    private static String payloadOf(String ticket) {
        String seg = ticket.split('\\.')[0].replace('-', '+').replace('_', '/');
        while (Math.mod(seg.length(), 4) != 0) {
            seg += '=';
        }
        return EncodingUtil.base64Decode(seg).toString();
    }

    private static String claimsPayload(
        String version,
        Id formId,
        Long issuedAt,
        String difficulty
    ) {
        return version +
            '|' +
            String.valueOf(formId) +
            '|' +
            String.valueOf(issuedAt) +
            '|00112233445566778899aabbccddeeff|' +
            difficulty;
    }

    private static Long ago(Long ms) {
        return Datetime.now().getTime() - ms;
    }

    private static void expectRefusal(
        String code,
        Id formId,
        String ticket,
        String nonce
    ) {
        try {
            FinalGuestTicket.verify(ticket, nonce, formId);
            Assert.fail('expected ' + code);
        } catch (AuraHandledException e) {
            Assert.areEqual(code, e.getMessage(), 'refusal code');
        }
    }

    private static void expectSubmitRefusal(
        String code,
        Id formId,
        String payload
    ) {
        try {
            FinalGuestController.submitGuest(formId, payload);
            Assert.fail('expected ' + code);
        } catch (AuraHandledException e) {
            Assert.areEqual(code, e.getMessage(), 'refusal code');
        }
    }

    private static Integer contactCount(String lastName) {
        return [SELECT COUNT() FROM Contact WHERE LastName = :lastName];
    }

    // ----- digest vectors (the jest suite uses the SAME inputs) -----

    @IsTest
    static void sha256MatchesTheSharedVectors() {
        Assert.areEqual(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            FinalGuestTicket.sha256Hex('')
        );
        Assert.areEqual(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
            FinalGuestTicket.sha256Hex('abc')
        );
        // non-ASCII: hashed as UTF-8 bytes
        Assert.areEqual(
            '0744a0e18b7c0109a88b05b3094d6ec9ebec3b19a5b787354238c0e0732937ba',
            FinalGuestTicket.sha256Hex('héllo ✓ ü')
        );
        Assert.areEqual(
            '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
            FinalGuestTicket.sha256Hex('a'.repeat(1000))
        );
    }

    @IsTest
    static void leadingZeroBitsCrossesAByteBoundary() {
        // 000e... is 12 zero bits: 8 (one byte) plus 4 into the next.
        String twelve = FinalGuestTicket.sha256Hex('vector-ticket:1412');
        Assert.areEqual(
            '000ed27eb7d5ccbbac8e311bbbe82b0c526e1d4035553218f8a8db008f07fd39',
            twelve
        );
        Assert.areEqual(12, FinalGuestTicket.leadingZeroBits(twelve));
        // 00d4... is exactly one byte of zeros
        String eight = FinalGuestTicket.sha256Hex('vector-ticket:773');
        Assert.areEqual(
            '00d4a14f76f5eaa9688a5536361bc3986bad94a723f0bdb0e1f5ad314b5886ad',
            eight
        );
        Assert.areEqual(8, FinalGuestTicket.leadingZeroBits(eight));
        Assert.areEqual(0, FinalGuestTicket.leadingZeroBits('80ff'));
        Assert.areEqual(1, FinalGuestTicket.leadingZeroBits('40ff'));
        Assert.areEqual(3, FinalGuestTicket.leadingZeroBits('10ff'));
        Assert.areEqual(7, FinalGuestTicket.leadingZeroBits('01ff'));
        Assert.areEqual(9, FinalGuestTicket.leadingZeroBits('007f'));
    }

    // ----- mint + verify -----

    @IsTest
    static void mintedTicketHasTheDocumentedShape() {
        Form__c f = openForm();
        FinalGuestTicketTestUtil.ensureKeys();

        String ticket = FinalGuestTicket.mint(f.Id);

        Assert.isTrue(ticket.length() <= 400, 'bounded size');
        Assert.areEqual(2, ticket.split('\\.').size(), 'payload.signature');
        Assert.isTrue(
            Pattern.matches('[A-Za-z0-9_.-]+', ticket),
            'url-safe, unpadded'
        );
        List<String> parts = payloadOf(ticket).split('\\|');
        Assert.areEqual(5, parts.size());
        Assert.areEqual('v1', parts[0]);
        Assert.areEqual(String.valueOf(f.Id), parts[1]);
        Assert.areEqual(18, parts[1].length(), '18-character Id');
        Assert.areEqual(32, parts[3].length(), '128-bit random as hex');
        Assert.areEqual(
            String.valueOf(FinalGuestTicket.DIFFICULTY),
            parts[4],
            'the default difficulty is signed in'
        );
        Assert.areEqual(16, FinalGuestTicket.DIFFICULTY);
        Assert.areNotEqual(
            ticket,
            FinalGuestTicket.mint(f.Id),
            'every ticket is unique'
        );
    }

    @IsTest
    static void aValidAgedTicketVerifies() {
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestTicket.verify(ticket, '0', f.Id);

        Assert.isTrue(true, 'no refusal');
    }

    @IsTest
    static void aTicketNearItsEndOfLifeStillVerifies() {
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.ticketAged(
            f.Id,
            FinalGuestTicket.LIFETIME_MS - 60000L,
            0
        );

        FinalGuestTicket.verify(ticket, '0', f.Id);

        Assert.isTrue(true, 'one minute before expiry is fine');
    }

    @IsTest
    static void aForgedSignatureIsRefused() {
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        String body = ticket.split('\\.')[0];

        String junkSig = b64url(
            Crypto.generateDigest('SHA-256', Blob.valueOf('not the real key'))
        );
        expectRefusal('FINAL_BOT:INVALID', f.Id, body + '.' + junkSig, '0');

        // a valid signature over a DIFFERENT payload
        String other = FinalGuestTicketTestUtil.agedTicket(f.Id);
        expectRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            body + '.' + other.split('\\.')[1],
            '0'
        );

        // a tampered payload under the original signature
        String tampered = b64url(
            Blob.valueOf(payloadOf(ticket).replace('|0', '|1'))
        );
        expectRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            tampered + '.' + ticket.split('\\.')[1],
            '0'
        );
    }

    @IsTest
    static void aTicketForAnotherFormIsRefused() {
        Form__c a = openForm();
        Form__c b = openForm();
        String ticket = FinalGuestTicketTestUtil.agedTicket(a.Id);

        expectRefusal('FINAL_BOT:INVALID', b.Id, ticket, '0');
    }

    @IsTest
    static void anExpiredTicketIsExpiredNotInvalid() {
        Form__c f = openForm();
        String old = FinalGuestTicketTestUtil.ticketAged(
            f.Id,
            FinalGuestTicket.LIFETIME_MS + 1000L,
            0
        );

        expectRefusal('FINAL_BOT:EXPIRED', f.Id, old, '0');
    }

    @IsTest
    static void anUnknownVersionIsRefused() {
        Form__c f = openForm();
        String v2 = signed(claimsPayload('v2', f.Id, ago(10000L), '0'));

        expectRefusal('FINAL_BOT:INVALID', f.Id, v2, '0');
    }

    @IsTest
    static void malformedClaimsAreRefused() {
        Form__c f = openForm();
        Long t = ago(10000L);
        // not a number
        expectRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            signed('v1|' + f.Id + '|soon|abc|0'),
            '0'
        );
        // too few / too many parts
        expectRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            signed('v1|' + f.Id + '|' + t + '|abc'),
            '0'
        );
        expectRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            signed(claimsPayload('v1', f.Id, t, '0') + '|extra'),
            '0'
        );
        // out-of-range difficulty
        expectRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            signed(claimsPayload('v1', f.Id, t, '33')),
            '0'
        );
        expectRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            signed(claimsPayload('v1', f.Id, t, '-1')),
            '0'
        );
    }

    @IsTest
    static void missingOversizedAndGarbageTicketsAreRefused() {
        Form__c f = openForm();
        String good = FinalGuestTicketTestUtil.agedTicket(f.Id);

        expectRefusal('FINAL_BOT:INVALID', f.Id, null, '0');
        expectRefusal('FINAL_BOT:INVALID', f.Id, '', '0');
        expectRefusal('FINAL_BOT:INVALID', f.Id, 'nonsense', '0');
        expectRefusal('FINAL_BOT:INVALID', f.Id, 'a.b.c', '0');
        expectRefusal('FINAL_BOT:INVALID', f.Id, '.', '0');
        expectRefusal('FINAL_BOT:INVALID', f.Id, 'a'.repeat(401), '0');
        expectRefusal('FINAL_BOT:INVALID', f.Id, good, '1'.repeat(21));
    }

    @IsTest
    static void aNonCanonicalEncodingIsRefused() {
        Form__c f = openForm();
        String good = FinalGuestTicketTestUtil.agedTicket(f.Id);
        String body = good.split('\\.')[0];
        String sig = good.split('\\.')[1];

        // padding is not canonical
        expectRefusal('FINAL_BOT:INVALID', f.Id, body + '=.' + sig, '0');

        // the 32-byte signature is 43 characters whose last one carries two
        // spare bits: flipping the lowest bit decodes to the SAME bytes but
        // re-encodes differently, so it must not become a second identity.
        String alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        Integer idx = alphabet.indexOf(sig.substring(sig.length() - 1));
        String flipped =
            sig.substring(0, sig.length() - 1) +
            alphabet.substring(
                Math.mod(idx, 2) == 0 ? idx + 1 : idx - 1,
                (Math.mod(idx, 2) == 0 ? idx + 1 : idx - 1) + 1
            );
        Assert.areNotEqual(sig, flipped);
        expectRefusal('FINAL_BOT:INVALID', f.Id, body + '.' + flipped, '0');
    }

    @IsTest
    static void aFutureIssueTimeIsRefusedButSmallSkewIsFine() {
        Form__c f = openForm();
        Long now = Datetime.now().getTime();
        String future = signed(claimsPayload('v1', f.Id, now + 60000L, '0'));

        expectRefusal('FINAL_BOT:INVALID', f.Id, future, '0');

        // within the 5 s allowance the signature + issue time are accepted;
        // it is then simply too young.
        String skew = signed(claimsPayload('v1', f.Id, now + 1000L, '0'));
        expectRefusal('FINAL_BOT:TOO_FAST', f.Id, skew, '0');
    }

    @IsTest
    static void aWrongOrMissingProofIsRefused() {
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.ticketAged(f.Id, 10000L, 16);

        expectRefusal('FINAL_BOT:PROOF', f.Id, ticket, null);
        expectRefusal('FINAL_BOT:PROOF', f.Id, ticket, '');
        expectRefusal('FINAL_BOT:PROOF', f.Id, ticket, 'abc');
        // a number that really fails (one nonce in 65,536 would pass)
        Integer n = 0;
        while (
            FinalGuestTicket.leadingZeroBits(
                FinalGuestTicket.sha256Hex(ticket + ':' + n)
            ) >= 16
        ) {
            n++;
        }
        expectRefusal('FINAL_BOT:PROOF', f.Id, ticket, String.valueOf(n));
    }

    @IsTest
    static void aSolvedPuzzleAcrossAByteBoundaryVerifies() {
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.ticketAged(f.Id, 10000L, 10);
        Integer n = 0;
        while (
            FinalGuestTicket.leadingZeroBits(
                FinalGuestTicket.sha256Hex(ticket + ':' + n)
            ) < 10
        ) {
            n++;
        }

        FinalGuestTicket.verify(ticket, String.valueOf(n), f.Id);

        Assert.isTrue(true, 'ten zero bits (a byte and two more) accepted');
    }

    @IsTest
    static void aTicketThatIsTooYoungIsTooFast() {
        Form__c f = openForm();
        String fresh = FinalGuestTicketTestUtil.ticketAged(f.Id, 300L, 0);

        expectRefusal('FINAL_BOT:TOO_FAST', f.Id, fresh, '0');

        String aged = FinalGuestTicketTestUtil.ticketAged(f.Id, 2600L, 0);
        FinalGuestTicket.verify(aged, '0', f.Id);
        Assert.isTrue(true, 'past two seconds passes');
    }

    @IsTest
    static void aLinkTokenCannotPassAsATicket() {
        Form__c f = openForm();
        // minted with the RAW mac key; a ticket uses a derived one
        String token = FinalSurveyTokenService.mint(f.Id, f.Id, 'Contact');

        expectRefusal('FINAL_BOT:INVALID', f.Id, token, '0');
    }

    @IsTest
    static void withNoKeysNothingVerifies() {
        Form__c f = openForm();
        // keys were never provisioned in this test
        expectRefusal('FINAL_BOT:INVALID', f.Id, 'abc.def', '0');
    }

    // ----- replay marker -----

    @IsTest
    static void markersAreAlphanumericBoundedAndExpireWithTheTicket() {
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        FinalGuestTicket.memoryCache = new Map<String, Integer>();

        FinalGuestTicket.markUsed(ticket);

        Assert.areEqual(1, FinalGuestTicket.memoryCache.size());
        String key = new List<String>(FinalGuestTicket.memoryCache.keySet())[0];
        Assert.isTrue(
            Pattern.matches('[A-Za-z0-9]{1,50}', key),
            'alphanumeric, within 50 characters'
        );
        Assert.areEqual(49, key.length());
        Integer ttl = FinalGuestTicket.memoryCache.get(key);
        Assert.isTrue(ttl >= 300, 'at least five minutes');
        Assert.isTrue(ttl <= 7200, 'never longer than the ticket lifetime');
        Assert.isTrue(FinalGuestTicket.isUsed(ticket));

        // a nearly-expired ticket still gets the five-minute floor
        String late = FinalGuestTicketTestUtil.ticketAged(
            f.Id,
            FinalGuestTicket.LIFETIME_MS - 20000L,
            0
        );
        FinalGuestTicket.markUsed(late);
        Assert.areEqual(
            300,
            FinalGuestTicket.memoryCache.get(FinalGuestTicket.markerKey(late))
        );
    }

    @IsTest
    static void aUsedTicketIsRefusedByVerify() {
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        FinalGuestTicket.markUsed(ticket);

        expectRefusal('FINAL_BOT:USED', f.Id, ticket, '0');
    }

    // ----- submitGuest wiring -----

    @IsTest
    static void aSavedSubmitSpendsItsTicketAndASecondIsRefused() {
        Form__c f = openForm();
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestController.GuestSubmitResult first = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                answer('SpentOnce'),
                ticket,
                '0'
            )
        );

        Assert.isTrue(first.success);
        Assert.areEqual(1, contactCount('SpentOnce'));
        Assert.areEqual(1, FinalGuestTicket.memoryCache.size(), 'marked');

        expectSubmitRefusal(
            'FINAL_BOT:USED',
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                answer('SpentTwice'),
                ticket,
                '0'
            )
        );
        Assert.areEqual(0, contactCount('SpentTwice'), 'nothing saved');
    }

    @IsTest
    static void aSubmitWithoutAnyTicketIsRefusedAndSavesNothing() {
        Form__c f = openForm();
        FinalGuestTicketTestUtil.ensureKeys();

        expectSubmitRefusal('FINAL_BOT:INVALID', f.Id, answer('NoTicket'));
        Assert.areEqual(0, contactCount('NoTicket'));
    }

    @IsTest
    static void aForgedProofAndAnInstantSubmitAreRefusedBeforeAnythingSaves() {
        Form__c f = openForm();
        String hard = FinalGuestTicketTestUtil.ticketAged(f.Id, 10000L, 16);
        Integer n = 0;
        while (
            FinalGuestTicket.leadingZeroBits(
                FinalGuestTicket.sha256Hex(hard + ':' + n)
            ) >= 16
        ) {
            n++;
        }
        expectSubmitRefusal(
            'FINAL_BOT:PROOF',
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                answer('BadProof'),
                hard,
                String.valueOf(n)
            )
        );

        expectSubmitRefusal(
            'FINAL_BOT:TOO_FAST',
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                answer('Instant'),
                FinalGuestTicketTestUtil.ticketAged(f.Id, 100L, 0),
                '0'
            )
        );
        Assert.areEqual(0, contactCount('BadProof'));
        Assert.areEqual(0, contactCount('Instant'));
    }

    @IsTest
    static void aFailedSubmitKeepsItsTicket() {
        // closed AFTER the person loaded it: the submit is refused by the
        // availability check, which comes after the ticket check.
        Form__c f = makeForm(
            specJson('', '"availability":{"status":"closed"}')
        );
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        try {
            FinalGuestController.submitGuest(
                f.Id,
                FinalGuestTicketTestUtil.withTicket(
                    answer('Closed'),
                    ticket,
                    '0'
                )
            );
            Assert.fail('a closed form refuses the submit');
        } catch (AuraHandledException e) {
            Assert.areNotEqual('FINAL_BOT:INVALID', e.getMessage());
        }

        Assert.isTrue(FinalGuestTicket.memoryCache.isEmpty(), 'not marked');
        FinalGuestTicket.verify(ticket, '0', f.Id);
        Assert.isTrue(true, 'the same ticket still verifies');
    }

    @IsTest
    static void aRejectedOutcomeDoesNotSpendTheTicket() {
        // the answer is required and sent blank: FinalSubmitService returns
        // outcome.errors instead of throwing; submitGuest answers
        // success = false with those errors (DEFERRED #68).
        Form__c f = makeForm(
            specJson('"validation":[{"type":"required"}],', '')
        );
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestController.GuestSubmitResult refused = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                '{"answers":{"el_ln":""}}',
                ticket,
                '0'
            )
        );

        Assert.areEqual(false, refused.success, 'a refusal is not a success');
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM Contact],
            'the rejected answer saved nothing'
        );
        Assert.isTrue(
            FinalGuestTicket.memoryCache.isEmpty(),
            'a rejected outcome does not mark the ticket'
        );
        // fix the answer and resend with the SAME ticket
        FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(answer('Fixed'), ticket, '0')
        );
        Assert.areEqual(1, contactCount('Fixed'));
        Assert.areEqual(1, FinalGuestTicket.memoryCache.size());
    }

    @IsTest
    static void aHoneypotFakeSuccessDoesNotSpendTheTicket() {
        Form__c f = openForm();
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                '{"answers":{"el_ln":"Bot"},"meta":{"hp":"http://spam"}}',
                ticket,
                '0'
            )
        );

        Assert.isTrue(res.success, 'fake success');
        Assert.areEqual(0, contactCount('Bot'));
        Assert.isTrue(FinalGuestTicket.memoryCache.isEmpty(), 'not marked');
    }

    @IsTest
    static void whenTheCacheIsUnavailableTheSubmitStillGoesThrough() {
        Form__c f = openForm();
        FinalGuestTicket.cacheUnavailable = true;
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(answer('NoCache'), ticket, '0')
        );

        Assert.isTrue(res.success);
        Assert.areEqual(1, contactCount('NoCache'));
        // documented limitation, NOT a guarantee: with no cache the same
        // solved ticket can be reused until it expires.
        FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                answer('NoCacheAgain'),
                ticket,
                '0'
            )
        );
        Assert.areEqual(1, contactCount('NoCacheAgain'));
    }

    @IsTest
    static void theRealCachePathNeverBlocksASubmit() {
        // no seam: whatever Cache.Org does in this org (missing partition,
        // no capacity, or a working cache) the submit succeeds.
        Form__c f = openForm();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestController.GuestSubmitResult res = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                answer('RealCache'),
                ticket,
                '0'
            )
        );

        Assert.isTrue(res.success);
        Assert.areEqual(1, contactCount('RealCache'));
    }

    @IsTest
    static void aFreeformRetryOfASavedAttemptKeepsItsThankYouEvenWithoutATicket() {
        Form__c f = freeformForm();
        Form_Version__c v = [
            SELECT Id
            FROM Form_Version__c
            WHERE Form__c = :f.Id
            LIMIT 1
        ];
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String body =
            '{"answers":{"el_t":"hello"},"meta":{"submissionKey":"ff-key-1","specVersionId":"' +
            v.Id +
            '"}}';
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);

        FinalGuestController.GuestSubmitResult first = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(body, ticket, '0')
        );
        Assert.isTrue(first.success);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Submission__c WHERE Form__c = :f.Id]
        );

        // the same key again, with NO ticket and with the SPENT ticket: both
        // are answered from the durable store before any ticket check
        FinalGuestController.GuestSubmitResult noTicket = FinalGuestController.submitGuest(
            f.Id,
            body
        );
        Assert.isTrue(noTicket.success, 'no ticket needed for a saved retry');
        FinalGuestController.GuestSubmitResult spent = FinalGuestController.submitGuest(
            f.Id,
            FinalGuestTicketTestUtil.withTicket(body, ticket, '0')
        );
        Assert.isTrue(spent.success);
        Assert.areEqual(
            1,
            [SELECT COUNT() FROM Form_Submission__c WHERE Form__c = :f.Id],
            'still exactly one submission'
        );

        // a DIFFERENT attempt reusing the spent ticket is a used ticket
        expectSubmitRefusal(
            'FINAL_BOT:USED',
            f.Id,
            FinalGuestTicketTestUtil.withTicket(
                body.replace('ff-key-1', 'ff-key-2'),
                ticket,
                '0'
            )
        );
    }

    // ----- issuance -----

    @IsTest
    static void theSpecResponseCarriesATicketForAnOpenForm() {
        Form__c f = openForm();
        FinalGuestTicketTestUtil.ensureKeys();

        Map<String, Object> out = FinalGuestController.getGuestRuntimeSpecForLangs(
            f.Id,
            null
        );

        Assert.isNotNull(out.get('spec'));
        String ticket = (String) out.get('ticket');
        Assert.isNotNull(ticket, 'a ticket rides with the spec');
        Assert.areEqual(
            String.valueOf(f.Id),
            payloadOf(ticket).split('\\|')[1]
        );
    }

    @IsTest
    static void aClosedFormHandsOutNoTicket() {
        Form__c f = makeForm(
            specJson('', '"availability":{"status":"closed"}')
        );
        FinalGuestTicketTestUtil.ensureKeys();

        Map<String, Object> out = FinalGuestController.getGuestRuntimeSpecForLangs(
            f.Id,
            null
        );

        Assert.areEqual(true, out.get('closed'));
        Assert.isFalse(out.containsKey('ticket'));
        try {
            FinalGuestController.guestTicket(f.Id);
            Assert.fail('closed refreshes nothing');
        } catch (AuraHandledException e) {
            Assert.isTrue(true);
        }
    }

    @IsTest
    static void guestTicketMintsFreshTicketsOnlyForGuestOpenForms() {
        Form__c f = openForm();
        FinalGuestTicketTestUtil.ensureKeys();

        String one = FinalGuestController.guestTicket(f.Id);
        String two = FinalGuestController.guestTicket(f.Id);
        Assert.areNotEqual(one, two);
        Assert.areEqual(String.valueOf(f.Id), payloadOf(one).split('\\|')[1]);

        Form__c draft = makeForm(specJson('', ''));
        draft.Status__c = 'Draft';
        update draft;
        try {
            FinalGuestController.guestTicket(draft.Id);
            Assert.fail('an unpublished form gives no ticket');
        } catch (AuraHandledException e) {
            // gate() throws the generic message without setMessage, so Apex
            // reads 'Script-thrown exception'; the type is what matters here.
            Assert.isNotNull(e, 'refused by the public-form gate');
        }
        try {
            FinalGuestController.guestTicket(null);
            Assert.fail('no form, no ticket');
        } catch (AuraHandledException e) {
            Assert.isNotNull(e, 'refused by the public-form gate');
        }
    }

    // ----- key provisioning -----

    @IsTest
    static void aGuestWithNoKeysGetsUnavailableAndTouchesNoData() {
        Form__c f = openForm();
        Assert.isNull(
            FinalLinkSecret__c.getInstance('keys'),
            'no keys in this test'
        );
        Integer dmlBefore = Limits.getDmlStatements();
        Integer rowsBefore = Limits.getDmlRows();

        try {
            FinalGuestController.getGuestRuntimeSpecForLangs(f.Id, null);
            Assert.fail('no keys, no unsigned ticket');
        } catch (AuraHandledException e) {
            Assert.areEqual('This form is not available.', e.getMessage());
        }
        try {
            FinalGuestController.guestTicket(f.Id);
            Assert.fail('no keys, no unsigned ticket');
        } catch (AuraHandledException e) {
            Assert.areEqual('This form is not available.', e.getMessage());
        }

        Assert.areEqual(dmlBefore, Limits.getDmlStatements(), 'no DML');
        Assert.areEqual(rowsBefore, Limits.getDmlRows(), 'no rows');
        Assert.isNull(
            FinalLinkSecret__c.getInstance('keys'),
            'a guest never provisions'
        );
    }

    @IsTest
    static void publishCreatesTheKeysOnceAndNeverRotatesThem() {
        Form__c form = new Form__c(
            Name = 'Publish keys',
            Primary_Context_Object__c = 'Contact'
        );
        insert form;
        String spec =
            '{"specVersion":1,"marker":"k",' +
            '"resolved":{"tokens":{"--c-accent":"#123456"},"engineVersion":1,' +
            '"resolvedAt":"2026-07-06T00:00:00Z"}}';
        Assert.isNull(FinalLinkSecret__c.getInstance('keys'), 'none yet');

        FinalSpecController.publishSpec(form.Id, spec);

        FinalLinkSecret__c created = FinalLinkSecret__c.getInstance('keys');
        Assert.isNotNull(created, 'Publish provisioned the keys');
        Assert.isTrue(String.isNotBlank(created.Mac_Key__c), 'MAC key set');
        Assert.isTrue(String.isNotBlank(created.Enc_Key__c), 'AES key set');
        String macBefore = created.Mac_Key__c;
        String encBefore = created.Enc_Key__c;

        // a link token minted now must survive a second publish
        String token = FinalSurveyTokenService.mint(
            form.Id,
            form.Id,
            'Contact'
        );

        // forget the in-memory copies so the second publish reads the row
        FinalLinkKeys.encKeyCache = null;
        FinalLinkKeys.macKeyCache = null;
        FinalGuestTicket.derivedKeyCache = null;
        FinalSpecController.publishSpec(form.Id, spec);

        FinalLinkSecret__c kept = FinalLinkSecret__c.getInstance('keys');
        Assert.areEqual(macBefore, kept.Mac_Key__c, 'mac key never rotates');
        Assert.areEqual(encBefore, kept.Enc_Key__c, 'enc key never rotates');
        Assert.areEqual(
            1,
            FinalLinkSecret__c.getAll().size(),
            'still one keys row'
        );
        Assert.isNotNull(
            FinalSurveyTokenService.resolve(token),
            'an existing link token still verifies'
        );
        // and the freshly published form can hand out a verifiable ticket
        Assert.isNotNull(FinalGuestTicket.mint(form.Id));
    }

    // ----- verifySigned (address search: no puzzle, no age, no marker) -----

    private static void expectSignedRefusal(
        String code,
        Id formId,
        String ticket
    ) {
        try {
            FinalGuestTicket.verifySigned(ticket, formId);
            Assert.fail('expected ' + code);
        } catch (AuraHandledException e) {
            Assert.areEqual(code, e.getMessage(), 'refusal code');
        }
    }

    @IsTest
    static void verifySignedAcceptsAFreshUnsolvedTicket() {
        Form__c f = openForm();
        // 0.5 s old (under the 2 s minimum) at the real difficulty, no nonce
        String ticket = FinalGuestTicketTestUtil.ticketAged(f.Id, 500, 16);

        FinalGuestTicket.verifySigned(ticket, f.Id);

        Assert.isTrue(true, 'no refusal');
        // and verify would still refuse the same ticket
        expectRefusal('FINAL_BOT:PROOF', f.Id, ticket, null);
    }

    @IsTest
    static void verifySignedIgnoresTheUsedMarker() {
        Form__c f = openForm();
        FinalGuestTicket.memoryCache = new Map<String, Integer>();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        FinalGuestTicket.markUsed(ticket);

        FinalGuestTicket.verifySigned(ticket, f.Id);

        Assert.isTrue(true, 'a used ticket may still search');
    }

    @IsTest
    static void verifySignedRefusesWrongFormExpiredAndTampered() {
        Form__c f = openForm();
        Form__c b = openForm();
        String ticket = FinalGuestTicketTestUtil.agedTicket(f.Id);
        expectSignedRefusal('FINAL_BOT:INVALID', b.Id, ticket);
        String old = FinalGuestTicketTestUtil.ticketAged(
            f.Id,
            FinalGuestTicket.LIFETIME_MS + 5000L,
            0
        );
        expectSignedRefusal('FINAL_BOT:EXPIRED', f.Id, old);
        List<String> segs = ticket.split('\\.');
        String flipped = segs[1].substring(0, 1) == 'A' ? 'B' : 'A';
        expectSignedRefusal(
            'FINAL_BOT:INVALID',
            f.Id,
            segs[0] + '.' + flipped + segs[1].substring(1)
        );
        expectSignedRefusal('FINAL_BOT:INVALID', f.Id, null);
        expectSignedRefusal('FINAL_BOT:INVALID', f.Id, 'x'.repeat(401));
    }
}
