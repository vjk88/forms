import { createElement } from 'lwc';
import FinalAutofillPanel from 'c/finalAutofillPanel';
import describeSourceFields from '@salesforce/apex/FinalAutofillController.describeSourceFields';
import getTestRecordValues from '@salesforce/apex/FinalAutofillController.getTestRecordValues';
import mintRecordLink from '@salesforce/apex/FinalStudioController.mintRecordLink';
import mintTrackedLink from '@salesforce/apex/FinalStudioController.mintTrackedLink';
import invalidateLinks from '@salesforce/apex/FinalStudioController.invalidateLinks';
import LightningConfirm from 'lightning/confirm';

jest.mock(
    '@salesforce/apex/FinalAutofillController.describeSourceFields',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAutofillController.getTestRecordValues',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.mintRecordLink',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.mintTrackedLink',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalStudioController.invalidateLinks',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock('lightning/confirm', () => ({
    __esModule: true,
    default: { open: jest.fn() }
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

const SAMPLE_SPEC = {
    form: {
        type: 'form',
        targetObject: 'Job_Application__c'
    },
    pages: [
        {
            id: 'p1',
            sections: [
                {
                    id: 's1',
                    elements: [
                        {
                            id: 'el_contact_lookup',
                            type: 'field',
                            label: 'Contact Lookup',
                            binding: { referenceTo: 'Contact' },
                            config: { inputType: 'reference' }
                        },
                        {
                            id: 'el_first_name',
                            type: 'field',
                            label: 'First Name',
                            config: { inputType: 'text' }
                        },
                        {
                            id: 'el_email',
                            type: 'field',
                            label: 'Email Address',
                            config: { inputType: 'email' }
                        }
                    ]
                }
            ]
        }
    ],
    settings: {
        prefill: {
            rulesVersion: 1,
            autofillRules: [
                {
                    id: 'af_1',
                    name: 'Contact Link Prefill',
                    enabled: true,
                    policy: 'preserveEdits',
                    source: {
                        type: 'link',
                        objectApiName: 'Contact'
                    },
                    mappings: [
                        {
                            id: 'm1',
                            from: 'FirstName',
                            to: 'el_first_name',
                            guestAllowed: true
                        }
                    ]
                }
            ]
        }
    }
};

const MOCK_FIELDS = [
    { apiName: 'FirstName', label: 'First Name', type: 'string' },
    { apiName: 'LastName', label: 'Last Name', type: 'string' },
    { apiName: 'Email', label: 'Email', type: 'email' },
    { apiName: 'Phone', label: 'Phone', type: 'phone' }
];

function mount(props = {}) {
    const el = createElement('c-final-autofill-panel', {
        is: FinalAutofillPanel
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-autofill-panel', () => {
    beforeEach(() => {
        describeSourceFields.mockResolvedValue(MOCK_FIELDS);
        getTestRecordValues.mockResolvedValue({
            FirstName: 'Avery',
            Email: 'avery@example.test'
        });
        mintRecordLink.mockResolvedValue({ query: 'c__rt=token123' });
        mintTrackedLink.mockResolvedValue({ query: 'c__rt=token456' });
        invalidateLinks.mockResolvedValue({ ok: true });
        LightningConfirm.open.mockResolvedValue(true);
    });

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders empty state when no rules exist and opens editor on Add rule', async () => {
        const el = mount({ spec: { pages: [] } });
        await flush();

        expect(el.shadowRoot.querySelector('.ap-empty-title').textContent).toBe(
            'Fill answers from Salesforce records'
        );

        const addBtn = el.shadowRoot.querySelector('.ap-btn-primary');
        addBtn.click();
        await flush();

        expect(el.shadowRoot.querySelector('.ap-editor')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.ap-back-btn')).not.toBeNull();
    });

    it('renders rule list with cards, badges, and toggles rule state', async () => {
        const el = mount({ spec: SAMPLE_SPEC });
        await flush();

        const cards = el.shadowRoot.querySelectorAll('.ap-rule-card');
        expect(cards.length).toBe(1);
        expect(cards[0].querySelector('.ap-card-name').textContent).toBe(
            'Contact Link Prefill'
        );
        expect(cards[0].querySelector('.ap-badge-source').textContent).toBe(
            'Link: Contact'
        );

        const rulesListener = jest.fn();
        const specListener = jest.fn();
        el.addEventListener('ruleschange', rulesListener);
        el.addEventListener('specchange', specListener);

        const toggle = cards[0].querySelector('lightning-input');
        toggle.checked = false;
        toggle.dispatchEvent(new CustomEvent('change'));
        await flush();

        expect(rulesListener).toHaveBeenCalled();
        expect(rulesListener.mock.calls[0][0].detail.rules[0].enabled).toBe(
            false
        );
        expect(specListener).toHaveBeenCalled();
    });

    it('deletes a rule when delete button clicked', async () => {
        const el = mount({ spec: SAMPLE_SPEC });
        await flush();

        const rulesListener = jest.fn();
        el.addEventListener('ruleschange', rulesListener);

        const delBtn = el.shadowRoot.querySelector('.ap-delete-btn');
        delBtn.click();
        await flush();

        expect(rulesListener).toHaveBeenCalled();
        expect(rulesListener.mock.calls[0][0].detail.rules.length).toBe(0);
    });

    it('opens editor, loads source fields, and saves updated rule', async () => {
        const el = mount({ spec: SAMPLE_SPEC, formId: 'a00123' });
        await flush();

        const editBtn = el.shadowRoot.querySelector(
            'button[title="Edit rule"]'
        );
        editBtn.click();
        await flush();

        expect(describeSourceFields).toHaveBeenCalledWith({
            formId: 'a00123',
            objectApiName: 'Contact'
        });

        const rulesListener = jest.fn();
        el.addEventListener('ruleschange', rulesListener);

        // Add mapping
        const addMapBtn = el.shadowRoot.querySelector('button.ap-btn-sm');
        addMapBtn.click();
        await flush();

        const rows = el.shadowRoot.querySelectorAll('.ap-mapping-row');
        expect(rows.length).toBe(2);

        // Save rule
        const doneBtn = el.shadowRoot.querySelector(
            '.ap-editor-footer .ap-btn-primary'
        );
        doneBtn.click();
        await flush();

        expect(rulesListener).toHaveBeenCalled();
        expect(
            rulesListener.mock.calls[0][0].detail.rules[0].mappings.length
        ).toBe(2);
        // Back to list
        expect(el.shadowRoot.querySelector('.ap-editor')).toBeNull();
    });

    it('navigates to Fields when no lookup elements exist on form', async () => {
        const specNoLookups = {
            pages: [
                {
                    sections: [
                        {
                            elements: [
                                {
                                    id: 'el_txt',
                                    type: 'field',
                                    config: { inputType: 'text' }
                                }
                            ]
                        }
                    ]
                }
            ]
        };
        const el = mount({ spec: specNoLookups });
        await flush();

        // Create rule
        el.shadowRoot.querySelector('.ap-btn-primary').click();
        await flush();

        // Switch to lookup source
        const lookupRadio = el.shadowRoot.querySelector(
            'button[data-type="lookup"]'
        );
        lookupRadio.click();
        await flush();

        expect(
            el.shadowRoot.querySelector('.ap-missing-lookup-notice')
        ).not.toBeNull();

        const navListener = jest.fn();
        el.addEventListener('navigatetab', navListener);

        const goToFieldsBtn = el.shadowRoot.querySelector(
            '.ap-missing-lookup-notice button'
        );
        goToFieldsBtn.click();
        await flush();

        expect(navListener).toHaveBeenCalled();
        expect(navListener.mock.calls[0][0].detail.tab).toBe('fields');
    });

    it('renders guest disclosure review on public forms with link rules', async () => {
        const el = mount({ spec: SAMPLE_SPEC, isPublic: true });
        await flush();

        // Edit rule
        el.shadowRoot.querySelector('button[title="Edit rule"]').click();
        await flush();

        const disclosureCard = el.shadowRoot.querySelector(
            '.ap-disclosure-card'
        );
        expect(disclosureCard).not.toBeNull();
        expect(disclosureCard.textContent).toContain('First Name');
    });

    it('tests in preview under author access and clears test data', async () => {
        const el = mount({ spec: SAMPLE_SPEC, formId: 'a00123' });
        await flush();

        // Edit rule
        el.shadowRoot.querySelector('button[title="Edit rule"]').click();
        await flush();

        const testInput = el.shadowRoot.querySelector('.ap-test-input');
        testInput.value = '003000000000123AAA';
        testInput.dispatchEvent(new CustomEvent('change'));
        await flush();

        const testListener = jest.fn();
        const clearListener = jest.fn();
        el.addEventListener('testpreview', testListener);
        el.addEventListener('cleartestpreview', clearListener);

        const applyBtn = el.shadowRoot.querySelector(
            '.ap-test-controls button'
        );
        applyBtn.click();
        await flush();

        expect(getTestRecordValues).toHaveBeenCalledWith({
            formId: 'a00123',
            objectApiName: 'Contact',
            recordId: '003000000000123AAA',
            fieldApiNames: ['FirstName']
        });
        expect(testListener).toHaveBeenCalled();
        expect(testListener.mock.calls[0][0].detail).toEqual({
            recordId: '003000000000123AAA',
            ruleId: 'af_1',
            values: { el_first_name: 'Avery' }
        });

        // Test banner should be visible
        expect(el.shadowRoot.querySelector('.ap-test-banner')).not.toBeNull();

        // Clear test data
        el.shadowRoot.querySelector('.ap-clear-test-btn').click();
        await flush();

        expect(clearListener).toHaveBeenCalled();
        expect(el.shadowRoot.querySelector('.ap-test-banner')).toBeNull();
    });

    it('creates personalized link when form has active version', async () => {
        const el = mount({
            spec: SAMPLE_SPEC,
            formId: 'a00123',
            activeVersionId: 'v001'
        });
        await flush();

        // Edit rule
        el.shadowRoot.querySelector('button[title="Edit rule"]').click();
        await flush();

        expect(el.shadowRoot.querySelector('.ap-mint-form')).not.toBeNull();

        const recordIdInput = el.shadowRoot.querySelector(
            '.ap-mint-form lightning-input'
        );
        recordIdInput.value = '003000000000123AAA';
        recordIdInput.dispatchEvent(new CustomEvent('change'));
        await flush();

        const createBtn = el.shadowRoot.querySelector(
            '.ap-mint-actions .ap-btn-primary'
        );
        createBtn.click();
        await flush();

        expect(mintRecordLink).toHaveBeenCalledWith({
            formId: 'a00123',
            recordId: '003000000000123AAA'
        });
    });
});
