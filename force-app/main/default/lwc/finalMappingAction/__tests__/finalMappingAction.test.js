import { createElement } from 'lwc';
import FinalMappingAction from 'c/finalMappingAction';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';

jest.mock(
    '@salesforce/apex/FinalStudioController.describeFields',
    () => ({ default: jest.fn() }),
    {
        virtual: true
    }
);

const FIELDS = [
    {
        apiName: 'LastName',
        label: 'Last Name',
        displayType: 'STRING',
        required: true
    },
    { apiName: 'Email', label: 'Email', displayType: 'EMAIL', required: false },
    {
        apiName: 'Birthdate',
        label: 'Birthdate',
        displayType: 'DATE',
        required: false
    },
    {
        apiName: 'ReportsToId',
        label: 'Reports To',
        displayType: 'REFERENCE',
        required: false,
        referenceTo: 'Contact'
    }
];
const CASE_FIELDS = [
    {
        apiName: 'Subject',
        label: 'Subject',
        displayType: 'STRING',
        required: false
    },
    {
        apiName: 'Status',
        label: 'Status',
        displayType: 'PICKLIST',
        required: false
    }
];
const QUESTIONS = [
    {
        elementKey: 'el_e',
        label: 'Work email',
        answerType: 'Email',
        mappable: true
    },
    {
        elementKey: 'el_n',
        label: 'Your surname',
        answerType: 'Text',
        mappable: true
    }
];
const COMPAT = {
    Email: ['EMAIL', 'STRING', 'TEXTAREA'],
    Text: ['STRING', 'TEXTAREA']
};

