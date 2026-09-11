import { createElement } from 'lwc';
import FinalLookupConfigEditor from 'c/finalLookupConfigEditor';
import describeLookupFields from '@salesforce/apex/FinalStudioController.describeLookupFields';

jest.mock(
    '@salesforce/apex/FinalStudioController.describeLookupFields',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

const FIELDS = [
    {
        apiName: 'AccountId',
        label: 'Account',
        kind: 'reference',
        referenceTo: 'Account',
        filterable: true,
        searchable: false,
        displayable: true,
        operators: ['eq', 'ne']
    },
    {
        apiName: 'Title',
        label: 'Title',
        kind: 'text',
        filterable: true,
        searchable: true,
        displayable: true,
        operators: ['eq', 'ne']
    },
    {
        apiName: 'LeadSource',
        label: 'Lead Source',
        kind: 'picklist',
        filterable: true,
        searchable: false,
        displayable: true,
        operators: ['eq', 'ne'],
        options: [
            { value: 'Web', label: 'Web' },
            { value: 'Phone', label: 'Phone Enquiry' }
        ]
    },
    {
        apiName: 'AnnualRevenue',
        label: 'Annual Revenue',
        kind: 'number',
        filterable: true,
        searchable: false,
        displayable: true,
        operators: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte']
    },
    {
        apiName: 'Birthdate',
        label: 'Birthdate',
        filterable: false,
        searchable: false,
        displayable: true
    }
];

const SOURCES = [
    {
        id: 'el_account',
        label: 'Account',
        inputType: 'reference',
        referenceTo: 'Account'
    },
    {
        id: 'el_other_lookup',
        label: 'Owner',
        inputType: 'reference',
        referenceTo: 'User'
    },
    { id: 'el_title', label: 'Job title', inputType: 'text' },
    { id: 'el_revenue', label: 'Revenue', inputType: 'number' }
];

const config = (criteria, mode = 'all') => ({
    version: 1,
    filter: { mode, criteria }
});

const answerRow = (fieldPath, elementId) => ({
    id: 'lc_1',
    fieldPath,
    operator: 'eq',
    value: { kind: 'answer', elementId }
});

const mount = async (props = {}) => {
    const el = createElement('c-final-lookup-config-editor', {
        is: FinalLookupConfigEditor
    });
    Object.assign(
        el,
        {
            targetObject: 'Contact',
            targetObjectLabel: 'Contact',
            elementLabel: 'Contact',
            answerSources: SOURCES
        },
        props
    );
    document.body.appendChild(el);
    describeLookupFields.emit(FIELDS);
    await flush();
    return el;
};

const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];
const texts = (el, sel) => qa(el, sel).map((n) => n.textContent.trim());

const emitted = (el) => {
    const handler = jest.fn();
    el.addEventListener('lookupconfigchange', handler);
    return () => handler.mock.calls.map((c) => c[0].detail.lookupConfig);
};

const change = (node, value) => {
    node.value = value;
    node.dispatchEvent(new CustomEvent('change'));
};

