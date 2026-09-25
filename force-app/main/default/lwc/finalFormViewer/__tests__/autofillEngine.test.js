import {
    POLICY_PRESERVE_EDITS,
    POLICY_ALWAYS_REPLACE,
    createAutofillSession,
    computeRulesFingerprint,
    extractAutofillRules,
    seedStaticDefaults,
    onManualEdit,
    onSourceChanged,
    onResult,
    onRequestFailure,
    isRequestCurrent,
    reconcileAutofillSession,
    fitValue,
    extractDestinations,
    DOES_NOT_FIT
} from '../autofillEngine';

describe('autofillEngine — pure state machine and patch engine', () => {
    const contactRule = {
        id: 'af_contact',
        name: 'Contact Link',
        enabled: true,
        source: { type: 'link', objectApiName: 'Contact' },
        policy: POLICY_PRESERVE_EDITS,
        mappings: [
            {
                id: 'm1',
                from: 'FirstName',
                to: 'el_first_name',
                guestAllowed: true
            },
            {
                id: 'm2',
                from: 'LastName',
                to: 'el_last_name',
                guestAllowed: true
            },
            { id: 'm3', from: 'Email', to: 'el_email', guestAllowed: true }
        ]
    };

    const accountRule = {
        id: 'af_account',
        name: 'Account Lookup',
        enabled: true,
        source: { type: 'lookup', elementId: 'el_account_lookup' },
        policy: POLICY_PRESERVE_EDITS,
        mappings: [
            {
                id: 'm4',
                from: 'Phone',
                to: 'el_account_phone',
                guestAllowed: false
            },
            {
                id: 'm5',
                from: 'Website',
                to: 'el_account_website',
                guestAllowed: false
            }
        ]
    };

    const sampleSpec = {
        specVersion: 1,
        pages: [
            {
                id: 'p1',
                sections: [
                    {
                        id: 's1',
                        elements: [
                            { id: 'el_first_name', type: 'field' },
                            {
                                id: 'el_last_name',
                                type: 'field',
                                defaultValue: 'DefaultLastName'
                            },
                            { id: 'el_email', type: 'field' },
                            { id: 'el_account_phone', type: 'field' },
                            { id: 'el_account_website', type: 'field' }
                        ]
                    }
                ]
            }
        ],
        settings: {
            prefill: {
                source: 'sourceRecord',
                rulesVersion: 1,
                autofillRules: [contactRule, accountRule]
            }
        }
    };

    describe('rules extraction and fingerprinting', () => {
        it('extracts only enabled rules from spec', () => {
            const specWithDisabled = {
                settings: {
                    prefill: {
                        autofillRules: [
                            contactRule,
                            { ...accountRule, enabled: false }
                        ]
                    }
                }
            };
            const extracted = extractAutofillRules(specWithDisabled);
            expect(extracted).toHaveLength(1);
            expect(extracted[0].id).toBe('af_contact');
        });

        it('returns empty array when prefill or autofillRules is absent', () => {
            expect(extractAutofillRules({})).toEqual([]);
            expect(extractAutofillRules({ settings: {} })).toEqual([]);
        });

        it('computes stable fingerprint regardless of rule ordering', () => {
            const fp1 = computeRulesFingerprint([contactRule, accountRule]);
            const fp2 = computeRulesFingerprint([accountRule, contactRule]);
            expect(fp1).toBe(fp2);
        });
    });

    describe('static defaults seeding', () => {
        it('seeds explicit static defaults only when answer is absent', () => {
            const defaults = seedStaticDefaults(sampleSpec, {
                el_other: 'foo'
            });
            expect(defaults.el_last_name).toBe('DefaultLastName');
            expect(defaults.el_first_name).toBeUndefined();
        });

        it('does not overwrite existing answers with defaults', () => {
            const defaults = seedStaticDefaults(sampleSpec, {
                el_last_name: 'Existing'
            });
            expect(defaults.el_last_name).toBeUndefined();
        });

        it('recognizes 0 and false as explicit defaults but ignores empty/whitespace strings', () => {
            const spec = {
                pages: [
                    {
                        sections: [
                            {
                                elements: [
                                    { id: 'e1', defaultValue: 0 },
                                    { id: 'e2', defaultValue: false },
                                    { id: 'e3', defaultValue: '' },
                                    { id: 'e4', defaultValue: '   ' }
                                ]
                            }
                        ]
                    }
                ]
            };
            const defaults = seedStaticDefaults(spec);
            expect(defaults.e1).toBe(0);
            expect(defaults.e2).toBe(false);
            expect(defaults.e3).toBeUndefined();
            expect(defaults.e4).toBeUndefined();
        });
    });

    describe('first link fill & default precedence', () => {
        it('applies mapped fields to untouched absent destinations and records ownership', () => {
            const session = createAutofillSession({
                sessionId: 's1',
                specVersionId: 'v1',
                rules: [contactRule]
            });

            const { requestIdentity } = onSourceChanged(
                session,
                'af_contact',
                'contact_token_1'
            );
            expect(requestIdentity).not.toBeNull();

            const fieldValues = {
                FirstName: 'Jane',
                LastName: 'Doe',
                Email: 'jane@example.test'
            };

            const result = onResult(
                session,
                requestIdentity,
                fieldValues,
                {},
                true
            );
            expect(result.applied).toBe(true);
            expect(result.patch).toEqual({
                el_first_name: 'Jane',
                el_last_name: 'Doe',
                el_email: 'jane@example.test'
            });
            expect(session.owner.el_first_name).toEqual({
                ruleId: 'af_contact',
                sourceKey: 'contact_token_1',
                lastAppliedValue: 'Jane',
                // R13 — the revision at which Autofill took ownership. Clearing
                // compares against this instead of the permanent `touched` flag.
                appliedAtRevision: 0
            });
        });

        it('static defaults win initial link Autofill (even under alwaysReplace)', () => {
            const alwaysReplaceRule = {
                ...contactRule,
                policy: POLICY_ALWAYS_REPLACE
            };
            const session = createAutofillSession({
                sessionId: 's1',
                rules: [alwaysReplaceRule],
                initialDefaults: { el_last_name: 'DefaultLastName' }
            });

            const { requestIdentity } = onSourceChanged(
                session,
                'af_contact',
                'contact_token_1'
            );
            const result = onResult(
                session,
                requestIdentity,
                { FirstName: 'Jane', LastName: 'Doe' },
                { el_last_name: 'DefaultLastName' },
                true // isInitialLinkLoad
            );

            expect(result.applied).toBe(true);
            expect(result.patch.el_first_name).toBe('Jane');
            // el_last_name must NOT be overwritten by initial link load when an explicit default exists
            expect(result.patch.el_last_name).toBeUndefined();
        });
    });

    describe('manual edits, touched state, and preserveEdits', () => {
        it('increments editRevision, marks touched, and drops rule ownership on manual edit', () => {
            const session = createAutofillSession({ rules: [contactRule] });
            const { requestIdentity } = onSourceChanged(
                session,
                'af_contact',
                'c1'
            );
            onResult(session, requestIdentity, { FirstName: 'Jane' }, {});

            expect(session.owner.el_first_name).toBeDefined();

            onManualEdit(session, 'el_first_name', 'JaneEdited');
            expect(session.editRevision.el_first_name).toBe(1);
            expect(session.touched.el_first_name).toBe(true);
            expect(session.owner.el_first_name).toBeUndefined();
        });

        it('preserves deliberately cleared blank entered by respondent', () => {
            const session = createAutofillSession({ rules: [contactRule] });
            onManualEdit(session, 'el_first_name', ''); // respondent cleared it

            const { requestIdentity } = onSourceChanged(
                session,
                'af_contact',
                'c1'
            );
            const result = onResult(
                session,
                requestIdentity,
                { FirstName: 'Jane' },
                { el_first_name: '' }
            );

            expect(result.patch.el_first_name).toBeUndefined();
        });

        it('preserves edits made while request was in-flight', () => {
            const session = createAutofillSession({ rules: [contactRule] });
            const { requestIdentity } = onSourceChanged(
                session,
                'af_contact',
                'c1'
            );

            // Respondent edits while fetch is pending
            onManualEdit(session, 'el_first_name', 'TypingInProgress');

            // Result arrives late
            const result = onResult(
                session,
                requestIdentity,
                { FirstName: 'Jane' },
                { el_first_name: 'TypingInProgress' }
            );
            expect(result.patch.el_first_name).toBeUndefined();
        });
    });

    describe('concurrency: A -> B out-of-order resolution and source changes', () => {
        it('clears untouched A-owned values immediately when switching from A to B', () => {
            const session = createAutofillSession({ rules: [accountRule] });

            // Fetch A finishes and applies phone
            const { requestIdentity: reqA } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            onResult(session, reqA, { Phone: '111-1111' }, {});
            expect(session.owner.el_account_phone).toBeDefined();

            // Switch to B: immediately clears A's untouched phone
            const { clearedPatch, requestIdentity: reqB } = onSourceChanged(
                session,
                'af_account',
                'acc_B'
            );
            expect(clearedPatch.el_account_phone).toBeNull();
            expect(session.owner.el_account_phone).toBeUndefined();
            expect(reqB.generation).toBe(2);
        });

        it('discards stale A result if B already started (A -> B -> A race condition)', () => {
            const session = createAutofillSession({ rules: [accountRule] });

            const { requestIdentity: reqA } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            const { requestIdentity: reqB } = onSourceChanged(
                session,
                'af_account',
                'acc_B'
            );

            // Late A arrives after B was requested
            const resultA = onResult(session, reqA, { Phone: '111-1111' }, {});
            expect(resultA.applied).toBe(false);
            expect(resultA.reason).toBe('stale_or_invalid_request');

            // B arrives and applies
            const resultB = onResult(session, reqB, { Phone: '222-2222' }, {});
            expect(resultB.applied).toBe(true);
            expect(resultB.patch.el_account_phone).toBe('222-2222');
        });

        it('clears only rule-owned values when lookup is cleared, preserving manual edits', () => {
            const session = createAutofillSession({ rules: [accountRule] });

            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            onResult(
                session,
                requestIdentity,
                { Phone: '111-1111', Website: 'https://a.com' },
                {}
            );

            // User manually edited Website
            onManualEdit(session, 'el_account_website', 'https://custom.com');

            // Source lookup cleared
            const { clearedPatch, requestIdentity: clearedReq } =
                onSourceChanged(session, 'af_account', null);
            expect(clearedReq).toBeNull();
            expect(clearedPatch.el_account_phone).toBeNull();
            // Website was manually touched, so it must NOT be cleared
            expect(clearedPatch.el_account_website).toBeUndefined();
        });
    });

    describe('null vs omitted fields', () => {
        it('omitted field in source payload is not applied and does not clear current answer', () => {
            const session = createAutofillSession({ rules: [contactRule] });
            const { requestIdentity } = onSourceChanged(
                session,
                'af_contact',
                'c1'
            );

            // Payload omits Email (e.g. unreadable field)
            const result = onResult(
                session,
                requestIdentity,
                { FirstName: 'Jane', LastName: 'Doe' },
                { el_email: 'keepme@example.test' }
            );

            expect(result.patch.el_first_name).toBe('Jane');
            expect(result.patch.el_email).toBeUndefined();
        });

        it('null field in source payload clears untouched owned value', () => {
            const session = createAutofillSession({ rules: [contactRule] });
            const { requestIdentity: req1 } = onSourceChanged(
                session,
                'af_contact',
                'c1'
            );
            onResult(session, req1, { FirstName: 'Jane' }, {});

            // Second fetch on same record returns explicit null for FirstName
            const { requestIdentity: req2 } = onSourceChanged(
                session,
                'af_contact',
                'c1'
            );
            const result = onResult(
                session,
                req2,
                { FirstName: null },
                { el_first_name: 'Jane' }
            );

            expect(result.patch.el_first_name).toBeNull();
            expect(session.owner.el_first_name).toBeUndefined();
        });
    });

    describe('alwaysReplace policy', () => {
        it('replaces earlier manual values when new source resolves', () => {
            const rule = { ...accountRule, policy: POLICY_ALWAYS_REPLACE };
            const session = createAutofillSession({ rules: [rule] });

            // User had entered an earlier manual phone number
            onManualEdit(session, 'el_account_phone', '999-9999');

            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            const result = onResult(
                session,
                requestIdentity,
                { Phone: '111-1111' },
                { el_account_phone: '999-9999' }
            );

            expect(result.applied).toBe(true);
            expect(result.patch.el_account_phone).toBe('111-1111');
            expect(session.owner.el_account_phone).toBeDefined();
        });

        it('still preserves edits made while fetch was in-flight under alwaysReplace', () => {
            const rule = { ...accountRule, policy: POLICY_ALWAYS_REPLACE };
            const session = createAutofillSession({ rules: [rule] });

            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            // User edits during fetch
            onManualEdit(session, 'el_account_phone', '888-8888');

            const result = onResult(
                session,
                requestIdentity,
                { Phone: '111-1111' },
                { el_account_phone: '888-8888' }
            );
            expect(result.patch.el_account_phone).toBeUndefined();
        });
    });

    describe('request failure and timeout', () => {
        it('marks request failed and refuses late responses', () => {
            const session = createAutofillSession({ rules: [accountRule] });
            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );

            const failed = onRequestFailure(
                session,
                requestIdentity,
                'timeout'
            );
            expect(failed).toBe(true);

            // Late response after timeout must be discarded
            const lateResult = onResult(
                session,
                requestIdentity,
                { Phone: '111-1111' },
                {}
            );
            expect(lateResult.applied).toBe(false);
            expect(lateResult.reason).toBe('stale_or_invalid_request');
        });
    });

    describe('builder spec reconciliation', () => {
        it('prunes deleted elements and updates rule fingerprint', () => {
            const session = createAutofillSession({ rules: [contactRule] });
            session.owner.el_first_name = {
                ruleId: 'af_contact',
                sourceKey: 'c1'
            };
            session.owner.el_removed = {
                ruleId: 'af_contact',
                sourceKey: 'c1'
            };

            const nextSpec = {
                pages: [
                    {
                        sections: [
                            {
                                elements: [{ id: 'el_first_name' }]
                            }
                        ]
                    }
                ],
                settings: {
                    prefill: {
                        autofillRules: [contactRule]
                    }
                }
            };

            reconcileAutofillSession(session, nextSpec);
            expect(session.owner.el_first_name).toBeDefined();
            expect(session.owner.el_removed).toBeUndefined();
        });
    });

    describe('R13: ownership survives a historical edit under alwaysReplace', () => {
        const replaceRule = {
            ...accountRule,
            policy: POLICY_ALWAYS_REPLACE
        };

        it('clears an alwaysReplace value written over an earlier manual edit', () => {
            const session = createAutofillSession({ rules: [replaceRule] });

            // Respondent types first, THEN alwaysReplace overwrites it.
            onManualEdit(session, 'el_account_phone', 'typed-by-hand');
            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            const applied = onResult(
                session,
                requestIdentity,
                { Phone: '111-1111' },
                { el_account_phone: 'typed-by-hand' }
            );
            expect(applied.patch.el_account_phone).toBe('111-1111');

            // Clearing the source must now clear the value Autofill owns. The
            // permanent `touched` flag used to strand it here forever.
            const { clearedPatch } = onSourceChanged(
                session,
                'af_account',
                null
            );
            expect(clearedPatch.el_account_phone).toBeNull();
            expect(session.owner.el_account_phone).toBeUndefined();
        });

        it('still preserves an edit made AFTER Autofill applied', () => {
            const session = createAutofillSession({ rules: [replaceRule] });

            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            onResult(session, requestIdentity, { Phone: '111-1111' }, {});
            onManualEdit(session, 'el_account_phone', 'edited-after-autofill');

            const { clearedPatch } = onSourceChanged(
                session,
                'af_account',
                null
            );
            expect(clearedPatch.el_account_phone).toBeUndefined();
        });
    });

    describe('R10: a builder edit cancels in-flight request bookkeeping', () => {
        it('cancels pending requests and reports them when a rule changes', () => {
            const session = createAutofillSession({ rules: [accountRule] });
            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            expect(isRequestCurrent(session, requestIdentity)).toBe(true);

            const edited = {
                ...sampleSpec,
                settings: {
                    prefill: {
                        autofillRules: [
                            {
                                ...accountRule,
                                mappings: [
                                    {
                                        id: 'm4',
                                        from: 'Fax',
                                        to: 'el_account_phone'
                                    }
                                ]
                            }
                        ]
                    }
                }
            };
            reconcileAutofillSession(session, edited);

            expect(isRequestCurrent(session, requestIdentity)).toBe(false);
            expect(session.requests.af_account.status).toBe('cancelled');
            expect(session.lastCancelledRuleIds).toContain('af_account');
        });

        it('drops requests and ownership for a rule that was removed', () => {
            const session = createAutofillSession({ rules: [accountRule] });
            const { requestIdentity } = onSourceChanged(
                session,
                'af_account',
                'acc_A'
            );
            onResult(session, requestIdentity, { Phone: '111-1111' }, {});
            expect(session.owner.el_account_phone).toBeDefined();

            reconcileAutofillSession(session, {
                ...sampleSpec,
                settings: { prefill: { autofillRules: [] } }
            });

            expect(session.requests.af_account).toBeUndefined();
            expect(session.owner.el_account_phone).toBeUndefined();
        });
    });
});