function mount(actions, actionId) {
    describeFields.mockResolvedValue(FIELDS);
    const el = createElement('c-final-mapping-action', {
        is: FinalMappingAction
    });
    Object.assign(el, {
        spec: { mapping: { actions } },
        actionId,
        objects: [{ label: 'Contact', value: 'Contact' }],
        questions: QUESTIONS,
        compatibility: COMPAT
    });
    document.body.appendChild(el);
    return el;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('c-final-mapping-action', () => {
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
    });

    it('offers only answers that fit the field', async () => {
        const el = mount(
            [
                {
                    id: 'act_1',
                    object: 'Contact',
                    operation: 'create',
                    fields: [{ field: 'Email', source: null }]
                }
            ],
            'act_1'
        );
        await flush();
        const picker = el.shadowRoot.querySelector(
            'lightning-combobox[data-field="Email"]'
        );
        const values = picker.options.map((o) => o.value);
        expect(values).toContain('answer:el_e');
        expect(values).not.toContain('answer:el_n'); // text never goes into Email
        expect(values).toContain('literal');
    });

    it('explains why another record is not offered', async () => {
        const el = mount(
            [
                {
                    id: 'act_1',
                    object: 'Contact',
                    operation: 'create',
                    fields: [{ field: 'Email', source: null }]
                }
            ],
            'act_1'
        );
        await flush();
        expect(
            el.shadowRoot.querySelector('[data-row="Email"] .ma-why')
                .textContent
        ).toContain('isn’t a lookup');
    });

    it('offers earlier steps for a lookup field', async () => {
        const el = mount(
            [
                {
                    id: 'act_0',
                    object: 'Contact',
                    operation: 'create',
                    fields: []
                },
                {
                    id: 'act_1',
                    object: 'Contact',
                    operation: 'create',
                    fields: [{ field: 'ReportsToId', source: null }]
                }
            ],
            'act_1'
        );
        await flush();
        const values = el.shadowRoot
            .querySelector('lightning-combobox[data-field="ReportsToId"]')
            .options.map((o) => o.value);
        expect(values).toContain('action:act_0');
    });

    it('choosing an answer emits the spec with that source', async () => {
        const el = mount(
            [
                {
                    id: 'act_1',
                    object: 'Contact',
                    operation: 'create',
                    fields: [{ field: 'Email', source: null }]
                }
            ],
            'act_1'
        );
        await flush();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('lightning-combobox[data-field="Email"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: 'answer:el_e' } })
            );
        const action = handler.mock.calls[0][0].detail.spec.mapping.actions[0];
        expect(action.fields[0].source).toEqual({
            kind: 'answer',
            elementKey: 'el_e'
        });
    });

    it('drops a describe that lands after the author moved on', async () => {
        // Two steps, two describes, finishing in the wrong order. Without the
        // guard the Case step offers Contact's fields.
        let landLate;
        describeFields.mockReset();
        describeFields
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        landLate = () => resolve(FIELDS);
                    })
            )
            .mockImplementationOnce(() => Promise.resolve(CASE_FIELDS));

        const el = createElement('c-final-mapping-action', {
            is: FinalMappingAction
        });
        Object.assign(el, {
            spec: {
                mapping: {
                    actions: [
                        {
                            id: 'act_1',
                            object: 'Contact',
                            operation: 'create',
                            fields: [{ field: 'LastName', source: null }]
                        },
                        {
                            id: 'act_2',
                            object: 'Case',
                            operation: 'create',
                            fields: [{ field: 'Subject', source: null }]
                        }
                    ]
                }
            },
            actionId: 'act_1',
            objects: [
                { label: 'Contact', value: 'Contact' },
                { label: 'Case', value: 'Case' }
            ],
            questions: QUESTIONS,
            compatibility: COMPAT
        });
        document.body.appendChild(el);
        el.actionId = 'act_2';
        await flush();
        landLate();
        await flush();

        const offered = el.shadowRoot
            .querySelector('.ma-add-field')
            .options.map((o) => o.value);
        expect(offered).toEqual(['Status']);
    });

    it('does not offer a field that can point at several kinds of record', async () => {
        describeFields.mockReset();
        describeFields.mockResolvedValue([
            {
                apiName: 'Subject',
                label: 'Subject',
                displayType: 'STRING',
                required: false
            },
            {
                apiName: 'WhatId',
                label: 'Related To',
                displayType: 'REFERENCE',
                polymorphic: true
            }
        ]);
        const el = createElement('c-final-mapping-action', {
            is: FinalMappingAction
        });
        Object.assign(el, {
            spec: {
                mapping: {
                    actions: [
                        {
                            id: 'act_1',
                            object: 'Task',
                            operation: 'create',
                            fields: []
                        }
                    ]
                }
            },
            actionId: 'act_1',
            objects: [{ label: 'Task', value: 'Task' }],
            questions: QUESTIONS,
            compatibility: COMPAT
        });
        document.body.appendChild(el);
        await flush();
        const offered = el.shadowRoot
            .querySelector('.ma-add-field')
            .options.map((o) => o.value);
        expect(offered).toEqual(['Subject']);
    });

    it('marks required fields', async () => {
        const el = mount(
            [
                {
                    id: 'act_1',
                    object: 'Contact',
                    operation: 'create',
                    fields: [{ field: 'LastName', source: null }]
                }
            ],
            'act_1'
        );
        await flush();
        expect(
            el.shadowRoot.querySelector('[data-row="LastName"] .ma-required')
        ).toBeTruthy();
    });
});