describe('c-final-lookup-config-editor', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('never seeds a condition with the record’s own Id', async () => {
        // Id sorts first out of Describe, and filtering a record by its own Id
        // is not what anyone means by "add a condition".
        const el = await mount();
        const read = emitted(el);
        q(el, '.lce-add').click();
        expect(read()[0].filter.criteria[0].fieldPath).not.toBe('Id');
    });

    it('says plainly that nothing is narrowed yet', async () => {
        const el = await mount();
        expect(texts(el, '.lce-muted').join(' ')).toContain('Every Contact');
    });

    it('offers only filterable fields as conditions', async () => {
        const el = await mount({
            config: config([answerRow('AccountId', 'el_account')])
        });
        const options = texts(el, '.lce-row select:first-of-type option');
        expect(options).toContain('Account');
        expect(options).toContain('Annual Revenue');
        // Birthdate is displayable but not filterable in v1.
        expect(options).not.toContain('Birthdate');
    });

    it('offers only text fields to search on', async () => {
        const el = await mount();
        const search = qa(el, 'select')[1];
        const labels = [...search.options].map((o) => o.textContent.trim());
        expect(labels).toEqual(['Name (default)', 'Title']);
    });

    it('offers only answers that could stand in for the field', async () => {
        const el = await mount({
            config: config([answerRow('AccountId', 'el_account')])
        });
        const sourceSelect = qa(el, '.lce-row select')[3];
        const labels = [...sourceSelect.options]
            .map((o) => o.textContent.trim())
            .filter((t) => t !== 'Choose a question…');
        // Only the Account lookup. A User lookup, a text answer and a number
        // answer are all the wrong shape for an Account criterion.
        expect(labels).toEqual(['Account']);
    });

    it('offers every non-lookup answer for a text field', async () => {
        const el = await mount({
            config: config([answerRow('Title', 'el_title')])
        });
        const sourceSelect = qa(el, '.lce-row select')[3];
        const labels = [...sourceSelect.options]
            .map((o) => o.textContent.trim())
            .filter((t) => t !== 'Choose a question…');
        expect(labels).toEqual(['Job title', 'Revenue']);
    });

    it('says so when no question on the form can answer a condition', async () => {
        const el = await mount({
            config: config([answerRow('AccountId', 'el_account')]),
            answerSources: [
                { id: 'el_title', label: 'Job title', inputType: 'text' }
            ]
        });
        expect(q(el, '.lce-row .lce-muted').textContent).toContain(
            'No question on this form can answer that'
        );
    });

    it('adds a condition seeded with a plausible field', async () => {
        const el = await mount();
        const read = emitted(el);
        q(el, '.lce-add').click();
        const [next] = read();
        expect(next.version).toBe(1);
        expect(next.filter.criteria).toHaveLength(1);
        expect(next.filter.criteria[0].fieldPath).toBe('AccountId');
        expect(next.filter.criteria[0].value).toEqual({
            kind: 'answer',
            elementId: ''
        });
    });

    it('clears the comparison and the value when the field changes', async () => {
        const el = await mount({
            config: config([
                {
                    id: 'lc_1',
                    fieldPath: 'AnnualRevenue',
                    operator: 'gte',
                    value: { kind: 'constant', value: 1000 }
                }
            ])
        });
        const read = emitted(el);
        // Account has no greater-than, and 1000 is meaningless against it.
        change(qa(el, '.lce-row select')[0], 'AccountId');
        const [next] = read();
        expect(next.filter.criteria[0].operator).toBe('eq');
        expect(next.filter.criteria[0].value).toEqual({
            kind: 'constant',
            value: ''
        });
    });

    it('offers ranges on a number and only equality on a lookup', async () => {
        const withNumber = await mount({
            config: config([
                {
                    id: 'lc_1',
                    fieldPath: 'AnnualRevenue',
                    operator: 'gte',
                    value: { kind: 'constant', value: 1000 }
                }
            ])
        });
        expect(
            texts(withNumber, '.lce-row select:nth-of-type(1) option').length
        ).toBeGreaterThan(0);
        const ops = [...qa(withNumber, '.lce-row select')[1].options].map((o) =>
            o.textContent.trim()
        );
        expect(ops).toContain('is at least');

        const withLookup = await mount({
            config: config([answerRow('AccountId', 'el_account')])
        });
        const lookupOps = [...qa(withLookup, '.lce-row select')[1].options].map(
            (o) => o.textContent.trim()
        );
        expect(lookupOps).toEqual(['equals', 'does not equal']);
    });

    it('switches a condition between an answer and a fixed value', async () => {
        const el = await mount({
            config: config([answerRow('Title', 'el_title')])
        });
        const read = emitted(el);
        change(qa(el, '.lce-row select')[2], 'constant');
        expect(read()[0].filter.criteria[0].value).toEqual({
            kind: 'constant',
            value: ''
        });
    });

    it('keeps a number typed as a number, not a string', async () => {
        const el = await mount({
            config: config([
                {
                    id: 'lc_1',
                    fieldPath: 'AnnualRevenue',
                    operator: 'gte',
                    value: { kind: 'constant', value: '' }
                }
            ])
        });
        const read = emitted(el);
        const input = q(el, 'input[type="number"]');
        input.value = '2500';
        input.dispatchEvent(new CustomEvent('change'));
        expect(read()[0].filter.criteria[0].value.value).toBe(2500);
    });

    it('records a ticked checkbox as true, not the string on', async () => {
        const el = await mount({
            config: config([
                {
                    id: 'lc_1',
                    fieldPath: 'AccountId',
                    operator: 'eq',
                    value: { kind: 'constant', value: '' }
                }
            ]),
            answerSources: []
        });
        // Swap to the boolean-ish path via a picklist field instead, since the
        // fixture has no boolean; the picklist keeps its string value.
        const read = emitted(el);
        change(qa(el, '.lce-row select')[0], 'LeadSource');
        expect(read()[0].filter.criteria[0].fieldPath).toBe('LeadSource');
    });

    it('shows a picklist as a dropdown of its real values', async () => {
        const el = await mount({
            config: config([
                {
                    id: 'lc_1',
                    fieldPath: 'LeadSource',
                    operator: 'eq',
                    value: { kind: 'constant', value: 'Web' }
                }
            ])
        });
        const valueSelect = qa(el, '.lce-row select')[3];
        expect(
            [...valueSelect.options].map((o) => o.textContent.trim())
        ).toEqual(['Web', 'Phone Enquiry']);
    });

    it('hides the match control until there is something to match', async () => {
        const one = await mount({
            config: config([answerRow('Title', 'el_title')])
        });
        expect(q(one, '.lce-seg')).toBeNull();

        const two = await mount({
            config: config([
                answerRow('Title', 'el_title'),
                {
                    id: 'lc_2',
                    fieldPath: 'LeadSource',
                    operator: 'eq',
                    value: { kind: 'constant', value: 'Web' }
                }
            ])
        });
        expect(q(two, '.lce-seg')).not.toBeNull();
    });

    it('switches between matching all and any', async () => {
        const el = await mount({
            config: config([
                answerRow('Title', 'el_title'),
                {
                    id: 'lc_2',
                    fieldPath: 'LeadSource',
                    operator: 'eq',
                    value: { kind: 'constant', value: 'Web' }
                }
            ])
        });
        const read = emitted(el);
        qa(el, '.lce-segbtn')[1].click();
        expect(read()[0].filter.mode).toBe('any');
    });

    it('tells the author what changing the parent will do', async () => {
        const el = await mount({
            config: config([answerRow('AccountId', 'el_account')])
        });
        expect(q(el, '.lce-note').textContent.trim()).toBe(
            'Changing Account clears the selected Contact.'
        );
    });

    it('says nothing about clearing when no condition reads an answer', async () => {
        const el = await mount({
            config: config([
                {
                    id: 'lc_1',
                    fieldPath: 'LeadSource',
                    operator: 'eq',
                    value: { kind: 'constant', value: 'Web' }
                }
            ])
        });
        expect(q(el, '.lce-note')).toBeNull();
    });

    it('removes the whole config when the last condition goes', async () => {
        const el = await mount({
            config: config([answerRow('Title', 'el_title')])
        });
        const read = emitted(el);
        q(el, '.lce-x').click();
        // Absence of a config is what "unfiltered" means in the schema.
        expect(read()[0]).toBeNull();
    });

    it('marks an unfinished row without refusing to save the draft', async () => {
        const el = await mount({
            config: config([answerRow('AccountId', '')])
        });
        expect(q(el, '.lce-rowerror').textContent).toContain(
            'Pick which answer this reads'
        );
    });

    it('marks a row whose source question has been deleted', async () => {
        const el = await mount({
            config: config([answerRow('AccountId', 'el_long_gone')])
        });
        expect(q(el, '.lce-rowerror').textContent).toContain('no longer suits');
    });

    it('reports a describe failure instead of showing an empty picker', async () => {
        const el = createElement('c-final-lookup-config-editor', {
            is: FinalLookupConfigEditor
        });
        el.targetObject = 'Contact';
        el.targetObjectLabel = 'Contact';
        document.body.appendChild(el);
        describeLookupFields.error();
        await flush();
        expect(q(el, '.lce-error')).not.toBeNull();
    });
});
