import {
    ruleMatches,
    evaluateVisibility,
    evaluateCustomLogic,
    validateEntry,
    validateElement,
    lintVisibility
} from 'c/finalExpressionEngine';

const ctx = (values, types = {}) => ({
    getValue: (id) => values[id],
    getType: (id) => types[id] || 'field'
});

describe('ruleMatches — operators', () => {
    it('equals / notEquals compare loosely as strings (inputs arrive stringly)', () => {
        const c = ctx({ a: '5', b: 5, c: 'Yes' });
        expect(ruleMatches({ source: 'a', operator: 'equals', value: 5 }, c)).toBe(true);
        expect(ruleMatches({ source: 'b', operator: 'equals', value: '5' }, c)).toBe(true);
        expect(ruleMatches({ source: 'c', operator: 'notEquals', value: 'No' }, c)).toBe(true);
        expect(ruleMatches({ source: 'missing', operator: 'equals', value: '' }, c)).toBe(true);
    });

    it('contains: case-insensitive substring; arrays check membership', () => {
        const c = ctx({ t: 'Hello World', m: ['A', 'C'] });
        expect(ruleMatches({ source: 't', operator: 'contains', value: 'world' }, c)).toBe(true);
        expect(ruleMatches({ source: 'm', operator: 'contains', value: 'C' }, c)).toBe(true);
        expect(ruleMatches({ source: 'm', operator: 'contains', value: 'B' }, c)).toBe(false);
    });

    it('isBlank / isNotBlank treat "", null, undefined, [] as blank', () => {
        const c = ctx({ e: '', arr: [], v: 0 });
        expect(ruleMatches({ source: 'e', operator: 'isBlank' }, c)).toBe(true);
        expect(ruleMatches({ source: 'arr', operator: 'isBlank' }, c)).toBe(true);
        expect(ruleMatches({ source: 'nope', operator: 'isBlank' }, c)).toBe(true);
        expect(ruleMatches({ source: 'v', operator: 'isNotBlank' }, c)).toBe(true);
    });

    it('greaterThan/lessThan: numeric when both parse; FALSE when not comparable (§7 fail-safe)', () => {
        const c = ctx({ n: '42', s: 'abc' });
        expect(ruleMatches({ source: 'n', operator: 'greaterThan', value: 40 }, c)).toBe(true);
        expect(ruleMatches({ source: 'n', operator: 'lessThan', value: 40 }, c)).toBe(false);
        // "abc" > "abb" would be true as strings — must be FALSE, never silent
        expect(ruleMatches({ source: 's', operator: 'greaterThan', value: 'abb' }, c)).toBe(false);
    });

    it('date sources compare as dates', () => {
        const c = ctx({ d: '2026-07-08' }, { d: 'date' });
        expect(
            ruleMatches({ source: 'd', operator: 'greaterThan', value: '2026-01-01' }, c)
        ).toBe(true);
        expect(
            ruleMatches({ source: 'd', operator: 'lessThan', value: '2026-01-01' }, c)
        ).toBe(false);
    });

    it('unknown operator is false, never a throw', () => {
        expect(ruleMatches({ source: 'a', operator: 'regex', value: '.' }, ctx({ a: 'x' }))).toBe(false);
    });
});

describe('evaluateVisibility — logic + action', () => {
    const rules = [
        { source: 'a', operator: 'equals', value: 'Yes' },
        { source: 'b', operator: 'isNotBlank' }
    ];

    it('no config / empty rules → visible', () => {
        expect(evaluateVisibility(null, ctx({}))).toBe(true);
        expect(evaluateVisibility({ action: 'show', rules: [] }, ctx({}))).toBe(true);
    });

    it('all (AND) vs any (OR)', () => {
        const c = ctx({ a: 'Yes', b: '' });
        expect(evaluateVisibility({ action: 'show', logic: 'all', rules }, c)).toBe(false);
        expect(evaluateVisibility({ action: 'show', logic: 'any', rules }, c)).toBe(true);
    });

    it('hide inverts the match', () => {
        const c = ctx({ a: 'Yes', b: 'x' });
        expect(evaluateVisibility({ action: 'hide', logic: 'all', rules }, c)).toBe(false);
        expect(
            evaluateVisibility({ action: 'hide', logic: 'all', rules }, ctx({ a: 'No' }))
        ).toBe(true);
    });

    it('custom logic: "1 AND (2 OR 3)"; malformed → fail safe (show-rule hides)', () => {
        const three = [
            { source: 'a', operator: 'equals', value: '1' },
            { source: 'b', operator: 'equals', value: '2' },
            { source: 'c', operator: 'equals', value: '3' }
        ];
        const c = ctx({ a: '1', b: 'no', c: '3' });
        expect(
            evaluateVisibility(
                { action: 'show', logic: 'custom', customLogic: '1 AND (2 OR 3)', rules: three },
                c
            )
        ).toBe(true);
        expect(
            evaluateVisibility(
                { action: 'show', logic: 'custom', customLogic: '1 AND AND 2', rules: three },
                c
            )
        ).toBe(false);
    });
});