describe('find or create', () => {
    const foc = (match, fields) => [
        {
            id: 'act_1',
            object: 'Contact',
            operation: 'findOrCreate',
            match,
            fields
        }
    ];

    it('asks what happens on a match, and says why on a public form', async () => {
        const el = mount(
            foc(
                {
                    field: 'Email',
                    source: { kind: 'answer', elementKey: 'el_e' },
                    filter: { logic: 'all', rows: [] }
                },
                []
            ),
            'act_1'
        );
        el.isPublic = true;
        await flush();
        const q = el.shadowRoot.querySelector('.ma-question');
        expect(q.textContent).toContain('When we find one');
        expect(q.textContent).toContain('without signing in');
    });

    it('answering "use it" emits reuse and hides the question', async () => {
        const el = mount(
            foc(
                {
                    field: 'Email',
                    source: null,
                    filter: { logic: 'all', rows: [] }
                },
                []
            ),
            'act_1'
        );
        await flush();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot.querySelector('[data-on-match="reuse"]').click();
        expect(
            handler.mock.calls[0][0].detail.spec.mapping.actions[0].match
                .onMatch
        ).toBe('reuse');
    });

    it('update shows a tick on every field, off — no field is locked', async () => {
        const el = mount(
            foc(
                {
                    field: 'Email',
                    source: { kind: 'answer', elementKey: 'el_e' },
                    filter: { logic: 'all', rows: [] },
                    onMatch: 'update'
                },
                [
                    {
                        field: 'Email',
                        source: { kind: 'answer', elementKey: 'el_e' }
                    },
                    {
                        field: 'LastName',
                        source: { kind: 'answer', elementKey: 'el_n' }
                    }
                ]
            ),
            'act_1'
        );
        await flush();
        expect(
            el.shadowRoot.querySelector(
                '[data-row="LastName"] lightning-input[data-overwrite]'
            ).checked
        ).toBe(false);
        expect(
            el.shadowRoot.querySelector(
                '[data-row="Email"] lightning-input[data-overwrite]'
            ).checked
        ).toBe(false);
        expect(el.shadowRoot.querySelector('.ma-lock')).toBeNull();
    });

    it('an older step reads its Where/Matches as the first condition', async () => {
        const el = mount(
            foc(
                {
                    field: 'Email',
                    source: { kind: 'answer', elementKey: 'el_e' },
                    filter: {
                        logic: 'all',
                        rows: [
                            { fieldPath: 'Title', operator: 'eq', value: 'x' }
                        ]
                    },
                    onMatch: 'reuse'
                },
                []
            ),
            'act_1'
        );
        await flush();
        const filter = el.shadowRoot.querySelector('c-final-lookup-filter');
        expect(filter.value.filter.rows).toEqual([
            { fieldPath: 'Email', operator: 'eq', value: '$field.el_e' },
            { fieldPath: 'Title', operator: 'eq', value: 'x' }
        ]);
        expect(
            el.shadowRoot.querySelectorAll('lightning-combobox[label="Where"]')
                .length
        ).toBe(0);
    });

    it('passes the filter to the lookup filter editor and takes its changes', async () => {
        const el = mount(
            foc(
                {
                    field: 'Email',
                    source: null,
                    filter: { logic: 'all', rows: [] }
                },
                []
            ),
            'act_1'
        );
        await flush();
        const editor = el.shadowRoot.querySelector('c-final-lookup-filter');
        expect(editor.targetObject).toBe('Contact');
        expect(editor.filterOnly).toBe(true); // no result-display, search or guest controls here
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const rows = [{ fieldPath: 'LastName', operator: 'isNotBlank' }];
        editor.dispatchEvent(
            new CustomEvent('lookupconfigchange', {
                detail: { value: { filter: { logic: 'all', rows } } }
            })
        );
        expect(
            handler.mock.calls[0][0].detail.spec.mapping.actions[0].match.filter
                .rows
        ).toEqual(rows);
    });

    it('hands the filter every question, with what each can compare with', async () => {
        const el = mount(
            foc(
                {
                    field: 'Email',
                    source: { kind: 'answer', elementKey: 'el_e' },
                    filter: { logic: 'all', rows: [] }
                },
                []
            ),
            'act_1'
        );
        el.questions = [
            ...QUESTIONS,
            {
                elementKey: 'el_o',
                label: 'Pick several',
                answerType: 'Options',
                mappable: true
            }
        ];
        await flush();
        const filter = el.shadowRoot.querySelector('c-final-lookup-filter');
        expect(filter.answerChoices).toEqual([
            {
                key: 'el_e',
                label: 'Work email',
                skippable: false,
                fits: ['email', 'string', 'textarea']
            },
            {
                key: 'el_n',
                label: 'Your surname',
                skippable: false,
                fits: ['string', 'textarea']
            },
            { key: 'el_o', label: 'Pick several', skippable: false, fits: [] }
        ]);
    });
});

