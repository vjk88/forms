import { createElement } from 'lwc';
import FinalRepeatFillModal from 'c/finalRepeatFillModal';
import describeFillSources from '@salesforce/apex/FinalStudioController.describeFillSources';

jest.mock(
    '@salesforce/apex/FinalStudioController.describeFillSources',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/**
 * The fill dialog (P2.6): a field, then a fixed value in a box that fits its
 * type or a main-record field of the same kind. Apply with something missing
 * stays open and says what; Cancel settles on nothing.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

const FIELDS = [
    {
        apiName: 'Status',
        label: 'Status',
        displayType: 'PICKLIST',
        options: [
            { value: 'New', label: 'New' },
            { value: 'Closed', label: 'Closed' }
        ]
    },
    { apiName: 'AccountId', label: 'Account ID', displayType: 'REFERENCE' },
    { apiName: 'IsEscalated', label: 'Escalated', displayType: 'BOOLEAN' },
    { apiName: 'Hours__c', label: 'Hours', displayType: 'INTEGER' }
];

function mount(fill = null) {
    const el = createElement('c-final-repeat-fill-modal', {
        is: FinalRepeatFillModal
    });
    el.label = 'Fill a field on new records';
    el.childObject = 'Case';
    el.parentObject = 'Contact';
    el.fields = FIELDS;
    el.fill = fill;
    document.body.appendChild(el);
    const closed = [];
    el.addEventListener('close', (e) => closed.push(e.detail));
    return { el, closed };
}

const $ = (el, s) => el.shadowRoot.querySelector(s);
const apply = (el) =>
    [...el.shadowRoot.querySelectorAll('lightning-button')]
        .find((b) => b.label === 'Apply')
        .click();
const pick = async (el, selector, value) => {
    $(el, selector).dispatchEvent(
        new CustomEvent('change', { detail: { value } })
    );
    await flush();
};

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

describe('the fill dialog', () => {
    it('a picklist offers its own values, and Apply closes with the fill', async () => {
        const { el, closed } = mount();
        await pick(el, '.rfm-field', 'Status');
        const box = $(el, 'lightning-combobox.rfm-value');
        expect(box.options.map((o) => o.value)).toEqual(['New', 'Closed']);
        await pick(el, '.rfm-value', 'New');
        apply(el);
        expect(closed).toEqual([{ field: 'Status', value: 'New' }]);
    });

    it('Apply with no value stays open and says what is missing', async () => {
        const { el, closed } = mount();
        apply(el);
        await flush();
        expect($(el, '.rfm-problem').textContent).toBe('Choose a Case field.');
        await pick(el, '.rfm-field', 'Status');
        apply(el);
        await flush();
        expect($(el, '.rfm-problem').textContent).toBe(
            'Choose a value for Status.'
        );
        expect(closed).toEqual([]);
    });

    it('a lookup comes from the Contact only, from fields of the same kind', async () => {
        describeFillSources.mockResolvedValue([
            { apiName: 'AccountId', label: 'Account ID' }
        ]);
        const { el, closed } = mount();
        await pick(el, '.rfm-field', 'AccountId');
        await flush();
        expect(describeFillSources).toHaveBeenCalledWith({
            parentObject: 'Contact',
            childObject: 'Case',
            childField: 'AccountId'
        });
        const seg = $(el, 'c-final-button-group');
        expect(seg.value).toBe('from');
        expect(seg.options[0].disabled).toBe(true);
        await pick(el, '.rfm-source', 'AccountId');
        apply(el);
        expect(closed).toEqual([
            { field: 'AccountId', from: 'AccountId', fromLabel: 'Account ID' }
        ]);
    });

    it('no matching Contact field says so', async () => {
        describeFillSources.mockResolvedValue([]);
        const { el } = mount();
        await pick(el, '.rfm-field', 'AccountId');
        await flush();
        expect($(el, '.rfm-source')).toBeNull();
        expect(el.shadowRoot.textContent).toContain(
            'No Contact field holds the same kind of value as Account ID.'
        );
    });

    it('a checkbox can be filled as not checked', async () => {
        const { el, closed } = mount();
        await pick(el, '.rfm-field', 'IsEscalated');
        apply(el);
        expect(closed).toEqual([{ field: 'IsEscalated', value: false }]);
    });

    it('a whole-number field refuses a fraction', async () => {
        const { el, closed } = mount();
        await pick(el, '.rfm-field', 'Hours__c');
        $(el, '.rfm-value').dispatchEvent(
            new CustomEvent('change', { detail: { value: '1.5' } })
        );
        apply(el);
        await flush();
        expect($(el, '.rfm-problem').textContent).toBe(
            'Hours needs a whole number.'
        );
        expect(closed).toEqual([]);
    });

    it('opens on an existing fill, and Cancel settles on nothing', async () => {
        const { el, closed } = mount({ field: 'Status', value: 'Closed' });
        await flush();
        expect($(el, '.rfm-field').value).toBe('Status');
        expect($(el, '.rfm-value').value).toBe('Closed');
        [...el.shadowRoot.querySelectorAll('lightning-button')]
            .find((b) => b.label === 'Cancel')
            .click();
        // close() with no value: the stub's event carries null
        expect(closed).toEqual([null]);
    });
});
