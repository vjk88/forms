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

/** A row's control: 'kind' | 'field' | 'operator' | 'value'. */
const control = (el, index, name) =>
    el.shadowRoot.querySelector(
        `[data-index="${index}"][data-control="${name}"]`
    );

/** The problem showing under a control ( '' when none). */
const problemOn = (el, index, name) =>
    control(el, index, name).closest('.re-cell').dataset.problem || '';

/** Every problem currently showing, in order. */
const shownProblems = (el) =>
    [...el.shadowRoot.querySelectorAll('[data-problem]')]
        .map((n) => n.dataset.problem)
        .filter(Boolean);

/** A lightning-* change carries its value in detail; a native one in target. */
function change(node, value) {
    if (node.tagName === 'INPUT') {
        node.value = value;
        node.dispatchEvent(new CustomEvent('change'));
    } else {
        node.dispatchEvent(new CustomEvent('change', { detail: { value } }));
    }
}

const rule = (source, operator, value) => ({ source, operator, value });

const config = (rules, extra = {}) => ({
    action: 'show',
    logic: 'all',
    customLogic: null,
    rules,
    ...extra
});

function listen(el) {
    const changes = [];
    el.addEventListener('rulechange', (e) => changes.push(e.detail.value));
    return changes;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-rule-editor', () => {
    it('empty state says the thing is always shown; Add condition asks for a field', async () => {
        const el = mount({ value: null });
        await flush();
        expect(el.shadowRoot.querySelector('.re-empty').textContent).toContain(
            'always shown'
        );
        const changes = listen(el);
        el.shadowRoot.querySelector('.re-add').click();
        // Nothing is chosen for the author: the new row's field is empty.
        expect(changes).toEqual([config([rule('', 'equals', '')])]);
    });

    it('lays conditions out as one row each under column headings shown once', async () => {
        const el = mount({
            value: config([
                rule('el_1', 'equals', 'Ann'),
                rule('el_2', 'isBlank', null)
            ])
        });
        await flush();
        const heads = [...el.shadowRoot.querySelectorAll('.re-col')].map((n) =>
            n.textContent.trim()
        );
        expect(heads).toEqual([
            'Source',
            'Question or field',
            'Operator',
            'Value'
        ]);
        expect(el.shadowRoot.querySelectorAll('.re-head')).toHaveLength(1);
        const nums = [...el.shadowRoot.querySelectorAll('.re-num')]
            .map((n) => n.textContent.trim())
            .filter(Boolean);
        expect(nums).toEqual(['1', '2']);
    });

    it('edits emit the FULL next config; isBlank drops the value control AND the value', async () => {
        const el = mount({ value: config([rule('el_1', 'equals', 'Yes')]) });
        await flush();
        expect(control(el, 0, 'value')).not.toBeNull();

        const changes = listen(el);
        change(control(el, 0, 'operator'), 'isBlank');
        expect(changes[0].rules[0]).toEqual(rule('el_1', 'isBlank', null));

        el.value = changes[0];
        await flush();
        expect(control(el, 0, 'value')).toBeNull();
    });

    it('removing the last condition emits null (back to always shown)', async () => {
        const el = mount({
            value: config([rule('el_1', 'isBlank', null)], { action: 'hide' })
        });
        await flush();
        const changes = listen(el);
        el.shadowRoot.querySelector('.re-del').click();
        expect(changes).toEqual([null]);
    });

    it('Show / Hide and the logic are dropdowns; the logic label follows the action', async () => {
        const el = mount({
            value: config([rule('el_1', 'equals', 'x')], { action: 'hide' })
        });
        await flush();
        expect(el.shadowRoot.querySelector('.re-logic').label).toBe(
            'Hide when'
        );
        const changes = listen(el);
        change(el.shadowRoot.querySelector('.re-action'), 'show');
        change(el.shadowRoot.querySelector('.re-logic'), 'any');
        expect(changes[0].action).toBe('show');
        expect(changes[1].logic).toBe('any');
    });

    it('lint from the runtime engine still shows, as a warning', async () => {
        const el = mount({
            sourceIndex: makeIndex([
                ['el_1', { type: 'field', repeatSectionId: null }],
                ['el_2', { type: 'field', repeatSectionId: 'sec_rep' }]
            ]),
            hostRepeatSectionId: null,
            value: config([rule('el_2', 'equals', 'x')])
        });
        await flush();
        expect(el.shadowRoot.querySelector('.re-lint').textContent).toContain(
            'repeatable section'
        );
    });

    it('lint doesn’t repeat what the row already says, and numbers conditions', async () => {
        // an unfinished row is "choose a field", not "not found"
        const el = mount({ value: config([rule('', 'equals', '')]) });
        await flush();
        expect(el.shadowRoot.querySelector('.re-lint')).toBeNull();

        // a field that has really gone is still reported
        const gone = mount({ value: config([rule('el_gone', 'equals', 'x')]) });
        await flush();
        expect(
            gone.shadowRoot.querySelector('.re-lint').textContent.trim()
        ).toBe('Condition 1: source element not found.');
    });
});