describe('fitting a value to its question (IMPL_PLAN_F2_AUTOFILL 6.7)', () => {
    const num = { answerType: 'Number' };
    const date = { answerType: 'Date' };
    const choice = {
        answerType: 'Choice',
        options: [
            { value: 'Tech', label: 'Technology' },
            { value: 'Retail', label: 'Retail' }
        ]
    };

    it('numbers: a number, or text that reads as one', () => {
        expect(fitValue(1500000, num)).toBe(1500000);
        expect(fitValue(' 42.5 ', num)).toBe(42.5);
        expect(fitValue('lots', num)).toBe(DOES_NOT_FIT);
        expect(fitValue('', num)).toBe(DOES_NOT_FIT);
    });

    it('dates: YYYY-MM-DD, a date-time keeps its date', () => {
        expect(fitValue('2026-09-25', date)).toBe('2026-09-25');
        expect(fitValue('2026-09-25T14:03:00.000Z', date)).toBe('2026-09-25');
        expect(fitValue('next week', date)).toBe(DOES_NOT_FIT);
    });

    it('choices: the option whose value or label matches, never forced', () => {
        expect(fitValue('Tech', choice)).toBe('Tech');
        expect(fitValue('Technology', choice)).toBe('Tech');
        expect(fitValue('Banking', choice)).toBe(DOES_NOT_FIT);
        // options not known here: the value as text
        expect(fitValue('Banking', { answerType: 'Choice' })).toBe('Banking');
    });

    it('text: a string; no destination known: as it came', () => {
        expect(fitValue(12, { answerType: 'Text' })).toBe('12');
        expect(fitValue(12, undefined)).toBe(12);
        expect(fitValue(null, num)).toBeNull();
    });

    it('finds the destinations in a spec, inputs only', () => {
        const spec = {
            pages: [
                {
                    sections: [
                        {
                            elements: [
                                {
                                    id: 'el_n',
                                    type: 'field',
                                    config: { inputType: 'number' }
                                },
                                {
                                    id: 'el_d',
                                    type: 'field',
                                    config: { inputType: 'date' }
                                },
                                {
                                    id: 'el_c',
                                    type: 'field',
                                    config: {
                                        inputType: 'picklist',
                                        renderAs: 'Dropdown',
                                        options: choice.options
                                    }
                                },
                                {
                                    id: 'el_m',
                                    type: 'field',
                                    config: {
                                        inputType: 'picklist',
                                        renderAs: 'Checkbox_Group'
                                    }
                                },
                                { id: 'el_nps', type: 'nps' },
                                { id: 'el_t', type: 'field' }
                            ]
                        }
                    ]
                }
            ]
        };
        const d = extractDestinations(spec);
        expect(Object.keys(d).sort()).toEqual(['el_c', 'el_d', 'el_n', 'el_t']);
        expect(d.el_c.options).toHaveLength(2);
        expect(d.el_t.answerType).toBe('Text');
    });

    it('a value that does not fit is no value: nothing is forced in', () => {
        const rule = {
            id: 'af_acc',
            enabled: true,
            policy: 'preserveEdits',
            source: { type: 'link', objectApiName: 'Account' },
            mappings: [
                { id: 'm1', from: 'Industry', to: 'el_c' },
                { id: 'm2', from: 'AnnualRevenue', to: 'el_n' }
            ]
        };
        const session = createAutofillSession({
            sessionId: 's1',
            specVersionId: 'v1',
            rules: [rule],
            destinations: {
                el_c: choice,
                el_n: num
            }
        });
        const { requestIdentity } = onSourceChanged(session, 'af_acc', 'k1');
        const result = onResult(
            session,
            requestIdentity,
            { Industry: 'Banking', AnnualRevenue: '2500' },
            {},
            true
        );
        // Banking isn't an option: left blank, and not owned
        expect(result.patch.el_c).toBeUndefined();
        expect(session.owner.el_c).toBeUndefined();
        expect(result.patch.el_n).toBe(2500);
    });

    it('a date-time keeps the date where the respondent is', () => {
        const iso = '2026-09-25T02:00:00.000Z';
        const d = new Date(iso);
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
            2,
            '0'
        )}-${String(d.getDate()).padStart(2, '0')}`;
        expect(fitValue(iso, { answerType: 'Date' })).toBe(local);
    });

    it('a value that does not fit never wipes what someone typed', () => {
        const rule = {
            id: 'af_r',
            enabled: true,
            policy: 'alwaysReplace',
            source: { type: 'link', objectApiName: 'Account' },
            mappings: [{ id: 'm1', from: 'Industry', to: 'el_c' }]
        };
        const session = createAutofillSession({
            sessionId: 's2',
            specVersionId: 'v1',
            rules: [rule],
            destinations: {
                el_c: {
                    answerType: 'Choice',
                    options: [{ value: 'Tech', label: 'Technology' }]
                }
            }
        });
        const { requestIdentity } = onSourceChanged(session, 'af_r', 'k1');
        const result = onResult(
            session,
            requestIdentity,
            { Industry: 'Banking' },
            // typed by the respondent, owned by no rule
            { el_c: 'Tech' },
            false
        );
        expect(result.patch).toEqual({});
    });
});
