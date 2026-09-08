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
 * IMPL_PLAN_RECORD_PAGE_EDIT Slice 2 — loading the record a form edits.
 *
 * The exclusions matter as much as the feature: this same component runs the
 * Studio preview and the authoring canvas, and must NEVER read (or later save
 * over) a real customer record from there.
 */
const EDIT_SPEC = {
    specVersion: 1,
    form: {
        name: 'Edit Contact',
        targetObject: 'Contact',
        saveMode: 'update'
    },
    layout: { type: 'scroll', options: {} },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Save' },
    pages: [
        {
            id: 'pg_1',
            sections: [
                {
                    id: 'sec_1',
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
                            id: 'el_dept',
                            type: 'field',
                            label: 'Department',
                            binding: { object: 'Contact', field: 'Department' },
                            render: { inputType: 'text' },
                            config: { defaultValue: 'Unassigned' }
                        }
                    ]
                }
            ]
        }
    ]
};

const RECORD = '003000000000001AAA';
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(spec = EDIT_SPEC, props = {}) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.recordId = RECORD;
    el.objectApiName = 'Contact';
    Object.assign(el, props);
    el.spec = JSON.parse(JSON.stringify(spec));
    document.body.appendChild(el);
    return el;
}

/** The edit reader is tagged `__edit__` to keep it distinct from the
 *  Autofill rule readers that share the component. */
const editSource = (el) =>
    Array.from(
        el.shadowRoot.querySelectorAll('c-final-autofill-record-source')
    ).find((n) => n.ruleId === '__edit__') || null;

describe('c-final-form-viewer record edit mode', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('reads the record it edits, asking only for spec-bound fields', async () => {
        const el = mount();
        await flush();
        await flush();

        const src = editSource(el);
        expect(src).not.toBeNull();
        expect(src.recordId).toBe(RECORD);
        expect(src.objectApiName).toBe('Contact');
        expect([...src.fields].sort()).toEqual(['Department', 'Title']);
    });

    it('seeds the form from the record, and an empty field clears a default', async () => {
        const el = mount();
        await flush();
        await flush();
        // The static default is in place before the record arrives.
        expect(el.answers.el_dept).toBe('Unassigned');

        editSource(el).dispatchEvent(
            new CustomEvent('recordsuccess', {
                detail: {
                    ruleId: '__edit__',
                    recordId: RECORD,
                    // Department is present but EMPTY on the record. On an edit
                    // form the record is the truth, so the default must lose.
                    values: { Title: 'Head of Napping', Department: null }
                }
            })
        );
        await flush();

        expect(el.answers.el_title).toBe('Head of Napping');
        expect(el.answers.el_dept).toBeNull();
    });

    it('seeds ONCE — a later read cannot undo what the respondent typed', async () => {
        const el = mount();
        await flush();
        await flush();

        const src = editSource(el);
        const load = (title) =>
            src.dispatchEvent(
                new CustomEvent('recordsuccess', {
                    detail: {
                        ruleId: '__edit__',
                        recordId: RECORD,
                        values: { Title: title }
                    }
                })
            );

        load('First');
        await flush();
        expect(el.answers.el_title).toBe('First');

        load('Second');
        await flush();
        expect(el.answers.el_title).toBe('First');
    });

    it('does NOT arm for a create-mode form, even on a record page', async () => {
        const createSpec = JSON.parse(JSON.stringify(EDIT_SPEC));
        createSpec.form.saveMode = 'create';

        const el = mount(createSpec);
        await flush();
        await flush();

        expect(editSource(el)).toBeNull();
    });

    // The Studio preview and authoring canvas render this same component. If
    // edit mode armed there, opening a form for design would read — and on
    // submit overwrite — a real customer record.
    it.each([
        ['authoring', { authoring: true }],
        ['preservePreview (studio stage)', { preservePreview: true }],
        ['delegateSubmit (guest host)', { delegateSubmit: true }]
    ])('does NOT arm under %s', async (_label, props) => {
        const el = mount(EDIT_SPEC, props);
        await flush();
        await flush();

        expect(editSource(el)).toBeNull();
    });
});
