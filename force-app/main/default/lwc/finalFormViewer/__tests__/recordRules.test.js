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
        cmp.recordId = recordId;
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
});
