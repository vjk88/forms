import { createElement } from 'lwc';
import FinalRuleEditor from 'c/finalRuleEditor';

const SOURCES = [
    { id: 'el_1', label: 'First name' },
    { id: 'el_2', label: 'Newsletter' }
];

function makeIndex(entries) {
    return new Map(entries);
}

function mount(props = {}) {
    const el = createElement('c-final-rule-editor', { is: FinalRuleEditor });
    Object.assign(
        el,
        {
            sources: SOURCES,
            sourceIndex: makeIndex([
                ['el_1', { type: 'field', repeatSectionId: null }],
                ['el_2', { type: 'field', repeatSectionId: null }]
            ]),
            noun: 'field'
        },
        props
    );
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve();

describe('c-final-rule-editor', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('empty state hints, + Add rule mints the §7 default config', async () => {
        const el = mount({ value: null });
        await flush();
        expect(el.shadowRoot.querySelector('.re-empty').textContent).toContain(
            'Always visible'
        );
        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail));
        el.shadowRoot.querySelector('.re-add').click();
        expect(changes).toEqual([
            {
                value: {
                    action: 'show',
                    logic: 'all',
                    customLogic: null,
                    rules: [{ source: 'el_1', operator: 'equals', value: '' }]
                }
            }
        ]);
    });

    it('edits emit the FULL next config; isBlank drops the value input AND the value', async () => {
        const el = mount({
            value: {
                action: 'show',
                logic: 'all',
                customLogic: null,
                rules: [{ source: 'el_1', operator: 'equals', value: 'Yes' }]
            }
        });
        await flush();
        expect(el.shadowRoot.querySelector('.re-value')).not.toBeNull();

        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail));
        const operator = el.shadowRoot.querySelector('.re-operator');
        operator.value = 'isBlank';
        operator.dispatchEvent(new CustomEvent('change'));
        expect(changes[0].value.rules[0]).toEqual({
            source: 'el_1',
            operator: 'isBlank',
            value: null
        });

        el.value = changes[0].value;
        await flush();
        expect(el.shadowRoot.querySelector('.re-value')).toBeNull();
    });

    it('removing the last rule emits null (back to always-visible)', async () => {
        const el = mount({
            value: {
                action: 'hide',
                logic: 'all',
                customLogic: null,
                rules: [{ source: 'el_1', operator: 'isBlank', value: null }]
            }
        });
        await flush();
        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail));
        el.shadowRoot.querySelector('.re-x').click();
        expect(changes).toEqual([{ value: null }]);
    });

    it('custom logic shows its input; the engine lint reports malformed expressions and bad scoping', async () => {
        const el = mount({
            sourceIndex: makeIndex([
                ['el_1', { type: 'field', repeatSectionId: null }],
                ['el_2', { type: 'field', repeatSectionId: 'sec_rep' }]
            ]),
            hostRepeatSectionId: null,
            value: {
                action: 'show',
                logic: 'custom',
                customLogic: '1 AND (',
                rules: [{ source: 'el_2', operator: 'equals', value: 'x' }]
            }
        });
        await flush();
        expect(el.shadowRoot.querySelector('.re-custom')).not.toBeNull();
        const problems = el.shadowRoot.querySelector('.re-problems');
        expect(problems.textContent).toContain('malformed');
        expect(problems.textContent).toContain('repeatable section');
    });
});

// ---- typed operators + value controls (PENDING_WORK §9.3, 2026-09-06) ----

const TYPED = [
    { id: 'f_text', label: 'First name' },
    { id: 'f_num', label: 'Age' },
    { id: 'f_check', label: 'Newsletter' },
    { id: 'f_date', label: 'Start date' },
    { id: 'f_dt', label: 'Seen at' },
    { id: 'f_pick', label: 'Employment status' },
    { id: 'f_file', label: 'Resume' }
];

function typedMount(rules, extra = {}) {
    const el = createElement('c-final-rule-editor', { is: FinalRuleEditor });
    Object.assign(
        el,
        {
            sources: TYPED,
            sourceIndex: makeIndex([
                ['f_text', { type: 'field', inputType: 'text' }],
                ['f_num', { type: 'field', inputType: 'number' }],
                ['f_check', { type: 'field', inputType: 'checkbox' }],
                ['f_date', { type: 'date', inputType: 'date' }],
                ['f_dt', { type: 'datetime', inputType: 'datetime' }],
                ['f_pick', { type: 'field', inputType: 'picklist' }],
                ['f_file', { type: 'field', inputType: 'file' }]
            ]),
            noun: 'field',
            value: { action: 'show', logic: 'all', customLogic: null, rules }
        },
        extra
    );
    document.body.appendChild(el);
    return el;
}

const ops = (el) =>
    [...el.shadowRoot.querySelectorAll('.re-operator option')].map(
        (o) => o.value
    );

const ALL_OPS = [
    'equals',
    'notEquals',
    'contains',
    'greaterThan',
    'lessThan',
    'isBlank',
    'isNotBlank'
];