describe('problems beside their controls', () => {
    it('lists every problem with its row and control', async () => {
        const el = mount({
            value: config([rule('', 'equals', ''), rule('el_1', 'equals', '')])
        });
        await flush();
        expect(el.problems).toEqual([
            {
                rowIndex: 0,
                control: 'field',
                message: 'Choose a question or field.'
            },
            {
                rowIndex: 0,
                control: 'value',
                message: 'Enter a value, or use “Is blank”.'
            },
            {
                rowIndex: 1,
                control: 'value',
                message: 'Enter a value, or use “Is blank”.'
            }
        ]);
    });

    it('a fresh empty row shows nothing until it is used or Apply is tried', async () => {
        const el = mount({ value: config([rule('', 'equals', '')]) });
        await flush();
        expect(shownProblems(el)).toEqual([]);

        const first = el.reportProblems();
        await flush();
        expect(first).toEqual({
            rowIndex: 0,
            control: 'field',
            message: 'Choose a question or field.'
        });
        expect(shownProblems(el)).toEqual([
            'Choose a question or field.',
            'Enter a value, or use “Is blank”.'
        ]);
    });

    it('a problem is judged per control: picking a field doesn’t redden the value', async () => {
        const el = mount({ value: config([rule('', 'equals', '')]) });
        await flush();
        const changes = listen(el);
        change(control(el, 0, 'field'), 'el_1');
        el.value = changes[0];
        await flush();
        expect(shownProblems(el)).toEqual([]);

        change(control(el, 0, 'value'), '');
        el.value = changes[1];
        await flush();
        expect(problemOn(el, 0, 'value')).toBe(
            'Enter a value, or use “Is blank”.'
        );
    });

    it('focusProblem puts the cursor on that control', async () => {
        const el = mount({ value: config([rule('el_1', 'equals', '')]) });
        await flush();
        const target = control(el, 0, 'value');
        target.focus = jest.fn();
        el.focusProblem(el.reportProblems());
        expect(target.focus).toHaveBeenCalled();
    });

    it('reset forgets what was touched', async () => {
        const el = mount({ value: config([rule('', 'equals', '')]) });
        await flush();
        el.reportProblems();
        await flush();
        expect(shownProblems(el).length).toBeGreaterThan(0);
        el.reset();
        el.value = config([rule('', 'equals', '')]);
        await flush();
        expect(shownProblems(el)).toEqual([]);
    });

    it('knows which rows were added and never used', async () => {
        const el = mount({
            value: config([
                rule('el_1', 'equals', 'x'),
                rule('', 'equals', ''),
                rule('', 'equals', '')
            ])
        });
        await flush();
        const changes = listen(el);
        change(control(el, 2, 'operator'), 'isBlank');
        el.value = changes[0];
        await flush();
        expect(el.untouchedBlankRows()).toEqual([1]);
    });

    it('labels every control with its condition number', async () => {
        const el = mount({
            value: config([
                rule('el_1', 'equals', 'x'),
                rule('el_2', 'equals', 'y')
            ])
        });
        await flush();
        expect(control(el, 1, 'field').label).toBe(
            'Condition 2: question or field'
        );
        expect(control(el, 1, 'operator').label).toBe('Condition 2: operator');
        expect(control(el, 1, 'value').label).toBe('Condition 2: value');
        const del = el.shadowRoot.querySelectorAll('.re-del')[1];
        expect(del.alternativeText).toBe('Remove condition 2');
    });

    it.each([
        [
            '1 AND (2 OR 3)',
            'Condition 3 doesn’t exist — you have 2 conditions.'
        ],
        ['1 AND (2', 'A bracket isn’t closed.'],
        ['1 AND', 'The logic is incomplete'],
        [
            '1 XOR 2',
            'Only condition numbers, AND, OR, NOT and brackets are allowed.'
        ],
        ['', 'Enter the logic using condition numbers']
    ])('custom logic %p explains itself', async (expr, message) => {
        const el = mount({
            value: config(
                [rule('el_1', 'equals', 'a'), rule('el_2', 'equals', 'b')],
                { logic: 'custom', customLogic: expr }
            )
        });
        await flush();
        const logic = el.problems.find((p) => p.control === 'logic');
        expect(logic.message).toContain(message);
        el.reportProblems();
        await flush();
        expect(
            el.shadowRoot.querySelector('.re-custom-wrap').dataset.problem
        ).toContain(message);
    });

    it('judges typed logic when the author leaves the box, not mid-word', async () => {
        const el = mount({
            value: config(
                [rule('el_1', 'equals', 'a'), rule('el_2', 'equals', 'b')],
                { logic: 'custom', customLogic: '1 AND (' }
            )
        });
        await flush();
        const box = el.shadowRoot.querySelector('.re-custom');
        box.dispatchEvent(
            new CustomEvent('change', { detail: { value: '1 AND (' } })
        );
        await flush();
        expect(
            el.shadowRoot.querySelector('.re-custom-wrap').dataset.problem
        ).toBeFalsy();
        box.dispatchEvent(new CustomEvent('blur'));
        await flush();
        expect(
            el.shadowRoot.querySelector('.re-custom-wrap').dataset.problem
        ).toContain('The logic is incomplete');
    });

    it('custom logic that fits the conditions is no problem', async () => {
        const el = mount({
            value: config(
                [rule('el_1', 'equals', 'a'), rule('el_2', 'equals', 'b')],
                { logic: 'custom', customLogic: '(1 or 2)' }
            )
        });
        await flush();
        expect(el.problems).toEqual([]);
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
    return mount({
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
        value: config(rules),
        ...extra
    });
}

const ops = (el, i = 0) =>
    control(el, i, 'operator').options.map((o) => o.value);

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
    it('offers ordered comparisons and a numeric input for a number source', async () => {
        const el = typedMount([rule('f_num', 'equals', '30')]);
        await flush();
        expect(ops(el)).toEqual([
            'equals',
            'notEquals',
            'greaterThan',
            'lessThan',
            'isBlank',
            'isNotBlank'
        ]);
        expect(control(el, 0, 'value').type).toBe('number');
    });

    it('KEEPS contains for picklist sources (owner ruling) and drops gt/lt', async () => {
        const el = typedMount([rule('f_pick', 'equals', 'Employed')]);
        await flush();
        expect(ops(el)).toContain('contains');
        expect(ops(el)).not.toContain('greaterThan');
        expect(ops(el)).not.toContain('lessThan');
        // the option dropdown is DEFERRED — value stays a plain text input
        const input = control(el, 0, 'value');
        expect(input.type).toBe('text');
        expect(input.value).toBe('Employed');
    });

    it('renders a Yes/No choice for a checkbox source and omits blank ops', async () => {
        const el = typedMount([rule('f_check', 'equals', 'true')]);
        await flush();
        expect(ops(el)).toEqual(['equals', 'notEquals']);
        const yesNo = control(el, 0, 'value');
        expect(yesNo.tagName).toBe('LIGHTNING-COMBOBOX');
        expect(yesNo.options).toEqual([
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' }
        ]);
        // "true" matches the engine's String(actual) === String(rule.value)
        expect(yesNo.value).toBe('true');
    });

    it('renders date and datetime pickers; datetime keeps its stored format', async () => {
        const el = typedMount([rule('f_date', 'greaterThan', '2026-09-06')]);
        await flush();
        expect(control(el, 0, 'value').type).toBe('date');

        const el2 = typedMount([rule('f_dt', 'lessThan', '')]);
        await flush();
        const dt = control(el2, 0, 'value');
        expect(dt.tagName).toBe('INPUT');
        expect(dt.type).toBe('datetime-local');
    });

    it('leaves unknown subtypes and record: sources fully untyped', async () => {
        const el = typedMount([rule('f_file', 'equals', '')]);
        await flush();
        expect(ops(el)).toEqual(ALL_OPS);

        const el2 = typedMount([rule('record:Status__c', 'contains', 'x')], {
            recordSources: [{ id: 'record:Status__c', label: 'Status' }]
        });
        await flush();
        expect(ops(el2)).toEqual(ALL_OPS);
        expect(control(el2, 0, 'value').type).toBe('text');
        expect(control(el2, 0, 'kind').value).toBe('record');
    });

    it('keeps a saved-but-now-invalid operator visible instead of silently rewriting it', async () => {
        // greaterThan on a picklist: authored before typing existed
        const el = typedMount([rule('f_pick', 'greaterThan', 'x')]);
        await flush();
        const op = control(el, 0, 'operator');
        expect(op.value).toBe('greaterThan');
        expect(
            op.options.find((o) => o.value === 'greaterThan').label
        ).toContain('not valid here');
    });

    it('keeps a saved source that is no longer offered visible', async () => {
        const el = typedMount([rule('f_gone', 'equals', 'x')]);
        await flush();
        const field = control(el, 0, 'field');
        expect(field.value).toBe('f_gone');
        expect(field.options.find((o) => o.value === 'f_gone').label).toContain(
            'Removed question'
        );
    });

    it('repointing the source repairs a stranded operator and value', async () => {
        const el = typedMount([rule('f_text', 'contains', 'Bob')]);
        await flush();
        const changes = listen(el);
        change(control(el, 0, 'field'), 'f_check');
        // contains is not offered for checkbox -> equals; "Bob" cannot be shown
        // by a Yes/No choice -> cleared rather than left invisibly wrong
        expect(changes[0].rules[0]).toEqual(rule('f_check', 'equals', ''));
        el.value = changes[0];
        await flush();
        expect(control(el, 0, 'value').value).toBe('');
    });

    it.each(['', null, undefined, false, 'false', true, 'true', 'legacy'])(
        'shows the stored checkbox value honestly: %s',
        async (stored) => {
            const el = typedMount([rule('f_check', 'equals', stored)]);
            const changes = listen(el);
            await flush();
            const yesNo = control(el, 0, 'value');
            expect(yesNo.value).toBe(String(stored ?? ''));
            expect(changes).toEqual([]);
            change(yesNo, 'false');
            expect(changes[0].rules[0].value).toBe('false');
            el.value = changes[0];
            await flush();
            expect(control(el, 0, 'value').value).toBe('false');
        }
    );

    it('keeps a saved Yes/No value it can’t show, marked, rather than rewriting it', async () => {
        const el = typedMount([rule('f_check', 'equals', 'legacy')]);
        await flush();
        const yesNo = control(el, 0, 'value');
        expect(yesNo.value).toBe('legacy');
        expect(yesNo.options[0].label).toContain('not valid here');
    });

    it.each([
        ['f_date', '2026-09-06T12:30', ''],
        ['f_dt', '2026-09-06', ''],
        ['f_dt', '2026-09-06T12:30:00Z', ''],
        ['f_date', '2026-02-30', ''],
        ['f_date', 'September 6, 2026', ''],
        ['f_num', '0x2a', ''],
        ['f_num', ' 42 ', ''],
        ['f_num', '+42', ''],
        ['f_num', '1.', ''],
        ['f_num', '1e309', ''],
        ['f_num', '-2.5', '-2.5'],
        ['f_num', '0', '0'],
        ['f_num', '1e2', '1e2'],
        ['f_date', '2024-02-29', '2024-02-29'],
        ['f_dt', '2026-09-06T12:30', '2026-09-06T12:30']
    ])(
        'repointing to %s with %s stores and displays %s',
        async (source, stored, expected) => {
            const el = typedMount([rule('f_text', 'equals', stored)]);
            await flush();
            const changes = listen(el);
            change(control(el, 0, 'field'), source);
            expect(changes[0].rules[0].value).toBe(expected);
            el.value = changes[0];
            await flush();
            expect(control(el, 0, 'value').value).toBe(expected);
        }
    );

    it('repointing to a compatible subtype keeps the value', async () => {
        const el = typedMount([rule('f_text', 'equals', '42')]);
        await flush();
        const changes = listen(el);
        change(control(el, 0, 'field'), 'f_num');
        expect(changes[0].rules[0]).toEqual(rule('f_num', 'equals', '42'));
    });

    it('still omits the value control for blank operators', async () => {
        const el = typedMount([rule('f_num', 'isBlank', null)]);
        await flush();
        expect(control(el, 0, 'value')).toBeNull();
    });
});

describe('the Source column (visibility)', () => {
    const RECORD = [{ id: 'record:Status__c', label: 'Status' }];

    it('offers the linked record only when the form has one', async () => {
        const el = mount({ value: config([rule('el_1', 'equals', 'x')]) });
        await flush();
        expect(control(el, 0, 'kind').options.map((o) => o.value)).toEqual([
            'answer',
            'user'
        ]);

        const el2 = mount({
            recordSources: RECORD,
            value: config([rule('el_1', 'equals', 'x')])
        });
        await flush();
        expect(control(el2, 0, 'kind').options.map((o) => o.value)).toEqual([
            'answer',
            'record',
            'user'
        ]);
    });

    it('switching Source starts the row over and lists that source’s fields', async () => {
        const el = mount({
            recordSources: RECORD,
            value: config([rule('el_1', 'contains', 'x')])
        });
        await flush();
        const changes = listen(el);
        change(control(el, 0, 'kind'), 'record');
        expect(changes[0].rules[0]).toEqual(rule('', 'equals', ''));
        el.value = changes[0];
        await flush();
        expect(control(el, 0, 'kind').value).toBe('record');
        expect(control(el, 0, 'field').options.map((o) => o.value)).toEqual([
            'record:Status__c'
        ]);
    });
});

describe('record-search screens', () => {
    it.each(['lookup', 'mapping'])(
        '%s drops Show / Hide and the Source column',
        async (columns) => {
            const el = mount({
                columns,
                value: config([rule('el_1', 'equals', 'x')])
            });
            await flush();
            expect(el.shadowRoot.querySelector('.re-action')).toBeNull();
            expect(el.shadowRoot.querySelector('.re-logic').label).toBe(
                'Search records where'
            );
            expect(control(el, 0, 'kind')).toBeNull();
            const heads = [...el.shadowRoot.querySelectorAll('.re-col')].map(
                (n) => n.textContent.trim()
            );
            expect(heads).toEqual(['Field', 'Operator', 'Value']);
        }
    );

    it('explains an empty search in record terms', async () => {
        const el = mount({ columns: 'lookup', value: null });
        await flush();
        expect(el.shadowRoot.querySelector('.re-empty').textContent).toContain(
            'narrow which records are searched'
        );
    });

    it('asks for a field, not a question, on a record screen', async () => {
        const el = mount({
            columns: 'mapping',
            value: config([rule('', 'isBlank', null)])
        });
        await flush();
        expect(el.problems[0].message).toBe('Choose a field.');
    });
});

describe('Current user as a source (D55)', () => {
    it('is always offered on visibility screens', async () => {
        const el = mount({ value: config([rule('el_1', 'equals', 'x')]) });
        await flush();
        expect(control(el, 0, 'kind').options.map((o) => o.value)).toEqual([
            'answer',
            'user'
        ]);
    });

    it('searches User’s fields, with Profile name and Role name first', async () => {
        const el = mount({
            value: config([rule('user:Profile.Name', 'equals', 'Admin')])
        });
        await flush();
        const picker = control(el, 0, 'field');
        expect(picker.tagName).toBe('C-FINAL-FIELD-PICKER');
        expect(picker.objectApi).toBe('User');
        expect(picker.prefix).toBe('user:');
        expect(picker.extraItems.map((x) => x.label)).toEqual([
            'Profile name',
            'Role name'
        ]);
        expect(control(el, 0, 'kind').value).toBe('user');
    });

    it('types a picked user field, so a date gets date controls', async () => {
        const el = mount({ value: config([rule('', 'equals', '')]) });
        await flush();
        const changes = listen(el);
        change(control(el, 0, 'kind'), 'user');
        el.value = changes[0];
        await flush();
        control(el, 0, 'field').dispatchEvent(
            new CustomEvent('fieldchange', {
                detail: {
                    value: 'user:LastLoginDate',
                    label: 'Last Login',
                    type: 'datetime'
                }
            })
        );
        el.value = changes[1];
        await flush();
        expect(control(el, 0, 'value').type).toBe('datetime-local');
    });

    it('says what user conditions mean, and what they mean for guests', async () => {
        const el = mount({
            isPublic: true,
            value: config([rule('user:Profile.Name', 'equals', 'Admin')])
        });
        await flush();
        const hint = el.shadowRoot.querySelector('.re-user-hint').textContent;
        expect(hint).toContain('aren’t signed in');
        expect(hint).toContain('don’t rely on it to keep things private');
    });

    it('lint doesn’t call a user field "not found"', async () => {
        const el = mount({
            value: config([rule('user:Title', 'equals', 'Manager')])
        });
        await flush();
        expect(el.shadowRoot.querySelector('.re-lint')).toBeNull();
    });
});

describe('Compare with → Current user on lookup filters (D55)', () => {
    it('adds the column only when current user is allowed', async () => {
        const off = mount({
            columns: 'lookup',
            value: config([rule('el_1', 'equals', 'x')])
        });
        await flush();
        expect(control(off, 0, 'compare')).toBeNull();

        const on = mount({
            columns: 'lookup',
            allowCurrentUser: true,
            value: config([rule('el_1', 'equals', 'x')])
        });
        await flush();
        const heads = [...on.shadowRoot.querySelectorAll('.re-col')].map((n) =>
            n.textContent.trim()
        );
        expect(heads).toEqual(['Field', 'Operator', 'Compare with', 'Value']);
        expect(control(on, 0, 'compare').value).toBe('fixed');
    });

    it('choosing Current user empties the value and offers User’s fields', async () => {
        const el = mount({
            columns: 'lookup',
            allowCurrentUser: true,
            value: config([rule('el_1', 'equals', 'x')])
        });
        await flush();
        const changes = listen(el);
        change(control(el, 0, 'compare'), 'user');
        expect(changes[0].rules[0].value).toBe('');
        el.value = changes[0];
        await flush();
        const picker = control(el, 0, 'value');
        expect(picker.tagName).toBe('C-FINAL-FIELD-PICKER');
        expect(picker.prefix).toBe('$User.');
        expect(el.problems[0].message).toBe('Choose a user field.');
    });

    it('flags a saved user comparison once anonymous search is on', async () => {
        const el = mount({
            columns: 'lookup',
            allowCurrentUser: false,
            value: config([rule('el_1', 'equals', '$User.Profile.Name')])
        });
        await flush();
        expect(el.problems[0].message).toContain('aren’t signed in');
    });
});

describe('Compare with An answer (mapping screen, Task 7)', () => {
    const FIELDS = [
        { id: 'LastName', label: 'Last Name', type: 'string' },
        { id: 'NumberOfEmployees', label: 'Employees', type: 'integer' },
        { id: 'Type', label: 'Type', type: 'picklist' }
    ];
    const CHOICES = [
        {
            key: 'el_last',
            label: 'Your last name',
            fits: ['string', 'picklist']
        },
        { key: 'el_size', label: 'Team size', fits: ['integer', 'double'] },
        { key: 'el_many', label: 'Pick several', fits: [] }
    ];
    const mountMapping = (rules, props = {}) =>
        mount({
            columns: 'mapping',
            sources: FIELDS,
            sourceIndex: undefined,
            answerChoices: CHOICES,
            value: config(rules),
            ...props
        });
    const compareValues = (el, i) =>
        control(el, i, 'compare').options.map((o) => o.value);
    const answerLabels = (el, i) =>
        control(el, i, 'value').options.map((o) => o.label);

    it('is off on visibility: $field. stays plain text, no Compare with', async () => {
        const el = mount({
            answerChoices: CHOICES,
            value: config([rule('el_1', 'equals', '$field.el_last')])
        });
        await flush();
        expect(control(el, 0, 'compare')).toBeNull();
        expect(control(el, 0, 'value').tagName).toBe('LIGHTNING-INPUT');
        expect(control(el, 0, 'value').value).toBe('$field.el_last');
        expect(el.problems).toEqual([]);
    });

    it('offers only fitting, single-value answers', async () => {
        const el = mountMapping([rule('LastName', 'equals', '$field.el_last')]);
        await flush();
        expect(compareValues(el, 0)).toEqual(['fixed', 'answer']);
        expect(control(el, 0, 'compare').value).toBe('answer');
        expect(answerLabels(el, 0)).toEqual(['Your last name']);
        expect(el.problems).toEqual([]);
    });

    it('Contains offers answers only for text fields; Is one of offers none', async () => {
        const el = mountMapping([
            rule('LastName', 'contains', ''),
            rule('Type', 'contains', ''),
            rule('LastName', 'in', '')
        ]);
        await flush();
        expect(compareValues(el, 0)).toEqual(['fixed', 'answer']);
        expect(compareValues(el, 1)).toEqual(['fixed']);
        expect(compareValues(el, 2)).toEqual(['fixed']);
    });

    it('choosing An answer picks nothing, focuses the picker and asks for a question', async () => {
        const el = mountMapping([rule('LastName', 'equals', 'Smith')]);
        await flush();
        const changes = listen(el);
        const focused = [];
        const spy = jest
            .spyOn(HTMLElement.prototype, 'focus')
            .mockImplementation(function () {
                focused.push(this);
            });
        change(control(el, 0, 'compare'), 'answer');
        expect(changes[0].rules[0].value).toBe('');
        el.value = changes[0];
        await flush();
        await flush();
        const picker = control(el, 0, 'value');
        expect(picker.tagName).toBe('LIGHTNING-COMBOBOX');
        expect(picker.placeholder).toBe('Choose a question…');
        expect(focused).toContain(picker);
        spy.mockRestore();
        expect(el.problems.map((p) => p.message)).toEqual([
            'Choose a question.'
        ]);
    });

    it('an operator change that rules the answer out keeps it, marked', async () => {
        const el = mountMapping([rule('LastName', 'equals', '$field.el_last')]);
        await flush();
        const changes = listen(el);
        change(control(el, 0, 'operator'), 'in');
        expect(changes[0].rules[0].value).toBe('$field.el_last');
        el.value = changes[0];
        await flush();
        expect(answerLabels(el, 0)).toEqual([
            'Your last name (Can’t be used with this operator)'
        ]);
        expect(el.problems[0].message).toBe(
            'This question can’t be used with this operator.'
        );
    });

    it('a removed question shows as removed, untouched', async () => {
        const el = mountMapping([rule('LastName', 'equals', '$field.el_gone')]);
        await flush();
        expect(control(el, 0, 'value').value).toBe('$field.el_gone');
        expect(answerLabels(el, 0)).toContain('(Question removed)');
        expect(el.problems[0].message).toBe('Question removed.');
    });

    it('a question whose type no longer fits says so', async () => {
        const el = mountMapping([
            rule('NumberOfEmployees', 'equals', '$field.el_last')
        ]);
        await flush();
        expect(answerLabels(el, 0)).toContain(
            'Your last name (Question type is incompatible)'
        );
        expect(el.problems[0].message).toBe('Question type is incompatible.');
    });

    it('never lists a question that holds several values', async () => {
        const el = mountMapping([rule('Type', 'equals', '$field.el_last')]);
        await flush();
        expect(answerLabels(el, 0)).not.toContain('Pick several');
    });

    it('with no questions, a saved answer still shows removed, blocks, and nothing new is offered', async () => {
        const el = mountMapping(
            [
                rule('LastName', 'equals', '$field.el_gone'),
                rule('LastName', 'equals', '')
            ],
            { answerChoices: [] }
        );
        await flush();
        expect(answerLabels(el, 0)).toEqual(['(Question removed)']);
        expect(compareValues(el, 1)).toEqual(['fixed']);
        expect(el.reportProblems().message).toBe('Question removed.');
    });
});

describe('record screens type the value box by field (round 1 #7)', () => {
    it('a checkbox field offers True / False, a date field a date picker', async () => {
        const el = mount({
            columns: 'lookup',
            sourceIndex: undefined,
            sources: [
                { id: 'DoNotCall', label: 'Do Not Call', type: 'boolean' },
                { id: 'Birthdate', label: 'Birthdate', type: 'date' }
            ],
            value: config([
                rule('DoNotCall', 'equals', 'false'),
                rule('Birthdate', 'equals', '')
            ])
        });
        await flush();
        const bool = control(el, 0, 'value');
        expect(bool.tagName).toBe('LIGHTNING-COMBOBOX');
        expect(bool.options.map((o) => o.label)).toEqual(['True', 'False']);
        expect(control(el, 1, 'value').type).toBe('date');
    });

    it('keeps a saved value visible when the typed box cannot show it', async () => {
        const el = mount({
            columns: 'lookup',
            sourceIndex: undefined,
            sources: [{ id: 'Birthdate', label: 'Birthdate', type: 'date' }],
            value: config([
                rule('Birthdate', 'equals', 'TODAY'),
                rule('Birthdate', 'contains', '2026')
            ])
        });
        await flush();
        expect(control(el, 0, 'value').type).toBe('text');
        expect(control(el, 0, 'value').value).toBe('TODAY');
        expect(control(el, 1, 'value').type).toBe('text');
    });

    it('an answer that can be skipped gets a note beside it', async () => {
        const el = mount({
            columns: 'mapping',
            sourceIndex: undefined,
            sources: [{ id: 'LastName', label: 'Last Name', type: 'string' }],
            answerChoices: [
                {
                    key: 'el_n',
                    label: 'Nickname',
                    skippable: true,
                    fits: ['string']
                }
            ],
            value: config([rule('LastName', 'equals', '$field.el_n')])
        });
        await flush();
        const note = el.shadowRoot.querySelector('.re-answer-note');
        expect(note.textContent).toContain('“Nickname” can be skipped');
        // a note, not a problem: Apply still works
        expect(el.problems).toEqual([]);
    });
});
