import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'Autofill Form', targetObject: 'Case' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: {
        completion: { mode: 'screen' },
        prefill: {
            rulesVersion: 1,
            autofillRules: [
                {
                    id: 'af_link',
                    name: 'Contact Link',
                    enabled: true,
                    source: {
                        type: 'link',
                        objectApiName: 'Contact'
                    },
                    policy: 'preserveEdits',
                    mappings: [
                        {
                            from: 'FirstName',
                            to: 'el_first_name',
                            guestAllowed: true
                        },
                        { from: 'Email', to: 'el_email', guestAllowed: true }
                    ]
                },
                {
                    id: 'af_lookup',
                    name: 'Account Lookup',
                    enabled: true,
                    source: {
                        type: 'lookup',
                        elementId: 'el_account_lookup'
                    },
                    policy: 'preserveEdits',
                    mappings: [
                        { from: 'Phone', to: 'el_phone', guestAllowed: false },
                        {
                            from: 'Website',
                            to: 'el_website',
                            guestAllowed: false
                        }
                    ]
                }
            ]
        }
    },
    submit: { label: 'Submit Ticket' },
    pages: [
        {
            id: 'pg_1',
            name: 'Page 1',
            sections: [
                {
                    id: 'sec_1',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_first_name',
                            type: 'field',
                            label: 'First Name',
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_email',
                            type: 'field',
                            label: 'Email',
                            render: { inputType: 'text' },
                            config: { defaultValue: 'default@test.com' }
                        },
                        {
                            id: 'el_account_lookup',
                            type: 'field',
                            label: 'Account',
                            config: {
                                inputType: 'reference',
                                referenceTo: 'Account'
                            }
                        },
                        {
                            id: 'el_phone',
                            type: 'field',
                            label: 'Phone',
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_website',
                            type: 'field',
                            label: 'Website',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function deepQuery(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) {
        return direct;
    }
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function mount(customSpec = SPEC) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = JSON.parse(JSON.stringify(customSpec));
    document.body.appendChild(el);
    return el;
}

const nav = (cmp) => cmp.shadowRoot.querySelector('x-test');
const answer = (cmp, elementId, value) =>
    nav(cmp).dispatchEvent(
        new CustomEvent('valuechange', { detail: { elementId, value } })
    );

describe('c-final-form-viewer Autofill runtime integration', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('seeds static defaultValue on initial load for absent answers', async () => {
        const el = mount();
        await flush();
        await flush();

        expect(el.answers.el_email).toBe('default@test.com');
    });

    it('applies injected autofill context and static default precedence', async () => {
        const el = mount();
        await flush();
        await flush();

        // Inject link autofill context:
        // el_first_name gets applied; el_email has a static default so static default wins.
        //
        // R6 — `values` is keyed by DESTINATION element id. That is what
        // IMPL_PLAN_AUTOFILL_RULES §7 documents the guest server returning, and
        // what finalAutofillPanel emits for a test preview. This test used to
        // pass SOURCE field names, which no real caller sends, so it stayed
        // green while the actual Studio and guest paths produced empty patches.
        el.recordContext = {
            status: 'applied',
            autofill: [
                {
                    ruleId: 'af_link',
                    values: {
                        el_first_name: 'Taylor',
                        el_email: 'taylor@external.com'
                    }
                }
            ]
        };
        await flush();

        expect(el.answers.el_first_name).toBe('Taylor');
        expect(el.answers.el_email).toBe('default@test.com');
    });

    it('clearing the injected context removes the values Autofill applied', async () => {
        const el = mount();
        await flush();
        await flush();

        el.recordContext = {
            status: 'applied',
            autofill: [
                { ruleId: 'af_link', values: { el_first_name: 'Taylor' } }
            ]
        };
        await flush();
        expect(el.answers.el_first_name).toBe('Taylor');

        // R6 — "Clear test data" sets recordContext to null. That used to return
        // early, stranding the test values in the preview.
        el.recordContext = null;
        await flush();
        expect(el.answers.el_first_name).toBeFalsy();
    });

    it('dispatches lookup source change, mounts record source, and updates answers on recordsuccess', async () => {
        const el = mount();
        await flush();
        await flush();

        // Simulate lookup selection in valuechange
        answer(el, 'el_account_lookup', '001000000000001AAA');
        await flush();

        // Expect submit bar to be disabled with Finishing Autofill… label
        const submitBar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        expect(submitBar.disabled).toBe(true);
        expect(submitBar.config.label).toBe('Finishing Autofill…');

        // Expect c-final-autofill-record-source to be mounted in DOM
        const recordSource = el.shadowRoot.querySelector(
            'c-final-autofill-record-source'
        );
        expect(recordSource).not.toBeNull();
        expect(recordSource.recordId).toBe('001000000000001AAA');
        expect(recordSource.objectApiName).toBe('Account');

        // Simulate successful record load
        recordSource.dispatchEvent(
            new CustomEvent('recordsuccess', {
                detail: {
                    ruleId: 'af_lookup',
                    recordId: '001000000000001AAA',
                    generation: recordSource.generation,
                    sessionId: recordSource.sessionId,
                    values: {
                        Phone: '555-1234',
                        Website: 'https://example.com'
                    }
                }
            })
        );
        await flush();

        // Expect answers to be updated
        expect(el.answers.el_phone).toBe('555-1234');
        expect(el.answers.el_website).toBe('https://example.com');

        // Expect submit bar to be restored
        expect(submitBar.disabled).toBe(false);
        expect(submitBar.config.label).toBe('Submit Ticket');
        expect(
            el.shadowRoot.querySelector('c-final-autofill-record-source')
        ).toBeNull();
    });

    it('handles record source error and displays friendly error', async () => {
        const el = mount();
        await flush();
        await flush();

        answer(el, 'el_account_lookup', '001000000000002AAA');
        await flush();

        const recordSource = el.shadowRoot.querySelector(
            'c-final-autofill-record-source'
        );
        expect(recordSource).not.toBeNull();

        recordSource.dispatchEvent(
            new CustomEvent('recorderror', {
                detail: {
                    ruleId: 'af_lookup',
                    recordId: '001000000000002AAA',
                    generation: recordSource.generation,
                    sessionId: recordSource.sessionId,
                    error: { message: 'Forbidden' }
                }
            })
        );
        await flush();

        expect(el.submitError).toBe(
            'Could not fill these details. Enter them yourself or retry.'
        );
        const submitBar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        expect(submitBar.disabled).toBe(false);
    });

    it('clears rule-owned values when lookup is cleared', async () => {
        const el = mount();
        await flush();
        await flush();

        // 1. Select account
        answer(el, 'el_account_lookup', '001000000000001AAA');
        await flush();

        const recordSource = el.shadowRoot.querySelector(
            'c-final-autofill-record-source'
        );
        recordSource.dispatchEvent(
            new CustomEvent('recordsuccess', {
                detail: {
                    ruleId: 'af_lookup',
                    recordId: '001000000000001AAA',
                    generation: recordSource.generation,
                    sessionId: recordSource.sessionId,
                    values: {
                        Phone: '555-1234',
                        Website: 'https://example.com'
                    }
                }
            })
        );
        await flush();

        expect(el.answers.el_phone).toBe('555-1234');

        // 2. Clear lookup
        answer(el, 'el_account_lookup', null);
        await flush();

        expect(el.answers.el_phone).toBeNull();
        expect(el.answers.el_website).toBeNull();
    });

    it('times out after 10s and displays friendly error', async () => {
        const el = mount();
        await flush();
        await flush();

        jest.useFakeTimers();
        answer(el, 'el_account_lookup', '001000000000003AAA');
        await Promise.resolve();

        expect(
            el.shadowRoot.querySelector('c-final-autofill-record-source')
        ).not.toBeNull();

        // Advance 10 seconds
        jest.advanceTimersByTime(10000);
        await Promise.resolve();

        expect(el.submitError).toBe(
            'Could not fill these details. Enter them yourself or retry.'
        );
        expect(
            el.shadowRoot.querySelector('c-final-autofill-record-source')
        ).toBeNull();
        const submitBar = deepQuery(el.shadowRoot, 'c-final-submit-bar');
        expect(submitBar.disabled).toBe(false);
        jest.useRealTimers();
    });
});
