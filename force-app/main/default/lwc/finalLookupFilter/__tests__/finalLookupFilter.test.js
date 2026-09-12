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
        { path: 'AccountId', label: 'Account ID', type: 'reference', picklistValues: [] },
        { path: 'LeadSource', label: 'Lead Source', type: 'picklist', picklistValues: ['Web', 'Phone'] },
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

function mount(value) {
    describeLookupFields.mockResolvedValue(DESCRIBE);
    const el = createElement('c-final-lookup-filter', {
        is: FinalLookupFilter
    });
    el.targetObject = 'Contact';
    el.value = value || null;
    document.body.appendChild(el);
    return el;
}

const ruleEditor = (el) =>
    el.shadowRoot.querySelector('c-final-rule-editor');

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
            new CustomEvent('rulechange', {
                detail: {
                    value: {
                        logic: 'all',
                        rules: [
                            { source: 'AccountId', operator: 'equals', value: 'x' },
                            { source: 'Title', operator: 'contains', value: 'eng' },
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
            new CustomEvent('rulechange', {
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
