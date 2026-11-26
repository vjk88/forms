/**
 * Token-authorized upload lifecycle; one Form_Upload__c per attempt, no shared counters.
 * No record exists until a file arrives (IMPL_PLAN_UPLOAD_RECORDS_ON_ARRIVAL): the
 * session and each question's tag are signed tokens, and the ContentVersion guard
 * writes the attempt on the first accepted file.
 */
public with sharing class FinalUploadService {
    public static final Integer JSON_CAP = 64000;
    /** How long an attempt (and its tags) stays open, counted from session start. */
    public static final Integer ATTEMPT_HOURS = 2;

    /** Dispatch non-cacheable upload operations from the guest or authenticated controller. */
    public static Map<String, Object> handle(
        String requestJson,
        Boolean publicHost
    ) {
        try {
            if (String.isBlank(requestJson) || requestJson.length() > 4096) {
                throw refuse(null);
            }
            Map<String, Object> request = FinalUploadPolicy.mapOf(
                JSON.deserializeUntyped(requestJson)
            );
            String action = FinalUploadPolicy.stringOf(request.get('action'));
            if (action == 'create') {
                return create(request, publicHost);
            }
            Form_Upload__c attempt = authenticate(
                FinalUploadPolicy.stringOf(request.get('sessionToken'))
            );
            if (attempt.Public_Host__c != publicHost) {
                throw refuse(null);
            }
            if (action == 'cancel' || action == 'remove') {
                // Nothing has arrived, so there is nothing to cancel or remove.
                if (attempt.Id == null) {
                    return receipt(attempt);
                }
                if (attempt.Status__c == 'CONSUMED') {
                    throw refuse(null);
                }
                List<Object> files = files(attempt);
                String requestedKey;
                if (action == 'remove') {
                    // The session proves the attempt; the key names its file.
                    requestedKey = FinalUploadPolicy.stringOf(
                        request.get('fileKey')
                    );
                    if (requestedKey == null) {
                        throw refuse(null);
                    }
                }
                Boolean found = action == 'cancel';
                for (Object value : files) {
                    Map<String, Object> entry = FinalUploadPolicy.mapOf(value);
                    if (
                        action == 'cancel' ||
                        entry.get('key') == requestedKey
                    ) {
                        found = true;
                        if (entry.get('state') != 'CONSUMED') {
                            entry.put(
                                'state',
                                entry.get('contentDocumentId') == null
                                    ? 'CANCELLED'
                                    : 'REMOVED'
                            );
                        }
                    }
                }
                if (!found) {
                    throw refuse(null);
                }
                if (action == 'cancel') {
                    attempt.Status__c = 'CANCELLED';
                }
                attempt.Cleanup_After__c = System.now();
                save(attempt, files);
                // Immediate best-effort removal; hourly cleanup retries failures.
                FinalUploadCleanupBatch.clean(
                    new List<Form_Upload__c>{ attempt }
                );
                return receipt(attempt);
            }
            if (attempt.Status__c == 'CONSUMED' && action == 'status') {
                return receipt(attempt);
            }
            requireOpen(attempt);
            Map<String, Object> spec = FinalUploadStore.specs(
                    new List<Form_Upload__c>{ attempt }
                )
                .get(attempt.Form_Version__c);
            if (
                FinalSubmitService.responseCapReached(
                    spec,
                    attempt.Form_Version__c
                )
            ) {
                throw refuse(null);
            }
            if (action == 'status') {
                return receipt(attempt);
            }
            if (action == 'reserve') {
                return reserve(
                    attempt,
                    spec,
                    FinalUploadPolicy.stringOf(request.get('elementId'))
                );
            }
            throw refuse(null);
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw refuse(null);
        }
    }

    /** Start a session: every gate is checked, nothing is saved. */
    private static Map<String, Object> create(
        Map<String, Object> request,
        Boolean publicHost
    ) {
        if (!FinalUploadPolicy.enabled()) {
            throw refuse(null);
        }
        Boolean guest = UserInfo.getUserType() == 'Guest';
        if (guest && !publicHost) {
            throw refuse(null);
        }
        Id formId = (Id) FinalUploadPolicy.stringOf(request.get('formId'));
        Id versionId = (Id) FinalUploadPolicy.stringOf(
            request.get('versionId')
        );
        if (formId == null || versionId == null) {
            throw refuse(null);
        }
        FinalUploadToken.Claims c = new FinalUploadToken.Claims();
        c.publicKey = FinalUploadCapability.mint();
        c.versionId = versionId;
        c.publicHost = publicHost;
        c.guest = guest;
        c.attemptExpires = FinalUploadToken.wholeSeconds(
            System.now().addHours(ATTEMPT_HOURS)
        );
        Form_Upload__c attempt = draft(c, formId);
        Map<String, Object> spec = FinalUploadStore.specs(
                new List<Form_Upload__c>{ attempt }
            )
            .get(versionId);
        if (FinalSubmitService.responseCapReached(spec, versionId)) {
            throw refuse(null);
        }
        if (guest) {
            FinalGuestTicket.verify(
                FinalUploadPolicy.stringOf(request.get('ticket')),
                FinalUploadPolicy.stringOf(request.get('nonce')),
                formId
            );
        }
        Map<String, Object> result = receipt(attempt);
        result.put('sessionToken', FinalUploadToken.session(c));
        return result;
    }

    /** Hand out the question's signed tag (reusable for every file this visit). Limits shown here are advisory; the guard enforces them on arrival. */
    private static Map<String, Object> reserve(
        Form_Upload__c attempt,
        Map<String, Object> spec,
        String elementId
    ) {
        if (!FinalUploadPolicy.enabled()) {
            throw refuse(null);
        }
        Map<String, Object> element = FinalUploadPolicy.elements(spec)
            .get(elementId);
        if (element == null) {
            throw refuse(null);
        }
        Map<String, Object> config = FinalUploadPolicy.mapOf(
            element.get('config')
        );
        List<Object> files = files(attempt);
        FinalUploadPolicy.Rules limits = FinalUploadPolicy.limits(
            spec,
            attempt.Guest_User_Id__c != null
        );
        Integer active = 0;
        Integer elementCount = 0;
        Decimal used = 0;
        for (Object value : files) {
            Map<String, Object> entry = FinalUploadPolicy.mapOf(value);
            if (entry.get('state') == 'READY') {
                active++;
                if (entry.get('elementId') == elementId) {
                    elementCount++;
                }
            }
            used += pendingBytes(entry);
        }
        Decimal perElement = config.get('multiple') == false
            ? 1
            : FinalUploadPolicy.positive(config.get('maxFiles'));
        if (
            (limits.maxFiles != null &&
            active >= limits.maxFiles) ||
            (perElement != null &&
            elementCount >= perElement) ||
            (limits.maxEntries != null &&
            files.size() >= limits.maxEntries)
        ) {
            throw refuse(Label.Final_Run_UploadCount);
        }
        Decimal maxBytes = FinalUploadPolicy.minLimit(
            limits.maxFileBytes,
            FinalUploadPolicy.positive(config.get('maxSizeBytes'))
        );
        if (limits.maxTotalBytes != null) {
            maxBytes = FinalUploadPolicy.minLimit(
                maxBytes,
                limits.maxTotalBytes - used
            );
        }
        if (maxBytes != null && maxBytes <= 0) {
            throw refuse(Label.Final_Run_UploadSize);
        }
        FinalUploadToken.Claims c = claimsOf(attempt);
        c.elementId = elementId;
        return new Map<String, Object>{
            'tag' => FinalUploadToken.tag(c),
            'markerField' => ContentVersion.Final_Upload_fileupload__c.getDescribe()
                .getName(),
            'maxBytes' => maxBytes,
            'accept' => config.get('accept'),
            'expiresAt' => c.attemptExpires
        };
    }

    /**
     * Verify the signed session for the real actor and lock its attempt.
     * Before any file has arrived there is no record: an unsaved draft
     * (Id == null) stands in, built only from the verified claims.
     */
    public static Form_Upload__c authenticate(String token) {
        FinalUploadToken.Claims c = FinalUploadToken.readSession(token);
        if (c == null || c.guest != (UserInfo.getUserType() == 'Guest')) {
            throw refuse(null);
        }
        Form_Upload__c attempt = FinalUploadStore.lockAttempts(
                new Set<String>{ c.publicKey }
            )
            .get(c.publicKey);
        if (attempt == null) {
            return draft(
                c,
                FinalUploadStore.formsOf(new Set<Id>{ c.versionId })
                    .get(c.versionId)
            );
        }
        requireMatch(attempt, c);
        return attempt;
    }

    /** A stored attempt must agree with every signed claim presented for it. */
    public static void requireMatch(
        Form_Upload__c attempt,
        FinalUploadToken.Claims c
    ) {
        if (
            attempt.Actor_User__c != UserInfo.getUserId() ||
            attempt.Form_Version__c != c.versionId ||
            attempt.Public_Host__c != c.publicHost ||
            (attempt.Guest_User_Id__c != null) != c.guest
        ) {
            throw refuse(null);
        }
    }

    /** The unsaved attempt a first file will create, from verified claims only. */
    public static Form_Upload__c draft(FinalUploadToken.Claims c, Id formId) {
        if (formId == null) {
            throw refuse(null);
        }
        return new Form_Upload__c(
            Public_Key__c = c.publicKey,
            Form__c = formId,
            Form_Version__c = c.versionId,
            Actor_User__c = UserInfo.getUserId(),
            Guest_User_Id__c = c.guest
                ? String.valueOf(UserInfo.getUserId())
                : null,
            Public_Host__c = c.publicHost,
            Status__c = 'OPEN',
            Expires_At__c = c.attemptExpires,
            Cleanup_After__c = c.attemptExpires,
            Files_JSON__c = encode(new List<Object>())
        );
    }

    private static FinalUploadToken.Claims claimsOf(Form_Upload__c attempt) {
        FinalUploadToken.Claims c = new FinalUploadToken.Claims();
        c.publicKey = attempt.Public_Key__c;
        c.versionId = attempt.Form_Version__c;
        c.publicHost = attempt.Public_Host__c;
        c.guest = attempt.Guest_User_Id__c != null;
        c.attemptExpires = FinalUploadToken.wholeSeconds(attempt.Expires_At__c);
        return c;
    }

    public static void requireOpen(Form_Upload__c a) {
        if (
            a.Status__c != 'OPEN' ||
            a.Expires_At__c <= System.now() ||
            a.Actor_User__c != UserInfo.getUserId()
        ) {
            throw refuse(null);
        }
    }
    public static List<Object> files(Form_Upload__c a) {
        if (
            String.isBlank(a.Files_JSON__c) ||
            a.Files_JSON__c.length() > JSON_CAP
        ) {
            throw refuse(null);
        }
        Map<String, Object> body = FinalUploadPolicy.mapOf(
            JSON.deserializeUntyped(a.Files_JSON__c)
        );
        if (
            body.get('schemaVersion') != 1 ||
            !(body.get('files') instanceof List<Object>)
        ) {
            throw refuse(null);
        }
        return FinalUploadPolicy.listOf(body.get('files'));
    }
    public static String encode(List<Object> files) {
        String body = JSON.serialize(
            new Map<String, Object>{ 'schemaVersion' => 1, 'files' => files }
        );
        if (body.length() > JSON_CAP) {
            throw refuse(Label.Final_Run_UploadCapacity);
        }
        return body;
    }
    public static void save(Form_Upload__c a, List<Object> files) {
        a.Files_JSON__c = encode(files);
        FinalUploadStore.saveAttempts(new List<Form_Upload__c>{ a });
    }
    public static Boolean expired(Map<String, Object> entry) {
        return (Datetime) JSON.deserialize(
                JSON.serialize(entry.get('expiresAt')),
                Datetime.class
            ) <= System.now();
    }
    public static Decimal pendingBytes(Map<String, Object> entry) {
        return entry.get('contentDocumentId') != null &&
            entry.get('cleanupStatus') != 'DELETED' &&
            entry.get('state') != 'CONSUMED'
            ? FinalUploadPolicy.positive(entry.get('sizeBytes')) ?? 0
            : 0;
    }
    /** Safe projection: no ledger, version/document IDs, hashes, or raw capabilities. */
    public static Map<String, Object> receipt(Form_Upload__c a) {
        List<Object> safe = new List<Object>();
        for (Object value : files(a)) {
            Map<String, Object> e = FinalUploadPolicy.mapOf(value);
            safe.add(
                new Map<String, Object>{
                    'key' => e.get('key'),
                    'elementId' => e.get('elementId'),
                    'state' => e.get('state'),
                    'name' => e.get('name'),
                    'sizeBytes' => e.get('sizeBytes'),
                    'cleanupStatus' => e.get('cleanupStatus')
                }
            );
        }
        return new Map<String, Object>{
            'state' => a.Status__c,
            'expiresAt' => a.Expires_At__c,
            'files' => safe,
            'childCount' => a.Result_Child_Count__c
        };
    }
    /** Stable, non-disclosing errors for endpoints and guards. */
    public static AuraHandledException refuse(String message) {
        AuraHandledException e = new AuraHandledException(
            String.isBlank(message)
                ? Label.Final_Run_UploadUnavailable
                : message
        );
        e.setMessage(
            String.isBlank(message)
                ? Label.Final_Run_UploadUnavailable
                : message
        );
        return e;
    }
}