describe('typed rule operators and value editors', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('offers ordered comparisons and a numeric input for a number source', async () => {
        const el = typedMount([
            { source: 'f_num', operator: 'equals', value: '30' }
        ]);
        await flush();
        expect(ops(el)).toEqual([
            'equals',
            'notEquals',
            'greaterThan',
            'lessThan',
            'isBlank',
            'isNotBlank'
        ]);
        expect(el.shadowRoot.querySelector('.re-value').type).toBe('number');
    });

    it('KEEPS contains for picklist sources (owner ruling) and drops gt/lt', async () => {
        const el = typedMount([
            { source: 'f_pick', operator: 'equals', value: 'Employed' }
        ]);
        await flush();
        expect(ops(el)).toContain('contains');
        expect(ops(el)).not.toContain('greaterThan');
        expect(ops(el)).not.toContain('lessThan');
        // the option dropdown is DEFERRED — value stays a plain text input
        const input = el.shadowRoot.querySelector('.re-value');
        expect(input.tagName).toBe('INPUT');
        expect(input.type).toBe('text');
        expect(input.value).toBe('Employed');
    });

    it('renders a Yes/No selector for a checkbox source and omits blank ops', async () => {
        const el = typedMount([
            { source: 'f_check', operator: 'equals', value: 'true' }
        ]);
        await flush();
        expect(ops(el)).toEqual(['equals', 'notEquals']);
        const select = el.shadowRoot.querySelector('select.re-value');
        expect(select).not.toBeNull();
        const opts = [...select.querySelectorAll('option')];
        expect(opts.map((o) => o.value)).toEqual(['true', 'false']);
        expect(opts.map((o) => o.textContent.trim())).toEqual(['Yes', 'No']);
        // "true" matches the engine's String(actual) === String(rule.value)
        expect(opts[0].selected).toBe(true);
    });

    it('renders date and datetime pickers', async () => {
        const el = typedMount([
            { source: 'f_date', operator: 'greaterThan', value: '2026-09-06' }
        ]);
        await flush();
        expect(el.shadowRoot.querySelector('.re-value').type).toBe('date');

        const el2 = typedMount([
            { source: 'f_dt', operator: 'lessThan', value: '' }
        ]);
        await flush();
        expect(el2.shadowRoot.querySelector('.re-value').type).toBe(
            'datetime-local'
        );
    });

    it('leaves unknown subtypes and record: sources fully untyped', async () => {
        const el = typedMount([
            { source: 'f_file', operator: 'equals', value: '' }
        ]);
        await flush();
        expect(ops(el)).toEqual(ALL_OPS);

        const el2 = typedMount(
            [{ source: 'record:Status__c', operator: 'contains', value: 'x' }],
            { recordSources: [{ id: 'record:Status__c', label: 'Status' }] }
        );
        await flush();
        expect(ops(el2)).toEqual(ALL_OPS);
        expect(el2.shadowRoot.querySelector('.re-value').type).toBe('text');
    });

    it('keeps a saved-but-now-invalid operator visible instead of silently rewriting it', async () => {
        // greaterThan on a picklist: authored before typing existed
        const el = typedMount([
            { source: 'f_pick', operator: 'greaterThan', value: 'x' }
        ]);
        await flush();
        const chosen = [
            ...el.shadowRoot.querySelectorAll('.re-operator option')
        ].find((o) => o.selected);
        expect(chosen.value).toBe('greaterThan');
        expect(chosen.textContent).toContain('not valid here');
    });

    it('repointing the source repairs a stranded operator and value', async () => {
        const el = typedMount([
            { source: 'f_text', operator: 'contains', value: 'Bob' }
        ]);
        await flush();
        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail.value));
        const src = el.shadowRoot.querySelector('.re-source');
        src.value = 'f_check';
        src.dispatchEvent(new CustomEvent('change'));
        // contains is not offered for checkbox -> equals; "Bob" cannot be shown
        // by a Yes/No select -> cleared rather than left invisibly wrong
        expect(changes[0].rules[0]).toEqual({
            source: 'f_check',
            operator: 'equals',
            value: ''
        });
    });

    it('repointing to a compatible subtype keeps the value', async () => {
        const el = typedMount([
            { source: 'f_text', operator: 'equals', value: '42' }
        ]);
        await flush();
        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail.value));
        const src = el.shadowRoot.querySelector('.re-source');
        src.value = 'f_num';
        src.dispatchEvent(new CustomEvent('change'));
        expect(changes[0].rules[0]).toEqual({
            source: 'f_num',
            operator: 'equals',
            value: '42'
        });
    });

    it('still omits the value control for blank operators', async () => {
        const el = typedMount([
            { source: 'f_num', operator: 'isBlank', value: null }
        ]);
        await flush();
        expect(el.shadowRoot.querySelector('.re-value')).toBeNull();
    });
});
