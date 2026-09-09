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

/**
 * Slice 1 of IMPL_PLAN_RECORD_PAGE_EDIT: the viewer can now be dropped on a
 * record page, so it must refuse a placement whose object does not match the
 * form's target instead of rendering a form whose every save would fail.
 *
 * The guard has to stay INERT on every other host, which is the real risk
 * here — the same component serves the guest site, the studio preview and
 * app/home pages. Those cases are asserted too, not assumed.
 */
const SPEC = {
    specVersion: 1,
    form: { name: 'Contact Form', targetObject: 'Contact', saveMode: 'create' },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Submit' },
    pages: [
        {
            id: 'pg_1',
            sections: [
                {
                    id: 'sec_1',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_last',
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

function mount({ spec = SPEC, objectApiName, existingRecordId } = {}) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    if (objectApiName !== undefined) {
        el.objectApiName = objectApiName;
    }
    el.existingRecordId = existingRecordId;
    el.spec = JSON.parse(JSON.stringify(spec));
    document.body.appendChild(el);
    return el;
}

const errorText = (el) => {
    const node = el.shadowRoot.querySelector('.viewer-error');
    return node ? node.textContent.trim() : null;
};

/**
 * "No error" alone is a false-pass trap: a component that failed to render at
 * all also shows no error. The positive cases must prove the form actually
 * mounted, so they assert the page frame is present.
 */
const rendered = (el) =>
    Boolean(el.shadowRoot.querySelector('c-final-page-frame'));

describe('c-final-form-viewer record-page placement guard', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('refuses a form whose target object is not the page object', async () => {
        const el = mount({
            objectApiName: 'Account',
            existingRecordId: '{!recordId}'
        });
        await flush();
        await flush();

        expect(errorText(el)).toBe(
            "This form saves to Contact, so it can't be used on a Account page."
        );
        expect(rendered(el)).toBe(false);
    });

    it('allows create on a different object record page', async () => {
        const el = mount({ objectApiName: 'Account' });
        await flush();
        await flush();
        expect(errorText(el)).toBeNull();
        expect(rendered(el)).toBe(true);
    });

    it('renders when the page object matches the form target', async () => {
        const el = mount({ objectApiName: 'Contact' });
        await flush();
        await flush();

        expect(errorText(el)).toBeNull();
        expect(rendered(el)).toBe(true);
    });

    it('stays inert where no page object is injected (app/home/guest hosts)', async () => {
        const el = mount();
        await flush();
        await flush();

        expect(errorText(el)).toBeNull();
        expect(rendered(el)).toBe(true);
    });

    it('stays inert for a GUEST spec, whose targetObject has been stripped', async () => {
        // projectForGuest removes form.targetObject before the spec ever
        // reaches a client, so the guard has nothing to compare and must not
        // invent a mismatch.
        const guestSpec = JSON.parse(JSON.stringify(SPEC));
        delete guestSpec.form.targetObject;

        const el = mount({ spec: guestSpec, objectApiName: 'Account' });
        await flush();
        await flush();

        expect(errorText(el)).toBeNull();
        expect(rendered(el)).toBe(true);
    });
});
