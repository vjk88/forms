import { createElement } from 'lwc';
import FinalAutofillRuleEditor from 'c/finalAutofillRuleEditor';
import fitsTable from '@salesforce/apex/FinalAutofillController.fitsTable';
import getTestRecordValues from '@salesforce/apex/FinalAutofillController.getTestRecordValues';
import listLookupObjects from '@salesforce/apex/FinalLookupController.listLookupObjects';
import describeReadableFields from '@salesforce/apex/FinalLookupController.describeReadableFields';
import { resetFieldCache } from 'c/finalFieldPicker';

jest.mock(
    '@salesforce/apex/FinalAutofillController.fitsTable',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAutofillController.getTestRecordValues',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAutofillController.describeReferenceTargets',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalLookupController.listLookupObjects',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalLookupController.describeReadableFields',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalLookupController.describeLookupFields',
    () => ({ default: jest.fn(() => Promise.resolve({ fields: [] })) }),
    { virtual: true }
);

const FITS = {
    string: ['Email', 'Phone', 'Text', 'URL'],
    currency: ['Number', 'Text'],
    date: ['Date'],
    picklist: ['Choice', 'Text']
};

const ACCOUNT = {
    fields: [
        { path: 'Name', label: 'Account Name', type: 'string' },
        { path: 'AnnualRevenue', label: 'Annual Revenue', type: 'currency' },
        { path: 'Industry', label: 'Industry', type: 'picklist' }
    ],
    relationships: []
};

const SPEC = {
    pages: [
        {
            sections: [
                {
                    elements: [
                        {
                            id: 'el_company',
                            type: 'field',
                            label: 'Company',
                            config: { inputType: 'text' }
                        },
                        {
                            id: 'el_revenue',
                            type: 'field',
                            label: 'Revenue',
                            config: { inputType: 'number' }
                        },
                        {
                            id: 'el_pick',
                            type: 'field',
                            label: 'Your company',
                            config: {
                                inputType: 'reference',
                                referenceTo: 'Account'
                            }
                        },
                        { id: 'el_nps', type: 'nps', label: 'Score' }
                    ]
                }
            ]
        }
    ]
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-autofill-rule-editor', {
        is: FinalAutofillRuleEditor
    });
    Object.assign(el, { spec: SPEC, rule: null }, props);
    document.body.appendChild(el);
    const got = [];
    el.addEventListener('rulechange', (e) => got.push(e.detail.rule));
    return { el, got };
}

const $ = (el, sel) => el.shadowRoot.querySelector(sel);
const $$ = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

beforeEach(() => {
    resetFieldCache();
    fitsTable.mockResolvedValue(FITS);
    listLookupObjects.mockResolvedValue([
        { label: 'Account', value: 'Account' }
    ]);
    describeReadableFields.mockResolvedValue(ACCOUNT);
});

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

const linkRule = (mappings) => ({
    id: 'af_1',
    name: 'Account',
    enabled: true,
    policy: 'preserveEdits',
    source: { type: 'link', objectApiName: 'Account' },
    mappings
});

