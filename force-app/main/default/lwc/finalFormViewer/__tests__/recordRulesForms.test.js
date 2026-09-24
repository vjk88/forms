import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
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
    '@salesforce/apex/FinalSurveyObjectController.getRecordContext',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/**
 * D56: a Form's linked record is the record it edits. Its conditions are
 * judged on the server; until the verdicts arrive, or when there is no
 * record (create mode) or the read fails, they are unknown — so a NOT can
 * never reveal a question that should stay hidden (decision 18).
 */
const RECORD = '003000000000001AAA';
const flush = () => new Promise((r) => setTimeout(r, 0));

function specWith(visibility) {
    return {
        specVersion: 1,
        form: { name: 'Edit Contact', targetObject: 'Contact' },
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
                                id: 'el_gated',
                                type: 'field',
                                label: 'Gated',
                                render: { inputType: 'text' },
                                visibility
                            }
                        ]
                    }
                ]
            }
        ]
    };
}

const titleIs = (customLogic) => ({
    action: 'show',
    logic: customLogic ? 'custom' : 'all',
    customLogic: customLogic || null,
    rules: [{ source: 'record:Title', operator: 'equals', value: 'Manager' }]
});

function renderers(root, out = []) {
    for (const el of root.querySelectorAll('*')) {
        if (el.tagName === 'C-FINAL-ELEMENT-RENDERER') {
            out.push(el);
        }
        if (el.shadowRoot) {
            renderers(el.shadowRoot, out);
        }
    }
    return out;
}

const gatedShown = (el) => renderers(el.shadowRoot).length === 2;

const editSource = (el) =>
    Array.from(
        el.shadowRoot.querySelectorAll('c-final-autofill-record-source')
    ).find((n) => n.ruleId === '__edit__') || null;

async function mountEditing(visibility) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.existingRecordId = RECORD;
    el.objectApiName = 'Contact';
    el.spec = specWith(visibility);
    document.body.appendChild(el);
    await flush();
    await flush();
    const src = editSource(el);
    src.dispatchEvent(
        new CustomEvent('recordsuccess', {
            detail: {
                ruleId: '__edit__',
                recordId: RECORD,
                generation: src.generation,
                sessionId: src.sessionId,
                values: { Title: 'Anything' }
            }
        })
    );
    await flush();
    return el;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

describe('linked-record conditions on a Form (D56)', () => {
    it('asks the server about the record it edits, and shows on a match', async () => {
        getRecordContext.mockResolvedValue({
            ruleFacts: { 'record:Title|equals|Manager': true }
        });
        const el = await mountEditing(titleIs());
        await flush();
        await flush();
        expect(getRecordContext).toHaveBeenCalledWith(
            expect.objectContaining({ recordId: RECORD })
        );
        expect(gatedShown(el)).toBe(true);
    });

    it('NOT stays hidden while the verdicts load, then works on the answer', async () => {
        let resolve;
        getRecordContext.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            })
        );
        const el = await mountEditing(titleIs('NOT 1'));
        expect(gatedShown(el)).toBe(false); // unknown while loading
        resolve({ ruleFacts: { 'record:Title|equals|Manager': false } });
        await flush();
        await flush();
        expect(gatedShown(el)).toBe(true); // the record is there: NOT false
    });

    it('NOT stays hidden when the read fails', async () => {
        getRecordContext.mockRejectedValue(new Error('no access'));
        const el = await mountEditing(titleIs('NOT 1'));
        await flush();
        expect(gatedShown(el)).toBe(false);
    });

    it('in create mode there is no linked record: NOT stays hidden, nothing asked', async () => {
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.spec = specWith(titleIs('NOT 1'));
        document.body.appendChild(el);
        await flush();
        await flush();
        expect(getRecordContext).not.toHaveBeenCalled();
        expect(gatedShown(el)).toBe(false);
    });
});
