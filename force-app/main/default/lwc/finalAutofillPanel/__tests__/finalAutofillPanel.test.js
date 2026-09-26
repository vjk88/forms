import { createElement } from 'lwc';
import FinalAutofillPanel from 'c/finalAutofillPanel';
import mintRecordLink from '@salesforce/apex/FinalStudioController.mintRecordLink';
import mintTrackedLink from '@salesforce/apex/FinalStudioController.mintTrackedLink';
import invalidateLinks from '@salesforce/apex/FinalStudioController.invalidateLinks';
import LightningConfirm from 'lightning/confirm';

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

    it('renders empty state when no rules exist and asks for a new rule on Add rule', async () => {
        const el = mount({ spec: { pages: [] } });
        await flush();

        expect(el.shadowRoot.querySelector('.ap-empty-title').textContent).toBe(
            'Fill answers from Salesforce records'
        );

        const got = [];
        el.addEventListener('editautofillrule', (e) => got.push(e.detail));
        el.shadowRoot.querySelector('.ap-btn-primary').click();
        await flush();

        // a new rule opens in the Studio dialog
        expect(got).toEqual([{ rule: null }]);
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

    describe('rules open in the Studio dialog (IMPL_PLAN_F2_AUTOFILL 6.1, 8)', () => {
        it('Add and Edit ask the Studio to open the rule, and never edit here', async () => {
            const el = mount({ spec: SAMPLE_SPEC, formType: 'freeform' });
            const got = [];
            el.addEventListener('editautofillrule', (e) => got.push(e.detail));
            await flush();
            el.shadowRoot.querySelector('button[title="Add rule"]').click();
            el.shadowRoot.querySelector('button[title="Edit rule"]').click();
            await flush();
            expect(got[0]).toEqual({ rule: null });
            expect(got[1].rule.id).toBe(
                SAMPLE_SPEC.settings.prefill.autofillRules[0].id
            );
        });

        it.each(['form', 'survey'])(
            'a %s opens the dialog too',
            async (formType) => {
                const el = mount({ spec: SAMPLE_SPEC, formType });
                const got = [];
                el.addEventListener('editautofillrule', (e) =>
                    got.push(e.detail)
                );
                await flush();
                el.shadowRoot
                    .querySelector('button[title="Edit rule"]')
                    .click();
                await flush();
                expect(got[0].rule.id).toBe(
                    SAMPLE_SPEC.settings.prefill.autofillRules[0].id
                );
            }
        );

        it('a survey link rule reads its connected object in the list', async () => {
            const spec = JSON.parse(JSON.stringify(SAMPLE_SPEC));
            spec.form = { type: 'survey', primaryContextObject: 'Contact' };
            spec.settings.prefill.autofillRules = [
                {
                    id: 'af_s',
                    enabled: true,
                    source: { type: 'link' },
                    mappings: []
                }
            ];
            const el = mount({ spec, formType: 'survey' });
            await flush();
            const text = el.shadowRoot.textContent;
            expect(text).toContain('Link: Contact');
            expect(text).not.toContain('Source object missing');
        });

        it('makes links under the list when a link rule is on', async () => {
            const el = mount({
                spec: SAMPLE_SPEC,
                formType: 'freeform',
                formId: 'a00123',
                activeVersionId: 'v001'
            });
            await flush();
            expect(el.shadowRoot.querySelector('.ap-mint-form')).not.toBeNull();
        });
    });

    it('number and single-choice questions are fillable, not flagged (6.7)', async () => {
        const spec = {
            pages: [
                {
                    id: 'p1',
                    sections: [
                        {
                            id: 's1',
                            elements: [
                                {
                                    id: 'el_rev',
                                    type: 'field',
                                    label: 'Revenue',
                                    config: { inputType: 'number' }
                                },
                                {
                                    id: 'el_ind',
                                    type: 'field',
                                    label: 'Industry',
                                    config: {
                                        inputType: 'picklist',
                                        renderAs: 'Dropdown'
                                    }
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
                            enabled: true,
                            source: { type: 'link', objectApiName: 'Account' },
                            mappings: [
                                { from: 'AnnualRevenue', to: 'el_rev' },
                                { from: 'Industry', to: 'el_ind' },
                                { from: 'Name', to: 'el_gone' }
                            ]
                        }
                    ]
                }
            }
        };
        const el = mount({ spec, formType: 'freeform' });
        await flush();
        const errors = Array.from(
            el.shadowRoot.querySelectorAll('.ap-card-errors')
        ).map((e) => e.textContent);
        expect(errors.join(' ')).not.toMatch(/Revenue|Industry|el_rev|el_ind/);
        expect(errors.join(' ')).toMatch(/gone or can’t be filled/);
    });
});
