/**
 * FinalLinkService — personalized record links (?c__rt=), shared by every host.
 *
 * A link works the same for a guest on the public site and a signed-in user
 * inside Salesforce (owner 2026-09-15). The TOKEN is the permission: it fills
 * the same values for everyone, and it works on forms that are not public.
 * Guest-only gates (Published + Public_Guest) stay in FinalGuestController;
 * this class holds only the link logic both hosts need.
 *
 * `without sharing`: a verified token authorizes reading its form, record and
 * invitation. Neither a guest nor an arbitrary respondent has sharing to them.
 */
public without sharing class FinalLinkService {
    /** A link the caller must refuse (revoked / expired / used / forged
     *  tracked link, or a failed single-use burn). Callers choose the wording. */
    public class LinkException extends Exception {
    }

    // ----- load: what the link fills in -----

    /**
     * Values + rule verdicts for a link-holder, against the given active
     * version. Returns { versionId, status, prefill, ruleFacts, autofill };
     * status is 'applied', 'empty' (no token) or 'unavailable'. Any failure
     * degrades to 'unavailable' — a stale link must never break the form.
     */
    public static Map<String, Object> contextFor(
        Id formId,
        Form_Version__c version,
        String token
    ) {
        if (String.isBlank(token)) {
            return context(version.Id, 'empty');
        }
        try {
            // Parse before any projection: projectForGuest strips
            // settings.prefill in place.
            Map<String, Object> activeSpec = parseSpec(version.Spec_JSON__c);

            // R9 — a closed/capped form discloses nothing, even to a valid link.
            if (
                FinalSubmitService.isClosed(activeSpec) ||
                FinalSubmitService.responseCapReached(activeSpec, version.Id)
            ) {
                return context(version.Id, 'unavailable');
            }

            Form__c f = loadForm(formId);
            FinalAutofillService.LinkSourceContract contract = f == null
                ? null
                : FinalAutofillService.resolveLinkSourceFromSpec(
                      activeSpec,
                      f.Form_Type__c,
                      f.Primary_Context_Object__c
                  );
            if (contract == null || String.isBlank(contract.objectApiName)) {
                return context(version.Id, 'unavailable');
            }
            String targetObject = contract.objectApiName;

            FinalSurveyTokenService.Claims c = validClaims(
                formId,
                token,
                targetObject
            );
            if (c == null) {
                return context(version.Id, 'unavailable');
            }

            Map<String, Object> computed = FinalGuestContextService.compute(
                parseSpec(version.Spec_JSON__c),
                targetObject,
                c.recordId
            );
            if (computed.get('recordFound') == false) {
                return context(version.Id, 'unavailable');
            }

            Map<String, Object> res = context(version.Id, 'applied');
            if (computed.get('prefill') != null) {
                res.put('prefill', computed.get('prefill'));
            }
            if (computed.get('ruleFacts') != null) {
                res.put('ruleFacts', computed.get('ruleFacts'));
            }
            if (computed.get('autofill') != null) {
                res.put('autofill', computed.get('autofill'));
            }
            return res;
        } catch (Exception e) {
            return context(version.Id, 'unavailable');
        }
    }

    /** An empty context with the given status. */
    public static Map<String, Object> context(Id versionId, String status) {
        return new Map<String, Object>{
            'versionId' => versionId,
            'status' => status,
            'prefill' => new Map<String, Object>(),
            'ruleFacts' => new Map<String, Boolean>(),
            'autofill' => new List<Object>()
        };
    }

    // ----- submit: enforce, burn, stamp -----

    /** One submit's link state. `begin` checks and locks; `finish` burns +
     *  stamps after the response saved; `rollback` undoes on failure. */
    public class LinkSubmit {
        public Id formId;
        public String targetObject;
        public FinalSurveyTokenService.Claims claims;
        public Survey_Invitation__c lockedInv;
        public Savepoint sp;

        public void rollback() {
            if (sp != null) {
                Database.rollback(sp);
            }
        }

        /** After a SAVED response: burn a tracked invitation (the single-use
         *  marker), then stamp the link's record onto the response. */
        public void finish(Id responseId) {
            if (lockedInv != null) {
                try {
                    if (lockedInv.Responded_On__c == null) {
                        lockedInv.Responded_On__c = Datetime.now();
                        Database.update(
                            new List<Survey_Invitation__c>{ lockedInv },
                            true,
                            AccessLevel.SYSTEM_MODE
                        );
                    }
                } catch (Exception e) {
                    rollback();
                    throw new LinkException('Invitation burn failed.');
                }
                FinalSurveyInvitationService.publishEvent(
                    'responded',
                    formId,
                    lockedInv.Id,
                    claims.recordId
                );
            }
            // SO-4: the record ref comes from the VERIFIED TOKEN, never a raw
            // client recordId. It links our own Form_Response__c only.
            if (
                claims != null &&
                responseId != null &&
                responseId.getSObjectType() == Form_Response__c.SObjectType
            ) {
                stampRecordRef(responseId, claims.recordId, targetObject);
            }
        }
    }

    /**
     * Checks a submit's link BEFORE anything saves. A tracked link that is
     * revoked, expired or already used throws LinkException; a stateless link
     * that doesn't validate is ignored (the response saves without a record
     * ref, same as a plain URL). A valid tracked link is row-locked
     * (FOR UPDATE) so two submits can't both use a single-use invitation.
     */
    public static LinkSubmit beginSubmit(
        Id formId,
        Map<String, Object> spec,
        String token
    ) {
        LinkSubmit ls = new LinkSubmit();
        ls.formId = formId;
        if (String.isBlank(token)) {
            return ls;
        }
        ls.targetObject = surveyTargetObject(spec);
        if (String.isBlank(ls.targetObject)) {
            Form__c f = loadForm(formId);
            FinalAutofillService.LinkSourceContract contract = f == null
                ? null
                : FinalAutofillService.resolveLinkSourceFromSpec(
                      spec,
                      f.Form_Type__c,
                      f.Primary_Context_Object__c
                  );
            if (contract != null) {
                ls.targetObject = contract.objectApiName;
            }
        }
        ls.claims = String.isBlank(ls.targetObject)
            ? null
            : validClaims(formId, token, ls.targetObject);

        // SO-4 Tier 2: a token carrying an invitation that failed full
        // validation can't submit. Stateless Tier 1 tokens are unaffected.
        FinalSurveyTokenService.Claims raw = FinalSurveyTokenService.resolve(
            token
        );
        if (raw != null && raw.invitationId != null && ls.claims == null) {
            throw new LinkException('Link not usable.');
        }

        if (ls.claims != null && ls.claims.invitationId != null) {
            List<Survey_Invitation__c> invRows = [
                SELECT
                    Id,
                    Form__c,
                    Record_Id__c,
                    Revoked__c,
                    Single_Use__c,
                    Expires_On__c,
                    Responded_On__c
                FROM Survey_Invitation__c
                WHERE Id = :ls.claims.invitationId
                LIMIT 1
                FOR UPDATE
            ];
            if (
                invRows.isEmpty() ||
                invRows[0].Revoked__c == true ||
                invRows[0].Form__c != formId ||
                (invRows[0].Single_Use__c == true &&
                invRows[0].Responded_On__c != null) ||
                (invRows[0].Expires_On__c != null &&
                invRows[0].Expires_On__c < Datetime.now())
            ) {
                throw new LinkException('Link not usable.');
            }
            ls.lockedInv = invRows[0];
            ls.sp = Database.setSavepoint();
        }
        return ls;
    }

    // ----- token validation -----

    /** Resolve + fully validate a link token against this form and its
     *  object: signature, form match, expiry, the per-form kill switch
     *  (Links_Invalidated_On__c), and record sObjectType. null = not usable. */
    public static FinalSurveyTokenService.Claims validClaims(
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
        // the record must belong to THIS form's link object
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

    /** targetObject for a survey spec, or null (forms/no object). */
    public static String surveyTargetObject(Map<String, Object> spec) {
        Map<String, Object> form = spec == null
            ? null
            : asMap(spec.get('form'));
        if (form == null || form.get('type') != 'survey') {
            return null;
        }
        String obj = (String) form.get('targetObject');
        return String.isBlank(obj) ? null : obj;
    }

    // ----- helpers -----

    private static Form__c loadForm(Id formId) {
        List<Form__c> forms = [
            SELECT Id, Form_Type__c, Primary_Context_Object__c
            FROM Form__c
            WHERE Id = :formId
            LIMIT 1
        ];
        return forms.isEmpty() ? null : forms[0];
    }

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

    /** Best-effort: the response is already saved. */
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

    private static Map<String, Object> parseSpec(String specJson) {
        return (Map<String, Object>) JSON.deserializeUntyped(specJson);
    }

    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map<String, Object>
            ? (Map<String, Object>) o
            : null;
    }
}