describe('the step reads as its branches (S5)', () => {
    const headings = (el) =>
        [...el.shadowRoot.querySelectorAll('.ma-subhead')].map((n) =>
            n.textContent.trim()
        );
    const findStep = (onMatch) => ({
        id: 'act_1',
        object: 'Contact',
        operation: 'findOrCreate',
        match: {
            field: 'Email',
            source: { kind: 'answer', elementKey: 'el_e' },
            filter: { logic: 'all', rows: [] },
            ...(onMatch ? { onMatch } : {})
        },
        fields: [{ field: 'LastName', source: null }]
    });

    it('an Always create step shows only its create list', async () => {
        const el = mount(
            [
                {
                    id: 'act_1',
                    object: 'Contact',
                    operation: 'create',
                    fields: []
                }
            ],
            'act_1'
        );
        await flush();
        expect(headings(el)).toEqual(['Create a Contact with']);
    });

    it('a find-or-create step reads find / if found / if none', async () => {
        const el = mount([findStep('reuse')], 'act_1');
        await flush();
        expect(headings(el)).toEqual([
            'Find an existing Contact where',
            'If one is found',
            'If none is found, create a Contact with'
        ]);
        expect(
            el.shadowRoot.querySelector('.ma-match-summary').textContent
        ).toContain('It’s used as-is. Nothing is written to it.');
    });

    it('update mode names the column it relies on', async () => {
        const el = mount([findStep('update')], 'act_1');
        await flush();
        expect(
            el.shadowRoot.querySelector('.ma-match-summary').textContent
        ).toContain(
            'It’s updated with the fields ticked under “Also update when found”. None are ticked yet'
        );
        const heads = [...el.shadowRoot.querySelectorAll('.ma-th')].map((n) =>
            n.textContent.trim()
        );
        expect(heads).toContain('Also update when found');
    });

    it('says why Another record is missing only until a source is picked', async () => {
        const el = mount(
            [
                {
                    id: 'act_1',
                    object: 'Contact',
                    operation: 'create',
                    fields: [
                        {
                            field: 'Email',
                            source: { kind: 'answer', elementKey: 'el_e' }
                        }
                    ]
                }
            ],
            'act_1'
        );
        await flush();
        expect(
            el.shadowRoot.querySelector('[data-row="Email"] .ma-why')
        ).toBeNull();
    });

    it('uses an before a vowel', async () => {
        describeFields.mockResolvedValue([]);
        const el = mount(
            [
                {
                    id: 'act_1',
                    object: 'Account',
                    operation: 'create',
                    fields: []
                }
            ],
            'act_1'
        );
        el.objects = [{ label: 'Account', value: 'Account' }];
        await flush();
        expect(headings(el)).toEqual(['Create an Account with']);
    });
});

describe('the step says why its search is not finished', () => {
    const step = (filter) => [
        {
            id: 'act_1',
            object: 'Contact',
            operation: 'findOrCreate',
            match: { onMatch: 'reuse', filter },
            fields: []
        }
    ];
    const notes = (el) =>
        [...el.shadowRoot.querySelectorAll('.ma-search-note')].map((n) =>
            n.textContent.trim()
        );

    it('conditions with no answer ask for one', async () => {
        const el = mount(
            step({
                logic: 'all',
                rows: [{ fieldPath: 'Title', operator: 'eq', value: 'CEO' }]
            }),
            'act_1'
        );
        await flush();
        expect(notes(el)[0]).toContain(
            'At least one condition must compare with an answer'
        );
    });

    it('a question someone may skip is left to its own row', async () => {
        const el = mount(
            step({
                logic: 'all',
                rows: [
                    { fieldPath: 'Email', operator: 'eq', value: '$field.el_e' }
                ]
            }),
            'act_1'
        );
        el.questions = [{ ...QUESTIONS[0], skippable: true }, QUESTIONS[1]];
        await flush();
        expect(notes(el)).toEqual([]);
        const filter = el.shadowRoot.querySelector('c-final-lookup-filter');
        expect(
            filter.answerChoices.find((q) => q.key === 'el_e').skippable
        ).toBe(true);
    });
});
