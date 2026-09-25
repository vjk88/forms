import { createElement } from 'lwc';
import FinalLookupFilter from 'c/finalLookupFilter';
import describeLookupFields from '@salesforce/apex/FinalLookupController.describeLookupFields';

jest.mock(
    '@salesforce/apex/FinalLookupController.describeLookupFields',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const DESCRIBE = {
    fields: [
        {
            path: 'AccountId',
            label: 'Account ID',
            type: 'reference',
            picklistValues: []
        },
        {
            path: 'LeadSource',
            label: 'Lead Source',
            type: 'picklist',
            picklistValues: ['Web', 'Phone']
        },
        { path: 'Title', label: 'Title', type: 'string', picklistValues: [] }
    ],
    relationships: [{ name: 'Account', label: 'Account', object: 'Account' }]
};

const flush = () =>
    Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => Promise.resolve())
        .then(() => Promise.resolve())
        .then(() => Promise.resolve());

function mount(
    value,
    { filterOnly = false, allowTyped = false, typedValue } = {}
) {
    describeLookupFields.mockResolvedValue(DESCRIBE);
    const el = createElement('c-final-lookup-filter', {
        is: FinalLookupFilter
    });
    el.targetObject = 'Contact';
    el.filterOnly = filterOnly;
    el.allowTyped = allowTyped;
    el.typedValue = typedValue;
    el.value = value || null;
    document.body.appendChild(el);
    return el;
}

// The conditions now live behind a summary + dialog (D53); the summary is
// what this component talks to, in the rule editor's vocabulary.
const ruleEditor = (el) =>
    el.shadowRoot.querySelector('c-final-conditions-summary');

describe('c-final-lookup-filter', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('describes the target object once, not once per render', async () => {
        mount();
        await flush();
        await flush();
        expect(describeLookupFields).toHaveBeenCalledTimes(1);
        expect(describeLookupFields.mock.calls[0][0].objectApiName).toBe(
            'Contact'
        );
    });

    it('offers the object fields to the rule editor as its row sources', async () => {
        const el = mount();
        await flush();
        await flush();
        const sources = ruleEditor(el).sources;
        expect(sources.map((s) => s.id)).toEqual([
            'AccountId',
            'LeadSource',
            'Title'
        ]);
        expect(sources[1].type).toBe('picklist');
    });

    it('offers the operators SOQL has that a browser rule does not', async () => {
        const el = mount();
        await flush();
        const extra = ruleEditor(el).extraOperators.map((o) => o.value);
        expect(extra).toEqual([
            'lte',
            'gte',
            'in',
            'nin',
            'includes',
            'excludes'
        ]);
    });

    it('translates the editor vocabulary into the query vocabulary', async () => {
        const el = mount();
        await flush();
        const heard = [];
        el.addEventListener('lookupconfigchange', (e) =>
            heard.push(e.detail.value)
        );
        ruleEditor(el).dispatchEvent(
            new CustomEvent('conditionschange', {
                detail: {
                    value: {
                        logic: 'all',
                        rules: [
                            {
                                source: 'AccountId',
                                operator: 'equals',
                                value: 'x'
                            },
                            {
                                source: 'Title',
                                operator: 'contains',
                                value: 'eng'
                            },
                            { source: 'Title', operator: 'isNotBlank' }
                        ]
                    }
                }
            })
        );
        await flush();
        expect(heard[0].filter.rows).toEqual([
            { fieldPath: 'AccountId', operator: 'eq', value: 'x' },
            { fieldPath: 'Title', operator: 'like', value: 'eng' },
            { fieldPath: 'Title', operator: 'isNotBlank' }
        ]);
    });

    it('splits a multi-value condition and drops empty entries', async () => {
        const el = mount();
        await flush();
        const heard = [];
        el.addEventListener('lookupconfigchange', (e) =>
            heard.push(e.detail.value)
        );
        ruleEditor(el).dispatchEvent(
            new CustomEvent('conditionschange', {
                detail: {
                    value: {
                        logic: 'all',
                        rules: [
                            {
                                source: 'LeadSource',
                                operator: 'in',
                                value: 'Web, Phone, '
                            }
                        ]
                    }
                }
            })
        );
        await flush();
        expect(heard[0].filter.rows[0]).toEqual({
            fieldPath: 'LeadSource',
            operator: 'in',
            values: ['Web', 'Phone']
        });
    });

    it('reads a saved filter back into the editor vocabulary', async () => {
        const el = mount({
            targetObject: 'Contact',
            filter: {
                logic: 'custom',
                customLogic: '1 OR 2',
                rows: [
                    { fieldPath: 'AccountId', operator: 'eq', value: 'x' },
                    {
                        fieldPath: 'LeadSource',
                        operator: 'in',
                        values: ['Web', 'Phone']
                    }
                ]
            }
        });
        await flush();
        const value = ruleEditor(el).value;
        expect(value.logic).toBe('custom');
        expect(value.customLogic).toBe('1 OR 2');
        expect(value.rules[0]).toEqual({
            source: 'AccountId',
            operator: 'equals',
            value: 'x'
        });
        expect(value.rules[1].value).toBe('Web, Phone');
    });

    it('guest search is off until an author turns it on', async () => {
        const el = mount();
        await flush();
        const toggle = [
            ...el.shadowRoot.querySelectorAll('lightning-input')
        ].find((i) => i.type === 'checkbox');
        expect(toggle.checked).toBe(false);
        const heard = [];
        el.addEventListener('lookupconfigchange', (e) =>
            heard.push(e.detail.value)
        );
        toggle.checked = true;
        toggle.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(heard[0].allowGuest).toBe(true);
    });

    it('says so plainly when the fields cannot be read', async () => {
        describeLookupFields.mockRejectedValue(new Error('nope'));
        const el = createElement('c-final-lookup-filter', {
            is: FinalLookupFilter
        });
        el.targetObject = 'Nonsense__c';
        document.body.appendChild(el);
        await flush();
        await flush();
        expect(el.shadowRoot.querySelector('.lf-error').textContent).toContain(
            'could not be read'
        );
    });
});

