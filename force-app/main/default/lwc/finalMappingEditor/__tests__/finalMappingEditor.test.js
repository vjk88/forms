import { createElement } from 'lwc';
import FinalMappingEditor from 'c/finalMappingEditor';
import describeQuestions from '@salesforce/apex/FinalMappingController.describeQuestions';

jest.mock(
    '@salesforce/apex/FinalMappingController.listCreatableObjects',
    () => ({
        default: jest.fn(() =>
            Promise.resolve([{ label: 'Contact', value: 'Contact' }])
        )
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalMappingController.compatibility',
    () => ({ default: jest.fn(() => Promise.resolve({})) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalMappingController.describeQuestions',
    () => ({ default: jest.fn() }),
    {
        virtual: true
    }
);

jest.mock(
    '@salesforce/apex/FinalStudioController.describeFields',
    () => ({
        default: jest.fn(() =>
            Promise.resolve([
                { apiName: 'Email', label: 'Email' },
                { apiName: 'LastName', label: 'Last Name' }
            ])
        )
    }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(spec) {
    const el = createElement('c-final-mapping-editor', {
        is: FinalMappingEditor
    });
    el.spec = spec;
    document.body.appendChild(el);
    return el;
}

describe('c-final-mapping-editor', () => {
    beforeEach(() => {
        describeQuestions.mockResolvedValue([
            {
                elementKey: 'el_e',
                label: 'Work email',
                answerType: 'Email',
                skippable: false,
                mappable: true
            },
            {
                elementKey: 'el_n',
                label: 'Anything else',
                answerType: 'Text',
                skippable: true,
                mappable: true
            }
        ]);
    });
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
    });

    it('invites the first record when there are none', async () => {
        const el = mount({ pages: [] });
        await flush();
        expect(
            el.shadowRoot.querySelector('.me-empty-title').textContent
        ).toContain('Send answers');
    });

    it('lists steps in order and marks an unfinished one', async () => {
        const el = mount({
            pages: [],
            mapping: {
                actions: [
                    {
                        id: 'act_1',
                        object: 'Contact',
                        operation: 'findOrCreate',
                        fields: [
                            {
                                field: 'LastName',
                                source: { kind: 'answer', elementKey: 'el_n' }
                            }
                        ],
                        match: { field: 'Email' }
                    }
                ]
            }
        });
        await flush();
        const card = el.shadowRoot.querySelector('.me-card');
        expect(card.textContent).toContain('1');
        expect(card.querySelector('.me-card-state').textContent).toBe(
            'Not finished'
        );
    });

    it('shows which answers go nowhere', async () => {
        const el = mount({
            pages: [],
            mapping: {
                actions: [
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
                ]
            }
        });
        await flush();
        const rows = [...el.shadowRoot.querySelectorAll('.me-index-row')].map(
            (r) => r.textContent
        );
        expect(rows[0]).toContain('Contact · Email');
        expect(rows[1]).toContain('Stored only');
    });

    it('moving a step emits the reordered spec', async () => {
        const el = mount({
            pages: [],
            mapping: {
                actions: [
                    {
                        id: 'act_1',
                        object: 'Contact',
                        operation: 'create',
                        fields: []
                    },
                    {
                        id: 'act_2',
                        object: 'Case',
                        operation: 'create',
                        fields: []
                    }
                ]
            }
        });
        await flush();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelectorAll('lightning-button-icon[data-index="1"]')[0]
            .click();
        expect(
            handler.mock.calls[0][0].detail.spec.mapping.actions.map(
                (a) => a.id
            )
        ).toEqual(['act_2', 'act_1']);
    });
});

describe('c-final-mapping-editor wording', () => {
    beforeEach(() => {
        describeQuestions.mockResolvedValue([
            {
                elementKey: 'el_n',
                label: 'Your name',
                answerType: 'Text',
                skippable: false,
                mappable: true
            }
        ]);
    });
    afterEach(() => {
        while (document.body.firstChild)
            document.body.removeChild(document.body.firstChild);
    });

    it('names fields by their label, never their API name', async () => {
        const el = mount({
            pages: [],
            mapping: {
                actions: [
                    {
                        id: 'act_1',
                        object: 'Contact',
                        operation: 'create',
                        fields: [
                            {
                                field: 'LastName',
                                source: { kind: 'answer', elementKey: 'el_n' }
                            }
                        ]
                    }
                ]
            }
        });
        await flush();
        await flush();
        const row = el.shadowRoot.querySelector('.me-index-row').textContent;
        expect(row).toContain('Contact · Last Name');
        expect(row).not.toContain('LastName');
    });

    it('says 1 field, not 1 fields', async () => {
        const el = mount({
            pages: [],
            mapping: {
                actions: [
                    {
                        id: 'act_1',
                        object: 'Contact',
                        operation: 'create',
                        fields: [
                            {
                                field: 'LastName',
                                source: { kind: 'answer', elementKey: 'el_n' }
                            }
                        ]
                    }
                ]
            }
        });
        await flush();
        expect(el.shadowRoot.querySelector('.me-card-detail').textContent).toBe(
            'Create · 1 field'
        );
    });
});
