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

    it('update shows an overwrite tick per field, off, and none on the match field', async () => {
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
            )
        ).toBeNull();
        expect(
            el.shadowRoot.querySelector('[data-row="Email"] .ma-lock')
                .textContent
        ).toContain('never overwritten');
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
});
