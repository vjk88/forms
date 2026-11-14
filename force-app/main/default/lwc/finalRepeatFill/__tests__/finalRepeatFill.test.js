import { createElement } from 'lwc';
import FinalRepeatFill from 'c/finalRepeatFill';
import FinalRepeatFillModal from 'c/finalRepeatFillModal';
import { isFillable, valueText } from 'c/finalRepeatGroups';

jest.mock('c/finalRepeatFillModal', () => ({
    __esModule: true,
    default: { open: jest.fn() }
}));

/**
 * "Fill on new records" (P2.6, owner pick "B, list + dialog"): one line per
 * fill in words, a dialog to add or change one, × to remove, and only the
 * fields a fill may set are offered.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

const FIELDS = [
    {
        apiName: 'Status',
        label: 'Status',
        displayType: 'PICKLIST',
        options: [{ value: 'New', label: 'New' }]
    },
    { apiName: 'Subject', label: 'Subject', displayType: 'STRING' },
    { apiName: 'ContactId', label: 'Contact ID', displayType: 'REFERENCE' },
    { apiName: 'AccountId', label: 'Account ID', displayType: 'REFERENCE' },
    {
        apiName: 'OwnerId',
        label: 'Owner ID',
        displayType: 'REFERENCE',
        polymorphic: true
    },
    { apiName: 'IsEscalated', label: 'Escalated', displayType: 'BOOLEAN' }
];

function mount(fills = []) {
    const el = createElement('c-final-repeat-fill', { is: FinalRepeatFill });
    el.fills = fills;
    el.childObject = 'Case';
    el.parentObject = 'Contact';
    el.childFields = FIELDS;
    el.takenFields = ['Subject', 'ContactId'];
    document.body.appendChild(el);
    const changes = [];
    el.addEventListener('fillchange', (e) => changes.push(e.detail.fills));
    return { el, changes };
}

const $ = (el, s) => el.shadowRoot.querySelector(s);
const $$ = (el, s) => [...el.shadowRoot.querySelectorAll(s)];

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

describe('fill on new records: the list', () => {
    it('reads each fill in words: field = value, and where it comes from', () => {
        const { el } = mount([
            { field: 'Status', value: 'New' },
            { field: 'AccountId', from: 'AccountId', fromLabel: 'Account ID' },
            { field: 'IsEscalated', value: false }
        ]);
        const text = (b) => b.textContent.replace(/\s+/g, ' ').trim();
        const what = $$(el, '.rf-what').map(text);
        const how = $$(el, '.rf-how').map(text);
        expect(what).toEqual([
            'Status = New',
            'Account ID = Contact’s Account ID',
            'Escalated = Not checked'
        ]);
        expect(how).toEqual(['Fixed value', 'From the Contact', 'Fixed value']);
        expect($$(el, '.rf-remove')[1].getAttribute('aria-label')).toBe(
            'Remove Account ID'
        );
        expect($(el, '.rf-help').textContent).toContain(
            'Set on every new Case'
        );
    });

    it('Add opens the dialog with only the fields a fill may set', async () => {
        FinalRepeatFillModal.open.mockResolvedValue({
            field: 'Status',
            value: 'New'
        });
        const { el, changes } = mount([{ field: 'IsEscalated', value: true }]);
        $(el, '.rf-add').click();
        await flush();
        const args = FinalRepeatFillModal.open.mock.calls[0][0];
        // not a question (Subject), not the link (Contact ID), not polymorphic
        // (Owner ID), not already filled (Escalated)
        expect(args.fields.map((f) => f.apiName)).toEqual([
            'AccountId',
            'Status'
        ]);
        expect(args.parentObject).toBe('Contact');
        expect(args.fill).toBeNull();
        expect(changes).toEqual([
            [
                { field: 'IsEscalated', value: true },
                { field: 'Status', value: 'New' }
            ]
        ]);
    });

    it('a click on a line changes that fill; the field itself stays offered', async () => {
        FinalRepeatFillModal.open.mockResolvedValue({
            field: 'Status',
            value: 'Closed'
        });
        const { el, changes } = mount([{ field: 'Status', value: 'New' }]);
        $(el, '.rf-line').click();
        await flush();
        const args = FinalRepeatFillModal.open.mock.calls[0][0];
        expect(args.fill).toEqual({ field: 'Status', value: 'New' });
        expect(args.fields.map((f) => f.apiName)).toContain('Status');
        expect(changes).toEqual([[{ field: 'Status', value: 'Closed' }]]);
    });

    it('Cancel changes nothing', async () => {
        FinalRepeatFillModal.open.mockResolvedValue(undefined);
        const { el, changes } = mount();
        $(el, '.rf-add').click();
        await flush();
        expect(changes).toEqual([]);
    });

    it('× removes that one fill', () => {
        const { el, changes } = mount([
            { field: 'Status', value: 'New' },
            { field: 'IsEscalated', value: true }
        ]);
        $$(el, '.rf-remove')[0].click();
        expect(changes).toEqual([[{ field: 'IsEscalated', value: true }]]);
    });

    it('Add is off when every fillable field is taken', () => {
        const { el } = mount([
            { field: 'Status', value: 'New' },
            { field: 'AccountId', from: 'AccountId' },
            { field: 'IsEscalated', value: true }
        ]);
        expect($(el, '.rf-add').disabled).toBe(true);
        // and says why
        expect(el.shadowRoot.textContent).toContain(
            'Every Case field that can be filled is already used.'
        );
    });

    it('while Case fields load it says so, and Add waits', () => {
        const el = createElement('c-final-repeat-fill', {
            is: FinalRepeatFill
        });
        el.fills = [{ field: 'Status', value: 'New' }];
        el.childObject = 'Case';
        el.parentObject = 'Contact';
        el.childFields = [];
        el.loading = true;
        document.body.appendChild(el);
        expect($(el, '.rf-line')).toBeNull();
        expect(el.shadowRoot.textContent).toContain('Loading Case fields…');
        expect($(el, '.rf-add').disabled).toBe(true);
    });

    it('editing a fill names it in the dialog title', async () => {
        FinalRepeatFillModal.open.mockResolvedValue(undefined);
        const { el } = mount([{ field: 'Status', value: 'New' }]);
        $(el, '.rf-line').click();
        await flush();
        expect(FinalRepeatFillModal.open.mock.calls[0][0].label).toBe(
            'Change how Status is filled'
        );
    });
});

describe('fill helpers', () => {
    it('only plain values and single-object lookups can be filled', () => {
        expect(isFillable({ displayType: 'PICKLIST' })).toBe(true);
        expect(isFillable({ displayType: 'REFERENCE' })).toBe(true);
        expect(
            isFillable({ displayType: 'REFERENCE', polymorphic: true })
        ).toBe(false);
        expect(isFillable({ displayType: 'ADDRESS' })).toBe(false);
    });

    it('a value reads as people see it', () => {
        const field = {
            displayType: 'MULTIPICKLIST',
            options: [
                { value: 'a', label: 'Apple' },
                { value: 'b', label: 'Banana' }
            ]
        };
        expect(valueText(field, 'a;b')).toBe('Apple, Banana');
        expect(valueText({ displayType: 'BOOLEAN' }, true)).toBe('Checked');
        expect(valueText({ displayType: 'STRING' }, 'Web')).toBe('Web');
    });
});
