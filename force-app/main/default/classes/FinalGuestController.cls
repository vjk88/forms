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
    private static final String VERSION_CHANGED = 'This form changed. Reload it before submitting.';

    // BEGIN RUNTIME_LABEL_NAMES
    // The Custom Labels the respondent runtime reads (labels/
    // CustomLabels.labels-meta.xml). A jest test keeps this list in sync with
    // the metadata file and c/finalTranslate/defaults.js.
    @TestVisible
    private static final List<String> RUNTIME_LABEL_NAMES = new List<String>{
        'Final_Run_Submit',
        'Final_Run_Next',
        'Final_Run_Back',
        'Final_Run_Continue',
        'Final_Run_Submitting',
        'Final_Run_Retry',
        'Final_Run_TryAgain',
        'Final_Run_Cancel',
        'Final_Run_Delete',
        'Final_Run_Undo',
        'Final_Run_Required',
        'Final_Run_Logo',
        'Final_Run_PageOf',
        'Final_Run_StepOf',
        'Final_Run_StepN',
        'Final_Run_Pages',
        'Final_Run_FormPages',
        'Final_Run_FormSteps',
        'Final_Run_PressCtrlEnter',
        'Final_Run_PressReturn',
        'Final_Run_ExpandCollapse',
        'Final_Run_LoadingForm',
        'Final_Run_LoadingRecord',
        'Final_Run_FillingDetails',
        'Final_Run_FormCouldNotLoad',
        'Final_Run_FormUnavailable',
        'Final_Run_FormClosed',
        'Final_Run_UnsupportedSpec',
        'Final_Run_WrongPageCreate',
        'Final_Run_WrongPageEdit',
        'Final_Run_SurveyNeedsRecord',
        'Final_Run_EditNeedsRecord',
        'Final_Run_RecordLoadFailed',
        'Final_Run_AutofillFailed',
        'Final_Run_SaveFailed',
        'Final_Run_AnswersRejected',
        'Final_Run_AnswerRejected',
        'Final_Run_CheckSelection',
        'Final_Run_FixFieldsContinueOne',
        'Final_Run_FixFieldsContinueMany',
        'Final_Run_FixFieldsSubmitOne',
        'Final_Run_FixFieldsSubmitMany',
        'Final_Run_ValueNotValid',
        'Final_Run_PleaseAnswer',
        'Final_Run_MinEntriesOne',
        'Final_Run_MinEntriesMany',
        'Final_Run_Success',
        'Final_Run_ThankYou',
        'Final_Run_RedirectIn',
        'Final_Run_DestRecord',
        'Final_Run_DestUrl',
        'Final_Run_RecordNoun',
        'Final_Run_PluralOf',
        'Final_Run_ListNoYet',
        'Final_Run_ListLoading',
        'Final_Run_ListLoadFailed',
        'Final_Run_ListHoldsUpTo',
        'Final_Run_ListShowingAdd',
        'Final_Run_ListShowing',
        'Final_Run_OpenRecord',
        'Final_Run_OpenOne',
        'Final_Run_OpensNewTab',
        'Final_Run_NoValue',
        'Final_Run_ViewAll',
        'Final_Run_Row',
        'Final_Run_Actions',
        'Final_Run_New',
        'Final_Run_NewEntry',
        'Final_Run_ViewOnly',
        'Final_Run_ViewOnlySr',
        'Final_Run_Open',
        'Final_Run_EntryDefault',
        'Final_Run_AddAnother',
        'Final_Run_RemoveEntry',
        'Final_Run_RowN',
        'Final_Run_NameN',
        'Final_Run_DeleteConflict',
        'Final_Run_WillBeDeleted',
        'Final_Run_DeleteRowAria',
        'Final_Run_DeleteRowConfirm',
        'Final_Run_UndoDeleteAria',
        'Final_Run_OwnAnswerPlaceholder',
        'Final_Run_Other',
        'Final_Run_ThisQuestion',
        'Final_Run_OtherAria',
        'Final_Run_Untitled',
        'Final_Run_UnsupportedElement',
        'Final_Run_Yes',
        'Final_Run_No',
        'Final_Run_VeryUnhappy',
        'Final_Run_Unhappy',
        'Final_Run_Neutral',
        'Final_Run_Happy',
        'Final_Run_VeryHappy',
        'Final_Run_StronglyDisagree',
        'Final_Run_Disagree',
        'Final_Run_Agree',
        'Final_Run_StronglyAgree',
        'Final_Run_EmojiOf',
        'Final_Run_ScaleEnd',
        'Final_Run_ScaleRange',
        'Final_Run_SliderRange',
        'Final_Run_MoveUp',
        'Final_Run_MoveDown',
        'Final_Run_AddFile',
        'Final_Run_AddFiles',
        'Final_Run_FileUpTo',
        'Final_Run_FileHintAny',
        'Final_Run_FileHintAccept',
        'Final_Run_RemoveFile',
        'Final_Run_FileReadFailed',
        'Final_Run_FileTooLarge',
        'Final_Run_SearchPlaceholder',
        'Final_Run_ClearNamed',
        'Final_Run_ClearSelection',
        'Final_Run_ResultsNamed',
        'Final_Run_SearchResults',
        'Final_Run_ThisSelection',
        'Final_Run_SelectionStale',
        'Final_Run_Searching',
        'Final_Run_TypeMore',
        'Final_Run_NoMatches',
        'Final_Run_ResultOne',
        'Final_Run_ResultsMany',
        'Final_Run_Language'
    };
    // END RUNTIME_LABEL_NAMES

    /**
     * The built-in respondent words (Custom Labels named Final_Run_*) in ONE
     * language, for guests and ?lang= links. A Custom Label resolves to the
     * RUNNING user's language, and a guest is the site's guest user, so the
     * browser could never change them; this reads each label in the asked
     * language instead. Only names that have a translation are returned, so the
     * English imports in the browser stay the fallback. Touches no data.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, String> runtimeLabels(String lang) {
        Map<String, String> out = new Map<String, String>();
        String code = normalizeLang(lang);
        if (code == null) {
            return out;
        }
        String ns = labelNamespace();
        try {
            for (String name : RUNTIME_LABEL_NAMES) {
                if (System.Label.translationExists(ns, name, code)) {
                    out.put(name, System.Label.get(ns, name, code));
                }
            }
        } catch (Exception e) {
            // a language the org does not support: no translations, no error
            return new Map<String, String>();
        }
        return out;
    }

    /** "fr", "fr_CA" or "fr-CA" -> "fr" / "fr_CA"; anything else -> null. */
    @TestVisible
    private static String normalizeLang(String lang) {
        if (
            String.isBlank(lang) ||
            !Pattern.matches('^[a-z]{2,3}([_-][A-Za-z]{2})?$', lang.trim())
        ) {
            return null;
        }
        List<String> parts = lang.trim().split('[_-]');
        return parts.size() > 1
            ? parts[0] + '_' + parts[1].toUpperCase()
            : parts[0];
    }

    /** The package namespace ('' when unmanaged), from this class's own name. */
    private static String labelNamespace() {
        String full = FinalGuestController.class.getName();
        Integer dot = full.indexOf('.');
        return dot > 0 ? full.substring(0, dot) : '';
    }

    @AuraEnabled(cacheable=true)
    public static String getGuestSpec(Id formId) {
        Form__c f = gate(formId);
        Form_Version__c version = activeVersion(f.Id);
        Map<String, Object> spec = parseSpec(FinalSpecStore.read(version));
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

    /**
     * Imperative, non-cacheable runtime spec endpoint.
     * Returns { versionId, spec, closed, closedMessage }.
     */
    @AuraEnabled
    public static Map<String, Object> getGuestRuntimeSpec(Id formId) {
        return getGuestRuntimeSpecForLangs(formId, null);
    }

    /**
     * getGuestRuntimeSpec plus the visitor's language candidates, in order
     * (link param first, then browser languages). Only the closed message
     * uses them: the first language the form offers decides which
     * translation of `closed.message` comes back (FinalSpecLanguage). A
     * separate method because an @AuraEnabled method cannot be overloaded.
     */
    @AuraEnabled
    public static Map<String, Object> getGuestRuntimeSpecForLangs(
        Id formId,
        List<String> langs
    ) {
        Form__c f = gate(formId);
        Form_Version__c version = activeVersion(f.Id);
        Map<String, Object> spec = parseSpec(FinalSpecStore.read(version));
        if (
            FinalSubmitService.isClosed(spec) ||
            FinalSubmitService.responseCapReached(spec, version.Id)
        ) {
            return new Map<String, Object>{
                'versionId' => version.Id,
                'closed' => true,
                'closedMessage' => FinalSpecLanguage.text(
                    spec,
                    FinalSpecLanguage.pick(spec, langs),
                    'closed.message',
                    FinalSubmitService.closedMessage(spec)
                )
            };
        }
        projectForGuest(spec);
        rewriteImageUrls(spec);
        return new Map<String, Object>{
            'versionId' => version.Id,
            'spec' => spec
        };
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
        Map<String, Object> spec = parseSpec(FinalSpecStore.read(version));

        Map<String, Object> payload;
        try {
            payload = (Map<String, Object>) JSON.deserializeUntyped(
                payloadJson
            );
        } catch (Exception e) {
            throw new AuraHandledException('The payload is not valid JSON.');
        }
        Map<String, Object> meta = asMap(payload.get('meta'));

        // A retry of an attempt that ALREADY LANDED is answered from the
        // store before availability is judged. The person submitted in time;
        // it was their confirmation that went missing, not their answer. The
        // ordering matters most for the submission that took the last slot -
        // without this it is told the form is full by its own earlier self.
        FinalSubmitService.SubmitOutcome stored = FinalSubmitService.existingSubmission(
            getStr(meta, 'submissionKey'),
            f.Id
        );
        if (stored != null) {
            GuestSubmitResult again = new GuestSubmitResult();
            again.success = true;
            again.childCount = stored.childCount;
            return again;
        }

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

        // The browser tells us which version it rendered. When that is not
        // the version now live, the questions on screen were a DIFFERENT set:
        // storing those answers against the live spec drops the ones it no
        // longer declares, re-types the ones whose type changed, and stamps
        // the submission with a version the person never saw - so the reader
        // would later replay it in wording they were never asked.
        //
        // This used to run only when Autofill rules were enabled. Freeform
        // has no Autofill in F1, so on a Freeform it never ran at all.
        String claimedVersionId = getStr(meta, 'specVersionId');
        if (
            String.isNotBlank(claimedVersionId) &&
            claimedVersionId != version.Id
        ) {
            throw new AuraHandledException(VERSION_CHANGED);
        }
        // Autofill additionally REQUIRES the client to say which version it
        // had: a stale prefill can carry values the live spec never authorized.
        if (String.isBlank(claimedVersionId) && hasEnabledAutofill(spec)) {
            throw new AuraHandledException(VERSION_CHANGED);
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

        // The link token rides `meta.rt` (same channel as the honeypot). All
        // link checks live in FinalLinkService, shared with signed-in submits:
        // a revoked/expired/used tracked link is refused BEFORE anything saves,
        // a single-use link burns, and the response gets the link's record.
        String token = getStr(meta, 'rt');
        FinalLinkService.LinkSubmit link;
        try {
            link = FinalLinkService.beginSubmit(formId, spec, token);
        } catch (FinalLinkService.LinkException e) {
            throw new AuraHandledException(UNAVAILABLE);
        }

        FinalSubmitService.SubmitOutcome outcome;
        try {
            outcome = FinalSubmitService.run(
                spec,
                payload,
                version.Id, // the SERVER-loaded version identity (never client-claimed)
                FinalSubmitService.Posture.GUEST
            );
        } catch (Exception e) {
            link.rollback();
            throw e;
        }
        try {
            link.finish(outcome.recordId);
        } catch (FinalLinkService.LinkException e) {
            throw new AuraHandledException(UNAVAILABLE);
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
            Map<String, Object> spec = parseSpec(FinalSpecStore.read(version));
            String targetObject = FinalLinkService.surveyTargetObject(spec);
            if (String.isBlank(targetObject)) {
                return empty;
            }
            FinalSurveyTokenService.Claims c = FinalLinkService.validClaims(
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

    /**
     * Version-aware guest autofill context endpoint (IMPL_PLAN_AUTOFILL_RULES §7).
     * Non-cacheable. Returns { versionId, status, prefill, ruleFacts, autofill }.
     * Statuses: 'applied', 'empty', 'unavailable', 'versionChanged'.
     */
    @AuraEnabled
    public static Map<String, Object> getGuestAutofillContext(
        Id formId,
        Id versionId,
        String token
    ) {
        try {
            Form__c f = gate(formId);
            Form_Version__c version = activeVersion(f.Id);
            if (versionId == null || versionId != version.Id) {
                return new Map<String, Object>{
                    'versionId' => version.Id,
                    'status' => 'versionChanged',
                    'prefill' => new Map<String, Object>(),
                    'ruleFacts' => new Map<String, Boolean>(),
                    'autofill' => new List<Object>()
                };
            }

            // Links are shared with signed-in users: FinalLinkService.
            return FinalLinkService.contextFor(f.Id, version, token);
        } catch (Exception e) {
            return new Map<String, Object>{
                'versionId' => versionId,
                'status' => 'unavailable',
                'prefill' => new Map<String, Object>(),
                'ruleFacts' => new Map<String, Boolean>(),
                'autofill' => new List<Object>()
            };
        }
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
            // Form_Type__c + Primary_Context_Object__c feed the Autofill link
            // contract, which the guest path must resolve from THIS gated read
            // rather than re-querying in user mode (review R2).
            SELECT
                Id,
                Status__c,
                Allowed_Adapters__c,
                Form_Type__c,
                Primary_Context_Object__c
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
            SELECT Id, Spec_JSON__c, Spec_JSON_2__c, Spec_JSON_3__c
            FROM Form_Version__c
            WHERE Form__c = :formId AND Is_Active__c = TRUE
            ORDER BY Version_Number__c DESC
            LIMIT 1
        ];
        if (
            versions.isEmpty() ||
            String.isBlank(FinalSpecStore.read(versions[0]))
        ) {
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
        // Which objects and fields a form writes, and how it searches for
        // records, are never a guest's business (F2 plan, decision 2).
        spec.remove('mapping');
        Map<String, Object> form = asMap(spec.get('form'));
        if (form != null) {
            form.remove('targetObject');
            form.remove('updateTarget');
        }
        Map<String, Object> settings = asMap(spec.get('settings'));
        if (settings != null) {
            Map<String, Object> prefill = asMap(settings.get('prefill'));
            List<Object> rules = prefill != null
                ? asList(prefill.get('autofillRules'))
                : null;
            if (rules != null && !rules.isEmpty()) {
                List<Map<String, Object>> sanitizedRules = new List<Map<String, Object>>();
                for (Object rObj : rules) {
                    Map<String, Object> rule = asMap(rObj);
                    if (rule == null || rule.get('enabled') != true)
                        continue;
                    Map<String, Object> source = asMap(rule.get('source'));
                    String sType = source != null
                        ? (String) source.get('type')
                        : null;
                    List<String> dests = new List<String>();
                    for (Object mObj : asList(rule.get('mappings'))) {
                        Map<String, Object> m = asMap(mObj);
                        if (m == null)
                            continue;
                        if (sType == 'link') {
                            if (
                                m.get('guestAllowed') == true &&
                                m.get('to') != null
                            ) {
                                dests.add((String) m.get('to'));
                            }
                        } else {
                            if (m.get('to') != null) {
                                dests.add((String) m.get('to'));
                            }
                        }
                    }
                    sanitizedRules.add(
                        new Map<String, Object>{
                            'ruleId' => (String) rule.get('id'),
                            'sourceType' => sType,
                            'policy' => rule.get('policy') != null
                                ? (String) rule.get('policy')
                                : 'preserveEdits',
                            'destinationElementIds' => dests
                        }
                    );
                }
                if (!sanitizedRules.isEmpty()) {
                    Map<String, Object> runtime = asMap(spec.get('runtime'));
                    if (runtime == null) {
                        runtime = new Map<String, Object>();
                        spec.put('runtime', runtime);
                    }
                    runtime.put('autofill', sanitizedRules);
                }
            }
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

    /** A string field of an untyped map, or null - never a cast error. */
    private static String getStr(Map<String, Object> m, String key) {
        Object v = m == null ? null : m.get(key);
        return v instanceof String ? (String) v : null;
    }

    /** Does the published spec turn on at least one Autofill rule? */
    private static Boolean hasEnabledAutofill(Map<String, Object> spec) {
        Map<String, Object> settings = asMap(spec.get('settings'));
        Map<String, Object> prefill = settings == null
            ? null
            : asMap(settings.get('prefill'));
        if (prefill == null) {
            return false;
        }
        for (Object rObj : asList(prefill.get('autofillRules'))) {
            Map<String, Object> r = asMap(rObj);
            if (r != null && r.get('enabled') == true) {
                return true;
            }
        }
        return false;
    }

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