describe('c-final-autofill-rule-editor', () => {
    it('a new rule starts from the link, with one row, and says what is missing', async () => {
        const { el } = mount();
        await flush();
        expect($(el, '.am-object')).toBeTruthy();
        expect(el.rule.mappings).toHaveLength(1);
        const problems = el.reportProblems().map((p) => p.message);
        expect(problems).toContain('Choose the object in the link.');
        await flush();
        expect($(el, '.am-problems').textContent).toContain(
            'Choose the object in the link.'
        );
    });

    it('a form that already has a link rule starts a new rule on a lookup', async () => {
        const { el } = mount({ hasOtherLinkRule: true });
        await flush();
        const [link] = $$(el, '.am-seg');
        expect(link.disabled).toBe(true);
        expect(el.rule.source.type).toBe('lookup');
        expect($(el, '.am-lookup').value).toBe('el_pick');
    });

    it('a lookup question reads its picked object, and offers no guest column', async () => {
        const { el } = mount({
            rule: {
                id: 'af_2',
                enabled: true,
                source: { type: 'lookup', elementId: 'el_pick' },
                mappings: []
            }
        });
        await flush();
        const picker = $(el, 'c-final-field-picker');
        expect(picker.objectApi).toBe('Account');
        expect(picker.purpose).toBe('read');
        expect(picker.maxDepth).toBe(1); // one hop (7.1)
        expect($(el, '.am-guest')).toBeNull();
    });

    it('offers only questions the picked field fits', async () => {
        const { el } = mount({
            rule: linkRule([
                { id: 'm1', from: 'AnnualRevenue', to: '', guestAllowed: false }
            ])
        });
        await flush();
        await flush();
        const to = $(el, '.am-row:not(.am-head) lightning-combobox');
        // a currency fills a number or a text answer, never the NPS widget
        expect(to.options.map((o) => o.value)).toEqual([
            'el_company',
            'el_revenue'
        ]);
    });

    it('a saved row that no longer fits keeps its choice and says why', async () => {
        const { el } = mount({
            rule: linkRule([
                {
                    id: 'm1',
                    from: 'Name',
                    to: 'el_revenue',
                    guestAllowed: false
                }
            ])
        });
        await flush();
        await flush();
        el.reportProblems();
        await flush();
        expect($(el, '.am-row-problem').textContent).toBe(
            'This field can’t fill a number answer.'
        );
        const to = $(el, '.am-row:not(.am-head) lightning-combobox');
        expect(
            to.options.some((o) => o.label === 'Revenue (doesn’t fit)')
        ).toBe(true);
    });

    it('every edit reaches the host as the whole rule', async () => {
        const { el, got } = mount({
            rule: linkRule([
                {
                    id: 'm1',
                    from: 'Name',
                    to: 'el_company',
                    guestAllowed: false
                }
            ])
        });
        await flush();
        $(el, '.am-guest').dispatchEvent(new CustomEvent('change'));
        $(el, '.am-guest').checked = true;
        $(el, '.am-guest').dispatchEvent(new CustomEvent('change'));
        expect(got[got.length - 1].mappings[0].guestAllowed).toBe(true);
        $(el, '.am-policy').dispatchEvent(
            new CustomEvent('change', { detail: { value: 'alwaysReplace' } })
        );
        expect(got[got.length - 1].policy).toBe('alwaysReplace');
    });

    it('shows what a real record would fill, row by row', async () => {
        getTestRecordValues.mockResolvedValue({ Name: 'Edge Communications' });
        const { el } = mount({
            rule: linkRule([
                {
                    id: 'm1',
                    from: 'Name',
                    to: 'el_company',
                    guestAllowed: false
                }
            ]),
            formId: 'a0F1'
        });
        await flush();
        const id = $(el, '.am-test-id');
        id.value = '001000000000001';
        id.dispatchEvent(new CustomEvent('change'));
        await flush();
        $$(el, 'lightning-button')
            .find((b) => b.label === 'Show what it fills')
            .click();
        await flush();
        expect(getTestRecordValues).toHaveBeenCalledWith({
            formId: 'a0F1',
            objectApiName: 'Account',
            recordId: '001000000000001',
            fieldApiNames: ['Name']
        });
        expect($(el, '.am-row-test').textContent).toBe(
            'Fills: Edge Communications'
        );
    });

    it('a complete rule has no problems', async () => {
        const { el } = mount({
            rule: linkRule([
                { id: 'm1', from: 'Name', to: 'el_company', guestAllowed: true }
            ])
        });
        await flush();
        await flush();
        expect(el.reportProblems()).toEqual([]);
    });

    it('a new object clears every field and guest tick (review fix)', async () => {
        const { el, got } = mount({
            rule: linkRule([
                { id: 'm1', from: 'Name', to: 'el_company', guestAllowed: true }
            ])
        });
        await flush();
        $(el, '.am-object').dispatchEvent(
            new CustomEvent('pick', { detail: { value: 'Contact' } })
        );
        const last = got[got.length - 1];
        expect(last.source.objectApiName).toBe('Contact');
        expect(last.mappings[0]).toMatchObject({
            from: '',
            to: 'el_company',
            guestAllowed: false
        });
    });

    it('a field the object does not have is said', async () => {
        const { el } = mount({
            rule: linkRule([
                {
                    id: 'm1',
                    from: 'Gone__c',
                    to: 'el_company',
                    guestAllowed: false
                }
            ])
        });
        await flush();
        await flush();
        el.reportProblems();
        await flush();
        expect($(el, '.am-row-problem').textContent).toBe(
            'That field isn’t on Account.'
        );
    });

    it('a link rule that is off never conflicts with another', async () => {
        const off = { ...linkRule([]), enabled: false };
        const { el } = mount({ rule: off, hasOtherLinkRule: true });
        await flush();
        const [link] = $$(el, '.am-seg');
        expect(link.disabled).toBe(false);
        expect(
            el.reportProblems().some((p) => /other link rule/.test(p.message))
        ).toBe(false);
    });

    it('try-it shows what will really fill, and what won’t', async () => {
        getTestRecordValues.mockResolvedValue({ AnnualRevenue: 'lots' });
        const { el } = mount({
            rule: linkRule([
                {
                    id: 'm1',
                    from: 'AnnualRevenue',
                    to: 'el_revenue',
                    guestAllowed: false
                }
            ])
        });
        await flush();
        const id = $(el, '.am-test-id');
        id.value = '001000000000001';
        id.dispatchEvent(new CustomEvent('change'));
        await flush();
        $$(el, 'lightning-button')
            .find((b) => b.label === 'Show what it fills')
            .click();
        await flush();
        expect($(el, '.am-row-test').textContent).toBe(
            'Won’t fill: “lots” doesn’t fit a number answer'
        );
    });

    it('the signed-in person reads User, one hop through three relationships, never to guests', async () => {
        const { el, got } = mount({
            rule: linkRule([
                { id: 'm1', from: 'Name', to: 'el_company', guestAllowed: true }
            ])
        });
        await flush();
        const [, , user] = $$(el, '.am-seg');
        user.click();
        await flush();
        const last = got[got.length - 1];
        expect(last.source).toEqual({ type: 'user' });
        expect(last.mappings[0].guestAllowed).toBe(false);
        const picker = $(el, 'c-final-field-picker');
        expect(picker.objectApi).toBe('User');
        expect(picker.allowedRelationships).toEqual([
            'Contact',
            'Account',
            'Manager'
        ]);
        expect($(el, '.am-guest')).toBeNull();
    });
});
