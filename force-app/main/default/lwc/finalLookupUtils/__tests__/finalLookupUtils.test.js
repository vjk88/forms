import {
    LOOKUP_CONFIG_VERSION,
    BLOCKED,
    isAnswered,
    sameAnswer,
    readLookupConfig,
    sourcesOf,
    indexLookups,
    buildGraph,
    affectedLookups,
    compileFilter,
    filterFingerprint
} from 'c/finalLookupUtils';

const answerCriterion = (fieldPath, elementId, operator = 'eq') => ({
    id: 'lc_' + fieldPath + '_' + elementId,
    fieldPath,
    operator,
    value: { kind: 'answer', elementId }
});

const constantCriterion = (fieldPath, value, operator = 'eq') => ({
    id: 'lc_' + fieldPath,
    fieldPath,
    operator,
    value: { kind: 'constant', value }
});

const config = (criteria, mode = 'all') => ({
    version: LOOKUP_CONFIG_VERSION,
    filter: { mode, criteria }
});

const model = (elements) => ({
    pages: [{ id: 'pg_1', sections: [{ id: 'sec_1', elements }] }]
});

describe('answer presence', () => {
    it('counts false and zero as answers', () => {
        expect(isAnswered(false)).toBe(true);
        expect(isAnswered(0)).toBe(true);
        expect(isAnswered('0')).toBe(true);
    });

    it('counts only null, undefined and empty string as absences', () => {
        expect(isAnswered(null)).toBe(false);
        expect(isAnswered(undefined)).toBe(false);
        expect(isAnswered('')).toBe(false);
    });
});

describe('answer equality', () => {
    it('does not see a change where there is none', () => {
        expect(sameAnswer('003AAA', '003AAA')).toBe(true);
        expect(sameAnswer(3, '3')).toBe(true);
        expect(sameAnswer(null, '')).toBe(true);
        expect(sameAnswer(undefined, null)).toBe(true);
        expect(sameAnswer(false, false)).toBe(true);
    });

    it('sees a real change', () => {
        expect(sameAnswer('003AAA', '003BBB')).toBe(false);
        expect(sameAnswer(false, true)).toBe(false);
        expect(sameAnswer(0, null)).toBe(false);
    });
});

describe('reading config', () => {
    it('ignores a version this build does not understand', () => {
        expect(
            readLookupConfig({ lookupConfig: { version: 99, filter: {} } })
        ).toBeNull();
    });

    it('ignores an element with no config at all', () => {
        expect(readLookupConfig({})).toBeNull();
        expect(readLookupConfig(null)).toBeNull();
    });

    it('lists only the answer-sourced criteria as sources', () => {
        const cfg = config([
            answerCriterion('AccountId', 'el_account'),
            constantCriterion('Title', 'CFO')
        ]);
        expect(sourcesOf(cfg)).toEqual(['el_account']);
    });
});

describe('dependency graph', () => {
    const chain = () =>
        model([
            { id: 'el_a' },
            {
                id: 'el_b',
                lookupConfig: config([answerCriterion('AccountId', 'el_a')])
            },
            {
                id: 'el_c',
                lookupConfig: config([answerCriterion('ReportsToId', 'el_b')])
            }
        ]);

    it('collects every filtered lookup in the form', () => {
        const index = indexLookups(chain());
        expect([...index.keys()]).toEqual(['el_b', 'el_c']);
    });

    it('walks a chain parent-first', () => {
        const graph = buildGraph(indexLookups(chain()));
        expect(affectedLookups(graph, 'el_a')).toEqual(['el_b', 'el_c']);
    });

    it('returns a shared descendant once, not once per parent', () => {
        // Two lookups both feed a third. Clearing it twice would fire two
        // rounds of downstream work for a single user action.
        const graph = buildGraph(
            indexLookups(
                model([
                    { id: 'el_a' },
                    {
                        id: 'el_b',
                        lookupConfig: config([
                            answerCriterion('AccountId', 'el_a')
                        ])
                    },
                    {
                        id: 'el_c',
                        lookupConfig: config([
                            answerCriterion('AccountId', 'el_a')
                        ])
                    },
                    {
                        id: 'el_d',
                        lookupConfig: config([
                            answerCriterion('X', 'el_b'),
                            answerCriterion('Y', 'el_c')
                        ])
                    }
                ])
            )
        );
        const affected = affectedLookups(graph, 'el_a');
        expect(affected.filter((id) => id === 'el_d')).toHaveLength(1);
        expect(affected.indexOf('el_d')).toBeGreaterThan(
            affected.indexOf('el_b')
        );
    });

    it('does not loop forever on a cycle', () => {
        const graph = buildGraph(
            indexLookups(
                model([
                    {
                        id: 'el_a',
                        lookupConfig: config([answerCriterion('X', 'el_b')])
                    },
                    {
                        id: 'el_b',
                        lookupConfig: config([answerCriterion('Y', 'el_a')])
                    }
                ])
            )
        );
        expect(affectedLookups(graph, 'el_a')).toEqual(['el_b', 'el_a']);
    });

    it('reports nothing affected when an unrelated answer changes', () => {
        const graph = buildGraph(indexLookups(chain()));
        expect(affectedLookups(graph, 'el_unrelated')).toEqual([]);
    });
});

