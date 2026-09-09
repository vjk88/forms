import getRecordContext from '@salesforce/apex/FinalSurveyObjectController.getRecordContext';
import { CurrentPageReference } from 'lightning/navigation';
import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

jest.mock(
    '@salesforce/apex/FinalSurveyObjectController.getRecordContext',
    () => ({
        default: jest.fn(() =>
            Promise.resolve({
                prefill: {},
                ruleFacts: { 'record:Plan__c|equals|Enterprise': true }
            })
        )
    }),
    { virtual: true }
);

/** SO-3: record-gated elements resolve through server-shipped verdicts —
 *  with a record context the fact un-hides the element; without one the
 *  record row reads "no match" and show-gated content stays hidden. */
const SPEC = () => ({
    specVersion: 1,
    form: { name: 'S', type: 'survey', targetObject: 'Account' },
    layout: { type: 'scroll' },
    header: { style: 'none' },
    theme: null,
    submit: { label: 'Send' },
    settings: {},
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    title: 'Main',
                    style: 'plain',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_open',
                            type: 'field',
                            label: 'Always here',
                            render: { inputType: 'text' }
                        },
                        {
                            id: 'el_gated',
                            type: 'field',
                            label: 'Enterprise only',
                            render: { inputType: 'text' },
                            visibility: {
                                action: 'show',
                                logic: 'all',
                                rules: [
                                    {
                                        source: 'record:Plan__c',
                                        operator: 'equals',
                                        value: 'Enterprise'
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
    ]
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(recordId) {
    const cmp = createElement('c-final-form-viewer', { is: FinalFormViewer });
    if (recordId) {
        cmp.surveyContextRecordId = recordId;
    }
    cmp.spec = SPEC();
    document.body.appendChild(cmp);
    await flush();
    await flush();
    await flush();
    return cmp;
}

/** The dynamic layout mounts as an x-test stub under sfdx-lwc-jest — assert
 *  on the FILTERED pages the viewer hands it (visiblePages output). */
function visibleElementIds(cmp) {
    const frame = cmp.shadowRoot.querySelector('c-final-page-frame');
    const layout = frame.querySelector('x-test');
    const ids = [];
    for (const p of layout.pages || []) {
        for (const s of p.sections || []) {
            for (const el of s.elements || []) {
                ids.push(el.id);
            }
        }
    }
    return ids;
}

describe('record-rule verdicts in the viewer (SO-3)', () => {
    afterEach(() => {
        jest.clearAllMocks();
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a record context un-hides the gated question via the fact', async () => {
        const cmp = await mount('001000000000001AAA');
        expect(visibleElementIds(cmp)).toEqual(['el_open', 'el_gated']);
    });

    it('no record context = record rows read no-match, gated stays hidden', async () => {
        const cmp = await mount(null);
        expect(visibleElementIds(cmp)).toEqual(['el_open']);
    });

    it('SO-4: injected recordContext (guest path) un-hides the gated question without an Apex call', async () => {
        const cmp = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        cmp.delegateSubmit = true; // guest host owns the fetch; viewer never calls Apex
        cmp.recordContext = {
            prefill: {},
            ruleFacts: { 'record:Plan__c|equals|Enterprise': true }
        };
        cmp.spec = SPEC();
        document.body.appendChild(cmp);
        await flush();
        await flush();
        await flush();
        expect(visibleElementIds(cmp)).toEqual(['el_open', 'el_gated']);
    });
});

describe('explicit survey context lifecycle', () => {
    afterEach(() => {
        document.body.replaceChildren();
        jest.clearAllMocks();
    });
    it('ignores an edit target for a survey', async () => {
        const cmp = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        cmp.existingRecordId = '001000000000001AAA';
        cmp.spec = SPEC();
        document.body.appendChild(cmp);
        await flush();
        await flush();
        expect(visibleElementIds(cmp)).toEqual(['el_open']);
        expect(getRecordContext).not.toHaveBeenCalled();
    });

    it('resolves a survey expression and discards stale context after navigation', async () => {
        let finishA;
        getRecordContext.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishA = resolve;
                })
        );
        getRecordContext.mockResolvedValueOnce({
            prefill: { el_open: 'B' },
            ruleFacts: {}
        });
        const cmp = await mount('{!recordId}');
        expect(
            cmp.shadowRoot.querySelector('.viewer-error').textContent
        ).toContain('valid record ID');
        CurrentPageReference.emit({
            type: 'standard__recordPage',
            attributes: { recordId: '001000000000001AAA' }
        });
        await flush();
        await flush();
        CurrentPageReference.emit({
            type: 'standard__recordPage',
            attributes: { recordId: '001000000000002AAA' }
        });
        await flush();
        await flush();
        expect(cmp.answers.el_open).toBe('B');
        finishA({
            prefill: { el_open: 'A' },
            ruleFacts: { 'record:Plan__c|equals|Enterprise': true }
        });
        await flush();
        expect(cmp.answers.el_open).toBe('B');
        expect(visibleElementIds(cmp)).toEqual(['el_open']);
        cmp.surveyContextRecordId = '';
        await flush();
        await flush();
        expect(cmp.answers.el_open).toBeUndefined();
    });

    it('restarts survey context loading after a response arrived while disconnected', async () => {
        let finishA;
        getRecordContext.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishA = resolve;
                })
        );
        getRecordContext.mockResolvedValueOnce({
            prefill: { el_open: 'Reconnected' },
            ruleFacts: {}
        });
        const cmp = await mount('001000000000001AAA');
        cmp.remove();
        finishA({ prefill: { el_open: 'Detached' }, ruleFacts: {} });
        await flush();
        document.body.appendChild(cmp);
        await flush();
        await flush();
        expect(cmp.answers.el_open).toBe('Reconnected');
        expect(getRecordContext).toHaveBeenCalledTimes(2);
    });

    it('uses the named survey URL fallback', async () => {
        const cmp = await mount(null);
        CurrentPageReference.emit({
            state: { c__surveyContextRecordId: '001000000000001AAA' }
        });
        await flush();
        await flush();
        expect(getRecordContext).toHaveBeenCalledWith(
            expect.objectContaining({ recordId: '001000000000001AAA' })
        );
        expect(visibleElementIds(cmp)).toEqual(['el_open', 'el_gated']);
    });
});
