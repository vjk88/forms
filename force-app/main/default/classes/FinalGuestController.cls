/**
 * FinalGuestController — the guest delivery family for the final* viewer
 * (Phase A, slice A1). The ONLY Apex a public/guest site profile is granted.
 *
 * Runs `without sharing` so an unauthenticated visitor can read a published
 * form and file a response — but EVERY method opens with the same HARD GATE
 * (legacy FormViewerGuest pattern, proven): the form must exist, be
 * `Status__c = 'Published'`, AND explicitly allow the `Public_Guest` adapter,
 * with an active version carrying a spec. Any failure returns ONE generic
 * message — never which gate failed (RUNTIME_NOTES: no gate oracle).
 *
 * Two guarantees beyond the gate:
 *  - DELIVERY IS A PROJECTION. getGuestSpec strips binding field API names, the
 *    target/child object names, and prefill config server-side before the spec
 *    ever reaches the browser — a guest never learns the schema behind the form.
 *  - SUBMIT IS SPEC-BOUND. submitGuest runs the shared FinalSubmitService in
 *    GUEST posture: the published spec IS the allow-list, so a crafted payload
 *    can't name an object or field; the insert is system-mode; guests never
 *    update (a saveMode='update' spec is refused).
 *
 * Availability windows (status/opensAt/closesAt) + honeypot spam check are
 * enforced here (A3). Response caps + per-window rate limiting are deferred.
 */
