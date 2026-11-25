/** Token-authorized upload lifecycle; one Form_Upload__c per attempt, no shared counters. */
public with sharing class FinalUploadService {
    public static final Integer JSON_CAP = 64000;

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
                if (attempt.Status__c == 'CONSUMED') {
                    throw refuse(null);
                }
                List<Object> files = files(attempt);
                String requestedKey;
                if (action == 'remove') {
                    requestedKey = fileKey(
                        attempt,
                        FinalUploadPolicy.stringOf(request.get('slotToken'))
                    );
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
        Form_Upload__c attempt = new Form_Upload__c(
            Form__c = formId,
            Form_Version__c = versionId,
            Actor_User__c = UserInfo.getUserId(),
            Guest_User_Id__c = guest
                ? String.valueOf(UserInfo.getUserId())
                : null,
            Public_Host__c = publicHost,
            Status__c = 'OPEN',
            Expires_At__c = System.now().addHours(2),
            Cleanup_After__c = System.now().addHours(2)
        );
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
        String secret = FinalUploadCapability.mint();
        attempt.Public_Key__c = FinalUploadCapability.mint();
        attempt.Token_Hash__c = FinalUploadCapability.digest(secret);
        attempt.Files_JSON__c = encode(new List<Object>());
        FinalUploadStore.insertAttempt(attempt);
        Map<String, Object> result = receipt(attempt);
        result.put('sessionToken', attempt.Public_Key__c + '.' + secret);
        return result;
    }

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
            if (entry.get('state') == 'RESERVED' && expired(entry)) {
                entry.put('state', 'EXPIRED');
            }
            if (
                entry.get('state') == 'READY' ||
                entry.get('state') == 'RESERVED'
            ) {
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
        String key = FinalUploadCapability.mint();
        String secret = FinalUploadCapability.mint();
        Map<String, Object> entry = new Map<String, Object>{
            'key' => key,
            'elementId' => elementId,
            'tokenHash' => FinalUploadCapability.digest(secret),
            'state' => 'RESERVED',
            'expiresAt' => System.now().addMinutes(10),
            'reservedMaxBytes' => maxBytes,
            'cleanupStatus' => 'NONE'
        };
        files.add(entry);
        save(attempt, files);
        return new Map<String, Object>{
            'slotToken' => attempt.Public_Key__c +
            '.' +
            key +
            '.' +
            secret,
            'slotKey' => key,
            'markerField' => ContentVersion.Final_Upload_fileupload__c.getDescribe()
                .getName(),
            'maxBytes' => maxBytes,
            'accept' => config.get('accept'),
            'expiresAt' => entry.get('expiresAt')
        };
    }

    /** Lock and authenticate the real actor; callers never supply a ledger ID. */
    public static Form_Upload__c authenticate(String token) {
        List<String> parts = tokenParts(token, 2);
        Form_Upload__c attempt = FinalUploadStore.lockAttempts(
                new Set<String>{ parts[0] }
            )
            .get(parts[0]);
        if (
            attempt == null ||
            attempt.Actor_User__c != UserInfo.getUserId() ||
            attempt.Token_Hash__c != FinalUploadCapability.digest(parts[1])
        ) {
            throw refuse(null);
        }
        return attempt;
    }
    /** Verify file secret against the locked JSON; a public file key alone grants nothing. */
    public static String fileKey(Form_Upload__c attempt, String token) {
        List<String> parts = tokenParts(token, 3);
        if (parts[0] != attempt.Public_Key__c) {
            throw refuse(null);
        }
        for (Object value : files(attempt)) {
            Map<String, Object> entry = FinalUploadPolicy.mapOf(value);
            if (
                entry.get('key') == parts[1] &&
                entry.get('tokenHash') == FinalUploadCapability.digest(parts[2])
            ) {
                return parts[1];
            }
        }
        throw refuse(null);
    }
    public static List<String> tokenParts(String token, Integer count) {
        if (token == null || token.length() > 255) {
            throw refuse(null);
        }
        List<String> parts = token.split('\\.');
        if (parts.size() != count) {
            throw refuse(null);
        }
        for (String p : parts) {
            if (FinalUploadCapability.digest(p) == null) {
                throw refuse(null);
            }
        }
        return parts;
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
        if (entry.get('state') == 'RESERVED') {
            return FinalUploadPolicy.positive(entry.get('reservedMaxBytes')) ??
                0;
        }
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
