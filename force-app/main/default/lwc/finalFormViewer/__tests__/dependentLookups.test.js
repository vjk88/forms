import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import search from '@salesforce/apex/FinalLookupController.search';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalLookupController.search',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = {
    specVersion: 1,
    form: { name: 'Dependent', targetObject: 'Case' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Send' },
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    title: 'S',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_account',
                            type: 'field',
                            label: 'Account',
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_contact',
                            type: 'field',
                            label: 'Contact',
                            binding: { object: 'Case', field: 'ContactId' },
                            config: { inputType: 'reference' },
                            lookupConfig: {
                                targetObject: 'Contact',
                                displayFields: ['Name'],
                                searchFields: ['Name'],
                                filter: {
                                    logic: 'all',
                                    rows: [
                                        {
                                            fieldPath: 'AccountId',
                                            operator: 'eq',
                                            value: '$field.el_account'
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            ]
        }
    ]
};

const flush = async () => {
    for (let i = 0; i < 6; i++) {
        await Promise.resolve();
    }
};

function deepQueryAll(root, selector, acc = []) {
    acc.push(...root.querySelectorAll(selector));
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            deepQueryAll(el.shadowRoot, selector, acc);
        }
    }
    return acc;
}
const deepQuery = (root, s) => deepQueryAll(root, s)[0] || null;

const lookupOf = (el) => deepQuery(el.shadowRoot, 'c-final-lookup');

function typeAccount(el, value) {
    const input = deepQueryAll(el.shadowRoot, 'lightning-input').find(
        (i) => i.label === 'Account'
    );
    input.value = value;
    input.type = 'text';
    input.dispatchEvent(new CustomEvent('change'));
}

/** Drive the REAL combobox: type, let the debounce fire, pick the first row. */
async function pickContact(el) {
    const lookup = lookupOf(el);
    const input = lookup.shadowRoot.querySelector('.fl-input');
    input.value = 'ro';
    input.dispatchEvent(new CustomEvent('input'));
    jest.runOnlyPendingTimers();
    await flush();
    await flush();
    const option = lookup.shadowRoot.querySelector('.fl-opt');
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flush();
    await flush();
}

async function mount() {
    getSpec.mockResolvedValue(JSON.stringify(SPEC));
    submitForm.mockResolvedValue({ recordId: '500x', childCount: 0 });
    search.mockResolvedValue([
        { id: '003a', title: 'Rose Gonzalez', subtitle: 'Edge' }
    ]);
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.versionId = 'a0Vx';
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

describe('c-final-form-viewer — dependent lookups', () => {
    beforeEach(() => jest.useFakeTimers());

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('sends the current answers with the search so the server can filter', async () => {
        const el = await mount();
        typeAccount(el, '001AAA');
        await flush();
        await pickContact(el);
        expect(search).toHaveBeenCalled();
        const sent = JSON.parse(search.mock.calls[0][0].answersJson);
        expect(sent.el_account).toBe('001AAA');
    });

    it('KEEPS a selection when its filter changes, and marks it instead of deleting it', async () => {
        const el = await mount();
        typeAccount(el, '001AAA');
        await flush();
        await pickContact(el);

        const lookup = lookupOf(el);
        expect(lookup.value).toBe('003a');
        expect(lookup.shadowRoot.querySelector('.fl-error')).toBeNull();

        // the ground moves under the selection
        typeAccount(el, '001BBB');
        await flush();
        await flush();

        expect(lookup.value).toBe('003a'); // the respondent's work survives
        const error = lookup.shadowRoot.querySelector('.fl-error');
        expect(error).not.toBeNull();
        expect(error.textContent).toContain('Rose Gonzalez');
    });

    it('blocks submit while a selection is marked', async () => {
        const el = await mount();
        typeAccount(el, '001AAA');
        await flush();
        await pickContact(el);
        typeAccount(el, '001BBB');
        await flush();
        await flush();

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        await flush();
        expect(submitForm).not.toHaveBeenCalled();
    });

    it('choosing again clears the mark and lets the submit through', async () => {
        const el = await mount();
        typeAccount(el, '001AAA');
        await flush();
        await pickContact(el);
        typeAccount(el, '001BBB');
        await flush();
        await flush();
        expect(
            lookupOf(el).shadowRoot.querySelector('.fl-error')
        ).not.toBeNull();

        // clear, then pick from the new filter
        lookupOf(el).shadowRoot.querySelector('.fl-clear').click();
        await flush();
        await pickContact(el);
        expect(lookupOf(el).shadowRoot.querySelector('.fl-error')).toBeNull();

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        await flush();
        expect(submitForm).toHaveBeenCalledTimes(1);
    });

    it('an untouched lookup is never marked just because a parent changed', async () => {
        const el = await mount();
        typeAccount(el, '001AAA');
        await flush();
        typeAccount(el, '001BBB');
        await flush();
        await flush();
        // nothing was ever chosen, so there is nothing to invalidate
        expect(lookupOf(el).shadowRoot.querySelector('.fl-error')).toBeNull();

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        await flush();
        expect(submitForm).toHaveBeenCalledTimes(1);
    });

    it('re-answering a parent with the SAME value marks nothing', async () => {
        const el = await mount();
        typeAccount(el, '001AAA');
        await flush();
        await pickContact(el);
        typeAccount(el, '001AAA'); // no-op write
        await flush();
        await flush();
        expect(lookupOf(el).shadowRoot.querySelector('.fl-error')).toBeNull();
    });
});