describe('evaluateCustomLogic parser', () => {
    it('parses precedence and parens; rejects garbage and bad indexes', () => {
        expect(evaluateCustomLogic('1 OR 2 AND 3', [true, false, false])).toBe(true); // AND binds tighter
        expect(evaluateCustomLogic('(1 OR 2) AND 3', [true, false, false])).toBe(false);
        expect(evaluateCustomLogic('4', [true])).toBe(null);
        expect(evaluateCustomLogic('1 XOR 2', [true, true])).toBe(null);
        expect(evaluateCustomLogic('', [])).toBe(null);
    });
});

describe('validation entries (§7)', () => {
    it('required fails blank AND false (unchecked consent box)', () => {
        const e = { type: 'required', message: 'Required' };
        expect(validateEntry(e, '', ctx({}))).toBe('Required');
        expect(validateEntry(e, false, ctx({}))).toBe('Required');
        expect(validateEntry(e, 'x', ctx({}))).toBe(null);
    });

    it('pattern skips blanks; malformed regex never blocks', () => {
        const e = { type: 'pattern', pattern: '^\\d+$', message: 'Digits' };
        expect(validateEntry(e, '', ctx({}))).toBe(null);
        expect(validateEntry(e, 'abc', ctx({}))).toBe('Digits');
        expect(validateEntry({ type: 'pattern', pattern: '(', message: 'x' }, 'abc', ctx({}))).toBe(null);
    });

    it('range: numeric bounds; non-numeric value fails', () => {
        const e = { type: 'range', min: 18, max: 120, message: '18-120' };
        expect(validateEntry(e, '17', ctx({}))).toBe('18-120');
        expect(validateEntry(e, '19', ctx({}))).toBe(null);
        expect(validateEntry(e, 'abc', ctx({}))).toBe('18-120');
    });

    it('custom compareTo: Email == ConfirmEmail', () => {
        const e = { type: 'custom', compareTo: 'confirm', operator: 'equals', message: 'Must match' };
        expect(validateEntry(e, 'a@x.com', ctx({ confirm: 'a@x.com' }))).toBe(null);
        expect(validateEntry(e, 'a@x.com', ctx({ confirm: 'b@x.com' }))).toBe('Must match');
    });

    it('when gates: the entry only applies when its condition holds', () => {
        const e = {
            type: 'required',
            message: 'Required',
            when: { logic: 'all', rules: [{ source: 'other', operator: 'equals', value: 'Yes' }] }
        };
        expect(validateEntry(e, '', ctx({ other: 'Yes' }))).toBe('Required');
        expect(validateEntry(e, '', ctx({ other: 'No' }))).toBe(null);
    });

    it('validateElement collects every failure in order', () => {
        const el = {
            validation: [
                { type: 'required', message: 'R' },
                { type: 'pattern', pattern: '^\\d+$', message: 'P' }
            ]
        };
        expect(validateElement(el, '', ctx({}))).toEqual(['R']);
        expect(validateElement(el, 'abc', ctx({}))).toEqual(['P']);
        expect(validateElement({}, 'x', ctx({}))).toEqual([]);
    });
});

describe('lintVisibility (build-time, same engine)', () => {
    const index = new Map([
        ['a', { type: 'field', repeatSectionId: null }],
        ['r', { type: 'field', repeatSectionId: 'sec_rep' }],
        ['d', { type: 'date', repeatSectionId: null }]
    ]);

    it('flags unknown sources, bad operators, repeater escapes, non-numeric comparisons', () => {
        const problems = lintVisibility(
            {
                logic: 'custom',
                customLogic: '1 AND',
                rules: [
                    { source: 'ghost', operator: 'equals', value: '1' },
                    { source: 'r', operator: 'equals', value: '1' },
                    { source: 'a', operator: 'greaterThan', value: 'abc' },
                    { source: 'a', operator: 'regex', value: '.' }
                ]
            },
            index,
            null
        );
        expect(problems.some((p) => p.includes('not found'))).toBe(true);
        expect(problems.some((p) => p.includes('repeatable'))).toBe(true);
        expect(problems.some((p) => p.includes('numeric'))).toBe(true);
        expect(problems.some((p) => p.includes('unknown operator'))).toBe(true);
        expect(problems.some((p) => p.includes('malformed'))).toBe(true);
    });

    it('clean config + date comparisons lint clean', () => {
        expect(
            lintVisibility(
                {
                    logic: 'all',
                    rules: [{ source: 'd', operator: 'greaterThan', value: '2026-01-01' }]
                },
                index,
                null
            )
        ).toEqual([]);
    });

    it('inside its own repeat section, a repeater element is a legal source', () => {
        expect(
            lintVisibility(
                { logic: 'all', rules: [{ source: 'r', operator: 'isBlank' }] },
                index,
                'sec_rep'
            )
        ).toEqual([]);
    });
});