describe('compiling a native filter', () => {
    it('passes a resolved answer straight through', () => {
        const { filter, blocked } = compileFilter(
            config([answerCriterion('AccountId', 'el_account')]),
            { el_account: '001AAA' }
        );
        expect(blocked).toBe(false);
        expect(filter).toEqual({
            criteria: [
                { fieldPath: 'AccountId', operator: 'eq', value: '001AAA' }
            ]
        });
    });

    it('BLOCKS rather than widening when a controlling answer is missing', () => {
        const { filter, blocked, reason } = compileFilter(
            config([answerCriterion('AccountId', 'el_account')]),
            {}
        );
        expect(blocked).toBe(true);
        expect(reason).toBe(BLOCKED.SOURCE_REQUIRED);
        expect(filter).toBeNull();
    });

    it('blocks under any as well, even when another condition would match', () => {
        // The whole point: dropping the unresolvable row would leave a filter
        // that happily matches half the object.
        const { blocked, reason } = compileFilter(
            config(
                [
                    answerCriterion('AccountId', 'el_account'),
                    constantCriterion('Title', 'CFO')
                ],
                'any'
            ),
            {}
        );
        expect(blocked).toBe(true);
        expect(reason).toBe(BLOCKED.SOURCE_REQUIRED);
    });

    it('keeps false and zero as usable answers', () => {
        expect(
            compileFilter(config([answerCriterion('Active', 'el_flag')]), {
                el_flag: false
            }).filter.criteria[0].value
        ).toBe(false);
        expect(
            compileFilter(config([answerCriterion('Score', 'el_num')]), {
                el_num: 0
            }).filter.criteria[0].value
        ).toBe(0);
    });

    it('spells OR out positionally, since the native default is AND', () => {
        const { filter } = compileFilter(
            config(
                [
                    constantCriterion('Title', 'CFO'),
                    constantCriterion('Department', 'Finance'),
                    constantCriterion('LeadSource', 'Web')
                ],
                'any'
            ),
            {}
        );
        expect(filter.filterLogic).toBe('1 OR 2 OR 3');
    });

    it('leaves AND implicit', () => {
        const { filter } = compileFilter(
            config([
                constantCriterion('Title', 'CFO'),
                constantCriterion('Department', 'Finance')
            ]),
            {}
        );
        expect(filter.filterLogic).toBeUndefined();
    });

    it('does not bother with OR for a single condition', () => {
        const { filter } = compileFilter(
            config([constantCriterion('Title', 'CFO')], 'any'),
            {}
        );
        expect(filter.filterLogic).toBeUndefined();
    });

    it('treats an explicit null constant as a real condition', () => {
        const { filter, blocked } = compileFilter(
            config([constantCriterion('ReportsToId', null)]),
            {}
        );
        expect(blocked).toBe(false);
        expect(filter.criteria[0].value).toBeNull();
    });

    it('blocks a constant whose value was never filled in', () => {
        const { blocked, reason } = compileFilter(
            config([
                {
                    id: 'lc_1',
                    fieldPath: 'Title',
                    operator: 'eq',
                    value: { kind: 'constant' }
                }
            ]),
            {}
        );
        expect(blocked).toBe(true);
        expect(reason).toBe(BLOCKED.CONFIG_UNAVAILABLE);
    });

    it('blocks a malformed criterion instead of skipping it', () => {
        const { blocked, reason } = compileFilter(
            config([{ id: 'lc_1', operator: 'eq' }]),
            {}
        );
        expect(blocked).toBe(true);
        expect(reason).toBe(BLOCKED.CONFIG_UNAVAILABLE);
    });

    it('blocks a value kind it does not recognise', () => {
        const { blocked } = compileFilter(
            config([
                {
                    id: 'lc_1',
                    fieldPath: 'Title',
                    operator: 'eq',
                    value: { kind: 'formula', expression: 'whatever' }
                }
            ]),
            {}
        );
        expect(blocked).toBe(true);
    });

    it('reports no filter at all when nothing is configured', () => {
        expect(compileFilter(null, {})).toEqual({
            filter: null,
            blocked: false,
            reason: null
        });
        expect(compileFilter(config([]), {}).blocked).toBe(false);
    });
});

describe('generation fingerprint', () => {
    const cfg = config([answerCriterion('AccountId', 'el_account')]);

    it('is stable while nothing that matters has changed', () => {
        expect(filterFingerprint(cfg, { el_account: '001AAA' })).toBe(
            filterFingerprint(cfg, { el_account: '001AAA', other: 'noise' })
        );
    });

    it('changes when the controlling answer changes', () => {
        expect(filterFingerprint(cfg, { el_account: '001AAA' })).not.toBe(
            filterFingerprint(cfg, { el_account: '001BBB' })
        );
    });

    it('changes when the lookup becomes blocked', () => {
        expect(filterFingerprint(cfg, { el_account: '001AAA' })).not.toBe(
            filterFingerprint(cfg, {})
        );
    });

    it('changes when the surrounding identity changes', () => {
        // A new spec version or respondent token retires every filter, even
        // one whose criteria happen to look identical.
        expect(filterFingerprint(cfg, { el_account: '001AAA' }, 'v1')).not.toBe(
            filterFingerprint(cfg, { el_account: '001AAA' }, 'v2')
        );
    });
});