describe('filter-only mode', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const labels = (el) =>
        [...el.shadowRoot.querySelectorAll('lightning-input')].map(
            (i) => i.label
        );

    it('hides the lookup-only controls and edits on the page', async () => {
        const el = mount(null, { filterOnly: true });
        await flush();
        expect(labels(el)).not.toContain('Show in each result');
        expect(labels(el)).not.toContain('Search these fields');
        expect(labels(el)).not.toContain(
            'Let people filling this form anonymously search it'
        );
        // no summary, no dialog: the editor itself
        expect(ruleEditor(el)).toBeNull();
        const editor = el.shadowRoot.querySelector('c-final-rule-editor');
        expect(editor.columns).toBe('mapping');
        // a new search starts with one empty row
        expect(editor.value.rules).toEqual([
            { source: '', operator: 'equals', value: '' }
        ]);
    });

    it('a lookup still gets all of them', async () => {
        const el = mount(null);
        await flush();
        expect(labels(el)).toContain('Show in each result');
        expect(labels(el)).toContain(
            'Let people filling this form anonymously search it'
        );
    });
});

describe('conditions on the page (mapping step)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const inline = (el) => el.shadowRoot.querySelector('c-final-rule-editor');
    const listen = (el) => {
        const got = [];
        el.addEventListener('lookupconfigchange', (e) => got.push(e.detail));
        return got;
    };
    const change = (el, value) =>
        inline(el).dispatchEvent(
            new CustomEvent('rulechange', { detail: { value } })
        );

    it('saves every edit, without a row nobody has started', async () => {
        const el = mount(null, { filterOnly: true });
        const got = listen(el);
        await flush();
        change(el, {
            action: 'show',
            logic: 'all',
            customLogic: null,
            rules: [
                { source: 'Title', operator: 'equals', value: 'CEO' },
                { source: '', operator: 'equals', value: '' }
            ]
        });
        expect(got[0].value.filter).toEqual({
            logic: 'all',
            customLogic: null,
            rows: [{ fieldPath: 'Title', operator: 'eq', value: 'CEO' }]
        });
        expect(got[0].typed).toBeUndefined();
    });

    it('keeps the row still being set up when the saved filter comes back', async () => {
        const el = mount(null, { filterOnly: true });
        const got = listen(el);
        await flush();
        const draft = {
            action: 'show',
            logic: 'all',
            customLogic: null,
            rules: [
                { source: 'Title', operator: 'in', value: 'CEO,' },
                { source: '', operator: 'equals', value: '' }
            ]
        };
        change(el, draft);
        // the host saves it and hands it straight back
        el.value = JSON.parse(JSON.stringify(got[0].value));
        await flush();
        expect(inline(el).value).toEqual(draft);
    });

    it('rebuilds from the saved filter when it changes elsewhere', async () => {
        const el = mount(null, { filterOnly: true });
        await flush();
        el.value = {
            filter: {
                logic: 'all',
                rows: [{ fieldPath: 'Title', operator: 'eq', value: 'CFO' }]
            }
        };
        await flush();
        expect(inline(el).value.rules).toEqual([
            { source: 'Title', operator: 'equals', value: 'CFO' }
        ]);
    });

    it('keeps blank rows under custom logic: their numbers count', async () => {
        const el = mount(null, { filterOnly: true });
        const got = listen(el);
        await flush();
        change(el, {
            action: 'show',
            logic: 'custom',
            customLogic: '1 OR 2',
            rules: [
                { source: 'Title', operator: 'equals', value: 'CEO' },
                { source: '', operator: 'equals', value: '' }
            ]
        });
        expect(got[0].value.filter.rows).toHaveLength(2);
    });

    it('switches to SOQL and back, keeping both', async () => {
        const el = mount(
            {
                filter: {
                    logic: 'all',
                    rows: [{ fieldPath: 'Title', operator: 'eq', value: 'CEO' }]
                }
            },
            {
                filterOnly: true,
                allowTyped: true,
                typedValue: { mode: 'rows', soql: '' }
            }
        );
        const got = listen(el);
        await flush();
        const mode = el.shadowRoot.querySelector('.lf-mode');
        expect(mode.value).toBe('rows');
        mode.dispatchEvent(
            new CustomEvent('change', { detail: { value: 'soql' } })
        );
        expect(got[0].typed).toEqual({ mode: 'soql', soql: '' });

        el.typedValue = { mode: 'soql', soql: 'Email = {!el_e}' };
        await flush();
        expect(el.shadowRoot.querySelector('c-final-rule-editor')).toBeNull();
        expect(el.shadowRoot.querySelector('c-final-mapping-soql').value).toBe(
            'Email = {!el_e}'
        );
        expect(
            el.shadowRoot.querySelector('.lf-mode-note').textContent
        ).toContain('Only the SOQL is used');
    });

    it('typing in the SOQL box saves it', async () => {
        const el = mount(null, {
            filterOnly: true,
            allowTyped: true,
            typedValue: { mode: 'soql', soql: '' }
        });
        const got = listen(el);
        await flush();
        el.shadowRoot.querySelector('c-final-mapping-soql').dispatchEvent(
            new CustomEvent('soqlchange', {
                detail: { value: 'LastName = {!el_n}' }
            })
        );
        expect(got[0].typed).toEqual({
            mode: 'soql',
            soql: 'LastName = {!el_n}'
        });
    });
});
