import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getSpec from '@salesforce/apex/FinalSpecController.getSpec';
import getRecordContext from '@salesforce/apex/FinalSurveyObjectController.getRecordContext';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpec',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSurveyObjectController.getRecordContext',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/**
 * Server rejections must reach the field that failed.
 *
 * The old build routed `SubmitResult.errors` onto the exact field and page;
 * the rebuild collapsed every failure into one sentence, so a validation rule
 * on a single field told the respondent nothing about which. These cover the
 * restored routing.
 *
 * Driven through the PUBLISHED getSpec path on purpose: with an inline spec
 * the viewer SIMULATES submit and never calls Apex, so an assertion about
 * submit results would be vacuous.
 */
const SPEC = {
    specVersion: 1,
    form: { name: 'Server errors', targetObject: 'Contact' },
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
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_title',
                            type: 'field',
                            label: 'Title',
                            binding: { object: 'Contact', field: 'Title' },
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_ln',
                            type: 'field',
                            label: 'Last name',
                            binding: { object: 'Contact', field: 'LastName' },
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
    if (direct) return direct;
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
        }
    }
    return null;
}

async function published() {
    getSpec.mockResolvedValue(JSON.stringify(SPEC));
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.versionId = 'a0Vx';
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

const submit = async (el) => {
    deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
        new CustomEvent('submit')
    );
    await flush();
    await flush();
};

/** Every field-level message currently rendered, across all elements. */
function fieldErrorTexts(el) {
    const out = [];
    const seen = new Set();
    const walk = (root) => {
        if (!root || seen.has(root)) return;
        seen.add(root);
        for (const n of root.querySelectorAll('.field-error')) {
            out.push(n.textContent.trim());
        }
        for (const n of root.querySelectorAll('*')) {
            if (n.shadowRoot) walk(n.shadowRoot);
        }
    };
    walk(el.shadowRoot);
    return out;
}

describe('server submit errors reach the field that failed', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('routes a field-scoped rejection onto that element, and still answers at the button', async () => {
        const el = await published();
        submitForm.mockResolvedValue({
            errors: [{ message: 'Title is not allowed.', fields: ['Title'] }]
        });

        await submit(el);

        expect(fieldErrorTexts(el)).toContain('Title is not allowed.');
        // Something must always appear where they pressed the button.
        expect(el.submitError).toBe(
            'Some answers were not accepted. See the highlighted fields.'
        );
        // A rejected save is NOT a completed one.
        expect(el.shadowRoot.querySelector('c-final-after-submit')).toBeNull();
    });

    // THE CASE THE ORG ACTUALLY PRODUCES. `getDmlFieldNames` returns the API
    // name in an Apex test but the LABEL in a live LWC request — verified in
    // this org 2026-09-09 on the same failing insert. The first version of
    // this feature mapped by API name only: every Apex and Jest test passed
    // and the real submit routed nothing.
    it('maps a rejection that names the field by LABEL, not API name', async () => {
        const el = await published();
        submitForm.mockResolvedValue({
            errors: [
                {
                    message: 'Required fields are missing: [Last Name]',
                    fields: ['Last Name']
                }
            ]
        });

        await submit(el);

        expect(fieldErrorTexts(el)).toContain(
            'Required fields are missing: [Last Name]'
        );
    });

    it('keeps a rejection that names no field at the button only', async () => {
        const el = await published();
        submitForm.mockResolvedValue({
            errors: [
                { message: 'You may not create contacts today.', fields: [] }
            ]
        });

        await submit(el);

        expect(el.submitError).toBe('You may not create contacts today.');
        expect(fieldErrorTexts(el)).toEqual([]);
    });

    it('clears a field rejection once the respondent changes that answer', async () => {
        const el = await published();
        submitForm.mockResolvedValue({
            errors: [{ message: 'Title is not allowed.', fields: ['Title'] }]
        });
        await submit(el);
        expect(fieldErrorTexts(el)).toContain('Title is not allowed.');

        // The message describes a value that no longer exists.
        const input = deepQuery(el.shadowRoot, 'lightning-input');
        input.value = 'Something else';
        input.type = 'text';
        input.dispatchEvent(new CustomEvent('change'));
        await flush();

        expect(fieldErrorTexts(el)).not.toContain('Title is not allowed.');
    });

    it('still completes normally when the server returns no errors', async () => {
        const el = await published();
        submitForm.mockResolvedValue({ recordId: '003X', childCount: 0 });

        await submit(el);

        expect(
            el.shadowRoot.querySelector('c-final-after-submit')
        ).not.toBeNull();
        expect(el.submitError).toBeUndefined();
    });
});

/**
 * SURVEYS reach real fields too — a mapped question writes back onto the
 * connected record, and that write can be rejected. Routing built only on
 * `binding` was blind to every survey, because survey questions carry
 * `mapping` instead.
 */
const SURVEY_SPEC = {
    specVersion: 1,
    form: { name: 'Survey errors', type: 'survey', targetObject: 'Contact' },
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
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'q_role',
                            type: 'field',
                            label: 'Your role',
                            mapping: { object: 'Contact', field: 'Title' },
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
};

describe('survey writeback rejections reach the mapped question', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('re-enables Submit once the record context LOADS, not only when it fails', async () => {
        // The success path used to leave `_surveyLoading` true forever, so a
        // survey with a connected record could never be submitted at all —
        // only the failure path cleared it. Found in a browser 2026-09-09
        // with 843 tests green.
        getRecordContext.mockResolvedValue({ ruleFacts: {}, prefill: {} });
        getSpec.mockResolvedValue(JSON.stringify(SURVEY_SPEC));
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.versionId = 'a0Vx';
        el.surveyContextRecordId = '003000000000001AAA';
        document.body.appendChild(el);
        await flush();
        await flush();
        await flush();

        expect(getRecordContext).toHaveBeenCalled();
        expect(deepQuery(el.shadowRoot, 'c-final-submit-bar').disabled).toBe(
            false
        );
    });

    it('routes a rejected mapped field onto the question that maps it', async () => {
        getSpec.mockResolvedValue(JSON.stringify(SURVEY_SPEC));
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.versionId = 'a0Vx';
        document.body.appendChild(el);
        await flush();
        await flush();

        submitForm.mockResolvedValue({
            errors: [{ message: 'Title must be approved.', fields: ['Title'] }]
        });
        await submit(el);

        expect(fieldErrorTexts(el)).toContain('Title must be approved.');
        expect(el.shadowRoot.querySelector('c-final-after-submit')).toBeNull();
    });
});
