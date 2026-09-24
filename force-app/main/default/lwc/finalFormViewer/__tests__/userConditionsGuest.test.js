import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import { getRecord } from 'lightning/uiRecordApi';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock('@salesforce/user/isGuest', () => ({ default: true }), {
    virtual: true
});

/**
 * A guest has no user details (decision 18): the viewer never reads them,
 * and a rule on them is unknown — not met — even with NOT around it.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

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

it('never reads a guest, and NOT (Profile name = Partner) stays hidden', async () => {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = {
        specVersion: 1,
        form: { name: 'Guest' },
        layout: { type: 'scroll', options: {} },
        header: { style: 'none' },
        theme: null,
        submit: { label: 'Submit' },
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
                                id: 'el_plain',
                                type: 'field',
                                label: 'Plain',
                                render: { inputType: 'text' }
                            },
                            {
                                id: 'el_gated',
                                type: 'field',
                                label: 'Gated',
                                render: { inputType: 'text' },
                                visibility: {
                                    action: 'show',
                                    logic: 'custom',
                                    customLogic: 'NOT 1',
                                    rules: [
                                        {
                                            source: 'user:Profile.Name',
                                            operator: 'equals',
                                            value: 'Partner'
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }
        ]
    };
    document.body.appendChild(el);
    await flush();
    const config = getRecord.getLastConfig();
    expect(config ? config.recordId : undefined).toBeUndefined();
    expect(renderers(el.shadowRoot)).toHaveLength(1);
});
