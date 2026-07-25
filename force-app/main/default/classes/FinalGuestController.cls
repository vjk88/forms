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
 * Availability windows, response caps, and spam checks land in slice A3.
 */
public without sharing class FinalGuestController {
    private static final String UNAVAILABLE = 'This form is not available.';

    @AuraEnabled(cacheable=true)
    public static String getGuestSpec(Id formId) {
        Form__c f = gate(formId);
        Map<String, Object> spec = parseActiveSpec(f.Id);
        // Availability (A3): a closed / not-yet-open / past-window form returns
        // ONLY the closed flag + message — never the form structure (a visitor
        // who can't submit gets no projection to inspect). The host renders the
        // closed screen; the viewer never mounts. NOTE: cacheable, so a time-
        // window transition can serve a stale open/closed state to a cached
        // client — submitGuest re-checks server-side, which is the real guard.
        if (isClosed(spec)) {
            return JSON.serialize(
                new Map<String, Object>{
                    'closed' => true,
                    'closedMessage' => closedMessage(spec)
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
        Map<String, Object> spec = parseActiveSpec(f.Id);

        // Availability (A3): a closed/expired form rejects even a replayed POST
        // server-side (the closed-screen client can't reach here anyway).
        if (isClosed(spec)) {
            throw new AuraHandledException(closedMessage(spec));
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

        FinalSubmitService.SubmitOutcome outcome = FinalSubmitService.run(
            spec,
            payload,
            FinalSubmitService.Posture.GUEST
        );

        GuestSubmitResult res = new GuestSubmitResult();
        res.success = true;
        res.childCount = outcome.childCount;
        return res;
    }

    // ----- availability + spam (A3) -----

    /** Closed = manual status='closed', OR before opensAt, OR after closesAt.
     *  Missing/blank window bounds are simply not applied. */
    private static Boolean isClosed(Map<String, Object> spec) {
        Map<String, Object> avail = availability(spec);
        if (avail == null) {
            return false;
        }
        if ((String) avail.get('status') == 'closed') {
            return true;
        }
        Datetime now = Datetime.now();
        Datetime opensAt = parseIso((String) avail.get('opensAt'));
        Datetime closesAt = parseIso((String) avail.get('closesAt'));
        return (opensAt != null && now < opensAt) ||
            (closesAt != null &&
            now > closesAt);
    }

    private static String closedMessage(Map<String, Object> spec) {
        Map<String, Object> avail = availability(spec);
        Object msg = avail == null ? null : avail.get('closedMessage');
        return msg instanceof String && String.isNotBlank((String) msg)
            ? (String) msg
            : 'This form is no longer accepting responses.';
    }

    private static Map<String, Object> availability(Map<String, Object> spec) {
        Map<String, Object> settings = asMap(spec.get('settings'));
        return settings == null ? null : asMap(settings.get('availability'));
    }

    /** ISO-8601 → Datetime; blank/garbage → null (never a crash). */
    private static Datetime parseIso(String s) {
        if (String.isBlank(s)) {
            return null;
        }
        try {
            return (Datetime) JSON.deserialize('"' + s + '"', Datetime.class);
        } catch (Exception e) {
            return null;
        }
    }

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

    /** Active version's parsed spec — read in system context (a guest can't
     *  see Form_Version__c via sharing; the gate above is the trust check). */
    private static Map<String, Object> parseActiveSpec(Id formId) {
        List<Form_Version__c> versions = [
            SELECT Spec_JSON__c
            FROM Form_Version__c
            WHERE Form__c = :formId AND Is_Active__c = TRUE
            ORDER BY Version_Number__c DESC
            LIMIT 1
        ];
        if (versions.isEmpty() || String.isBlank(versions[0].Spec_JSON__c)) {
            throw new AuraHandledException(UNAVAILABLE);
        }
        try {
            return (Map<String, Object>) JSON.deserializeUntyped(
                versions[0].Spec_JSON__c
            );
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