public without sharing class FinalGuestController {
    private static final String UNAVAILABLE = 'This form is not available.';

    @AuraEnabled(cacheable=true)
    public static String getGuestSpec(Id formId) {
        Form__c f = gate(formId);
        Form_Version__c version = activeVersion(f.Id);
        Map<String, Object> spec = parseSpec(version.Spec_JSON__c);
        // Availability (A3, helpers now shared via FinalSubmitService — one
        // truth for both controllers; S1 ruling 7-1 adds the response cap):
        // a closed / not-yet-open / past-window / capped form returns ONLY
        // the closed flag + message — never the form structure. NOTE:
        // cacheable, so a transition can serve a stale open/closed state to a
        // cached client — submitGuest re-checks server-side, the real guard.
        if (
            FinalSubmitService.isClosed(spec) ||
            FinalSubmitService.responseCapReached(spec, version.Id)
        ) {
            return JSON.serialize(
                new Map<String, Object>{
                    'closed' => true,
                    'closedMessage' => FinalSubmitService.closedMessage(spec)
                }
            );
        }
        projectForGuest(spec);
        rewriteImageUrls(spec);
        return JSON.serialize(spec);
    }

    public class GuestSubmitResult {
        @AuraEnabled
        public Boolean success;
        @AuraEnabled
        public Integer childCount;
        // deliberately NO recordId — a guest gets no record access, so the
        // client is never handed the created Id (data-oracle avoidance).
    }

    @AuraEnabled
    public static GuestSubmitResult submitGuest(Id formId, String payloadJson) {
        if (String.isBlank(payloadJson)) {
            throw new AuraHandledException('A submission payload is required.');
        }
        Form__c f = gate(formId); // re-gated: a replayed POST re-checks
        Form_Version__c version = activeVersion(f.Id);
        Map<String, Object> spec = parseSpec(version.Spec_JSON__c);

        // Availability (A3 + S1 cap): a closed/expired/capped form rejects
        // even a replayed POST server-side (the closed-screen client can't
        // reach here anyway). Cap re-checks HERE too — surveys go guest.
        if (
            FinalSubmitService.isClosed(spec) ||
            FinalSubmitService.responseCapReached(spec, version.Id)
        ) {
            throw new AuraHandledException(
                FinalSubmitService.closedMessage(spec)
            );
        }

        // Guests never update — a saveMode='update' spec is refused with the
        // same generic message (RUNTIME_NOTES: guest+update waits for tokens).
        Map<String, Object> form = asMap(spec.get('form'));
        String saveMode = form == null ? null : (String) form.get('saveMode');
        if (saveMode == 'update') {
            throw new AuraHandledException(UNAVAILABLE);
        }

        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(
                payloadJson
            );
        } catch (Exception e) {
            throw new AuraHandledException('The payload is not valid JSON.');
        }

        // Honeypot (A3): a filled hidden field means a bot. Return a FAKE
        // success (no record) so it learns nothing — the classic honeypot
        // posture (RUNTIME_NOTES spam layers). The host injects meta.hp.
        if (isHoneypotTripped(spec, payload)) {
            GuestSubmitResult fake = new GuestSubmitResult();
            fake.success = true;
            fake.childCount = 0;
            return fake;
        }

        // The link token rides `meta.rt` (same channel as the honeypot); the
        // server re-validates it cryptographically.
        Map<String, Object> tokenMeta = asMap(payload.get('meta'));
        String token = tokenMeta == null ? null : (String) tokenMeta.get('rt');
        String targetObject = surveyTargetObject(spec);
        FinalSurveyTokenService.Claims claims = (String.isBlank(token) ||
            String.isBlank(targetObject))
            ? null
            : validClaims(formId, token, targetObject);

        // SO-4 Tier 2 ENFORCEMENT: a tracked link that's revoked, expired, or
        // already used (single-use) is refused BEFORE anything saves — the
        // scanner law's "checked on submit too". A token carrying an invitation
        // whose full validation failed can't submit; stateless Tier 1 tokens and
        // tokenless submits are unaffected.
        FinalSurveyTokenService.Claims raw = String.isBlank(token)
            ? null
            : FinalSurveyTokenService.resolve(token);
        if (raw != null && raw.invitationId != null && claims == null) {
            throw new AuraHandledException(UNAVAILABLE);
        }

        FinalSubmitService.SubmitOutcome outcome = FinalSubmitService.run(
            spec,
            payload,
            version.Id, // the SERVER-loaded version identity (never client-claimed)
            FinalSubmitService.Posture.GUEST
        );

        // SO-4: STAMP the record reference onto the response — server-side, from
        // the VERIFIED TOKEN, never a raw client recordId. Guests still never
        // touch the business record (invariant 5); this only links our own
        // Form_Response__c so the customer's Flow can act on it.
        if (
            claims != null &&
            outcome.recordId != null &&
            outcome.recordId.getSObjectType() == Form_Response__c.SObjectType
        ) {
            stampRecordRef(outcome.recordId, claims.recordId, targetObject);
            // Tier 2: burn single-use + record responded time + emit the event.
            // Post-run (the response is saved), best-effort.
            if (claims.invitationId != null) {
                burnInvitation(claims.invitationId, formId, claims.recordId);
            }
        }

        GuestSubmitResult res = new GuestSubmitResult();
        res.success = true;
        res.childCount = outcome.childCount;
        return res;
    }

    /**
     * SO-4 guest record context: verdicts + author-opted prefill for a
     * link-holder. Any failure (no token, forged/expired/revoked, wrong form,
     * wrong object) degrades to an EMPTY context — the survey still renders and
     * record rows read "no match", indistinguishable from a plain link. The
     * survey must never break because a link went stale.
     */
    @AuraEnabled
    public static Map<String, Object> getGuestRecordContext(
        Id formId,
        String token
    ) {
        Map<String, Object> empty = new Map<String, Object>{
            'prefill' => new Map<String, Object>(),
            'ruleFacts' => new Map<String, Boolean>()
        };
        try {
            gate(formId); // published + guest-enabled, same hard gate
            Form_Version__c version = activeVersion(formId);
            Map<String, Object> spec = parseSpec(version.Spec_JSON__c);
            String targetObject = surveyTargetObject(spec);
            if (String.isBlank(targetObject)) {
                return empty;
            }
            FinalSurveyTokenService.Claims c = validClaims(
                formId,
                token,
                targetObject
            );
            if (c == null) {
                return empty;
            }
            return FinalGuestContextService.compute(
                spec,
                targetObject,
                c.recordId
            );
        } catch (Exception e) {
            return empty; // never leak why; never block the render
        }
    }

    // ----- SO-4 token helpers -----

    /** Resolve + fully validate a guest link token against this form and its
     *  object: signature, form match, expiry, the per-form kill switch
     *  (Links_Invalidated_On__c), and record sObjectType. null = not usable. */
    private static FinalSurveyTokenService.Claims validClaims(
        Id formId,
        String token,
        String targetObject
    ) {
        FinalSurveyTokenService.Claims c = FinalSurveyTokenService.resolve(
            token
        );
        if (c == null || c.formId != formId) {
            return null;
        }
        Long now = Datetime.now().getTime();
        if (c.expiry != null && c.expiry < now) {
            return null; // per-link expiry passed
        }
        // mass kill switch: any link issued before the cutoff is dead
        List<Form__c> forms = [
            SELECT Links_Invalidated_On__c
            FROM Form__c
            WHERE Id = :formId
            LIMIT 1
        ];
        if (!forms.isEmpty() && forms[0].Links_Invalidated_On__c != null) {
            Long cutoff = forms[0].Links_Invalidated_On__c.getTime();
            // <= so a link issued AT the cutoff instant is dead too:
            // revocation wins ties (safer boundary than letting it survive).
            if (c.issuedAt == null || c.issuedAt <= cutoff) {
                return null;
            }
        }
        // the record must belong to THIS survey's object
        Schema.SObjectType t = Schema.getGlobalDescribe()
            .get(targetObject.toLowerCase());
        if (t == null || c.recordId.getSObjectType() != t) {
            return null;
        }
        // SO-4 Tier 2: a tracked link is only valid while its invitation is.
        if (c.invitationId != null) {
            Survey_Invitation__c inv = loadInvitation(c.invitationId);
            if (
                inv == null ||
                inv.Revoked__c == true ||
                inv.Form__c != formId ||
                inv.Record_Id__c != String.valueOf(c.recordId) ||
                (inv.Expires_On__c != null &&
                inv.Expires_On__c < Datetime.now()) ||
                (inv.Single_Use__c == true &&
                inv.Responded_On__c != null)
            ) {
                return null; // revoked / expired / already used / mismatched
            }
        }
        return c;
    }

    /** Load a tracked invitation (guest, system context — the verified token is
     *  the authorization; a guest has no sharing to the row). */
    private static Survey_Invitation__c loadInvitation(Id invitationId) {
        List<Survey_Invitation__c> rows = [
            SELECT
                Id,
                Form__c,
                Record_Id__c,
                Revoked__c,
                Single_Use__c,
                Expires_On__c,
                Responded_On__c
            FROM Survey_Invitation__c
            WHERE Id = :invitationId
            LIMIT 1
        ];
        return rows.isEmpty() ? null : rows[0];
    }

    /** Stamp the token-sourced record ref onto the just-created response
     *  (claims already validated by the caller). Best-effort. */
    private static void stampRecordRef(
        Id responseId,
        Id recordId,
        String targetObject
    ) {
        try {
            Database.update(
                new List<Form_Response__c>{
                    new Form_Response__c(
                        Id = responseId,
                        Related_Record_Id__c = String.valueOf(recordId),
                        Related_Record_Type__c = targetObject
                    )
                },
                true,
                AccessLevel.SYSTEM_MODE
            );
        } catch (Exception e) {
            System.debug(
                LoggingLevel.WARN,
                'SO-4 record-ref stamp skipped: ' + e.getMessage()
            );
        }
    }

    /** SO-4 Tier 2: stamp Responded_On (the single-use burn + tracking marker)
     *  the FIRST time this invitation submits, and emit the 'responded' event.
     *  Post-run + best-effort — the response is already saved. */
    private static void burnInvitation(
        Id invitationId,
        Id formId,
        Id recordId
    ) {
        try {
            List<Survey_Invitation__c> rows = [
                SELECT Id, Responded_On__c
                FROM Survey_Invitation__c
                WHERE Id = :invitationId
                LIMIT 1
            ];
            if (!rows.isEmpty() && rows[0].Responded_On__c == null) {
                rows[0].Responded_On__c = Datetime.now();
                Database.update(rows, true, AccessLevel.SYSTEM_MODE);
            }
            FinalSurveyInvitationService.publishEvent(
                'responded',
                formId,
                invitationId,
                recordId
            );
        } catch (Exception e) {
            System.debug(
                LoggingLevel.WARN,
                'SO-4 invitation burn skipped: ' + e.getMessage()
            );
        }
    }

    /** targetObject for a survey spec, or null (forms/no object). */
    private static String surveyTargetObject(Map<String, Object> spec) {
        Map<String, Object> form = asMap(spec.get('form'));
        if (form == null || form.get('type') != 'survey') {
            return null;
        }
        String obj = (String) form.get('targetObject');
        return String.isBlank(obj) ? null : obj;
    }

    // ----- spam (A3) — availability helpers moved to FinalSubmitService
    // (S1 ruling 7-1: ONE truth shared by both controllers) -----

    /** True only when the form opts into honeypot AND the bait field carries a
     *  value (real users never see or fill it). */
    private static Boolean isHoneypotTripped(
        Map<String, Object> spec,
        Map<String, Object> payload
    ) {
        Map<String, Object> settings = asMap(spec.get('settings'));
        Object mode = settings == null ? null : settings.get('spamProtection');
        if (mode != 'honeypot') {
            return false;
        }
        Map<String, Object> meta = asMap(payload.get('meta'));
        Object hp = meta == null ? null : meta.get('hp');
        return hp instanceof String && String.isNotBlank((String) hp);
    }

    // ----- gate + spec load -----

    /** The hard gate. Returns the gated Form or throws the generic message. */
    private static Form__c gate(Id formId) {
        if (formId == null) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        List<Form__c> forms = [
            SELECT Id, Status__c, Allowed_Adapters__c
            FROM Form__c
            WHERE Id = :formId
            LIMIT 1
        ];
        if (forms.isEmpty()) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        Form__c f = forms[0];
        Boolean isPublic =
            String.isNotBlank(f.Allowed_Adapters__c) &&
            f.Allowed_Adapters__c.contains('Public_Guest');
        if (f.Status__c != 'Published' || !isPublic) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        return f;
    }

    /** Active version (Id + spec) — read in system context (a guest can't
     *  see Form_Version__c via sharing; the gate above is the trust check).
     *  Returns the RECORD so submits anchor to the SERVER-loaded version. */
    private static Form_Version__c activeVersion(Id formId) {
        List<Form_Version__c> versions = [
            SELECT Id, Spec_JSON__c
            FROM Form_Version__c
            WHERE Form__c = :formId AND Is_Active__c = TRUE
            ORDER BY Version_Number__c DESC
            LIMIT 1
        ];
        if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        return versions[0];
    }

    private static Map<String, Object> parseSpec(String specJson) {
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(specJson);
        } catch (Exception e) {
            throw new AuraHandledException(UNAVAILABLE);
        }
    }

    // ----- projection: strip everything a guest must not see -----

    /**
     * Mutates the spec in place, removing the binding-layer vocabulary before
     * it reaches the client: field API names (`element.binding`), the target
     * and repeat-child object names, and prefill config. Display keys, layout,
     * theme tokens, header, and completion copy all stay.
     */
    private static void projectForGuest(Map<String, Object> spec) {
        Map<String, Object> form = asMap(spec.get('form'));
        if (form != null) {
            form.remove('targetObject');
            form.remove('updateTarget');
        }
        Map<String, Object> settings = asMap(spec.get('settings'));
        if (settings != null) {
            settings.remove('prefill');
            // availability is SERVER-enforced (getGuestSpec/submitGuest); the
            // client never needs the window/cap. spamProtection STAYS — the
            // host reads it to render the honeypot.
            settings.remove('availability');
        }
        for (Object pageObj : asList(spec.get('pages'))) {
            Map<String, Object> page = asMap(pageObj);
            if (page == null) {
                continue;
            }
            for (Object secObj : asList(page.get('sections'))) {
                Map<String, Object> sec = asMap(secObj);
                if (sec == null) {
                    continue;
                }
                Map<String, Object> repeat = asMap(sec.get('repeat'));
                if (repeat != null) {
                    repeat.remove('childObject');
                    repeat.remove('relationshipField');
                }
                for (Object elObj : asList(sec.get('elements'))) {
                    Map<String, Object> el = asMap(elObj);
                    if (el != null) {
                        el.remove('binding');
                    }
                }
            }
        }
    }

    // ----- serve-time image URL rewrite (IMPL_PLAN find #4) -----

    /**
     * Config images freeze their public-ness at UPLOAD time
     * (FinalAssetController): a logo uploaded while the form was private
     * carries an internal shepherd URL that 403s for guests. Here, for every
     * spec image that stored a `contentVersionId`, swap in that version's
     * public ContentDistribution URL when one exists. Read-only (cacheable-
     * safe). A missing distribution passes the URL through unchanged — it
     * renders broken until the A1.5 Public-link toggle re-mints it.
     */
    private static void rewriteImageUrls(Map<String, Object> spec) {
        Set<Id> cvIds = new Set<Id>();
        collectCvIds(spec, cvIds);
        if (cvIds.isEmpty()) {
            return;
        }
        Map<Id, String> publicUrl = new Map<Id, String>();
        for (ContentDistribution cd : [
            SELECT ContentVersionId, ContentDownloadUrl
            FROM ContentDistribution
            WHERE ContentVersionId IN :cvIds
        ]) {
            if (String.isNotBlank(cd.ContentDownloadUrl)) {
                publicUrl.put(cd.ContentVersionId, cd.ContentDownloadUrl);
            }
        }
        if (!publicUrl.isEmpty()) {
            applyImageUrls(spec, publicUrl);
        }
    }

    /** Recursively gather every `contentVersionId` value in the spec tree. */
    private static void collectCvIds(Object node, Set<Id> out) {
        if (node instanceof Map<String, Object>) {
            Map<String, Object> m = (Map<String, Object>) node;
            Object cv = m.get('contentVersionId');
            if (cv instanceof String && String.isNotBlank((String) cv)) {
                try {
                    out.add((Id) (String) cv);
                } catch (Exception ignored) {
                    // a malformed id is simply not rewritten
                }
            }
            for (Object v : m.values()) {
                collectCvIds(v, out);
            }
        } else if (node instanceof List<Object>) {
            for (Object v : (List<Object>) node) {
                collectCvIds(v, out);
            }
        }
    }

    /** Recursively replace `url` on any node that carries a known cv id. */
    private static void applyImageUrls(Object node, Map<Id, String> publicUrl) {
        if (node instanceof Map<String, Object>) {
            Map<String, Object> m = (Map<String, Object>) node;
            Object cv = m.get('contentVersionId');
            if (cv instanceof String) {
                Id cvId = null;
                try {
                    cvId = (Id) (String) cv;
                } catch (Exception ignored) {
                    cvId = null;
                }
                if (cvId != null && publicUrl.containsKey(cvId)) {
                    m.put('url', publicUrl.get(cvId));
                }
            }
            for (Object v : m.values()) {
                applyImageUrls(v, publicUrl);
            }
        } else if (node instanceof List<Object>) {
            for (Object v : (List<Object>) node) {
                applyImageUrls(v, publicUrl);
            }
        }
    }

    // ----- helpers -----

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }

    private static List<Object> asList(Object o) {
        return o instanceof List<Object>
            ? (List<Object>) o
            : new List<Object>();
    }
}
