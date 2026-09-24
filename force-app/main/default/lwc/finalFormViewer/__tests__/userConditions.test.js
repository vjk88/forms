import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import { getRecord } from 'lightning/uiRecordApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

/**
 * Current user conditions (IMPL_PLAN_F2_SEARCH D55, decisions 15 and 18):
 * the viewer reads the signed-in person's values once, with their field
 * types, and a rule on them only counts once BOTH have arrived — a date
 * compared without its type would compare as a number.
 */
function specWith(visibility) {
    return {
        specVersion: 1,
        form: { name: 'User rules' },
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
                                visibility
                            }
                        ]
                    }
                ]
            }
        ]
    };
}

const show = (rules, logic = 'all', customLogic = null) => ({
    action: 'show',
    logic,
    customLogic,
    rules
});

const profileIsAdmin = {
    source: 'user:Profile.Name',
    operator: 'equals',
    value: 'Admin'
};

const USER_RECORD = {
    fields: {
        Title: { value: null },
        LastLoginDate: { value: '2026-05-01T10:00:00.000Z' },
        Profile: { value: { fields: { Name: { value: 'Admin' } } } },
        UserRole: { value: null }
    }
};

const USER_INFO = {
    fields: {
        Title: { dataType: 'String' },
        LastLoginDate: { dataType: 'DateTime' }
    }
};

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

async function mount(visibility) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = specWith(visibility);
    document.body.appendChild(el);
    await flush();
    return el;
}

const gatedShown = (el) => renderers(el.shadowRoot).length === 2;

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('Current user conditions in the viewer', () => {
    it('asks for the user only when a rule reads them, and only those fields', async () => {
        await mount(show([profileIsAdmin]));
        const config = getRecord.getLastConfig();
        expect(config.recordId).toBeTruthy();
        expect(config.optionalFields).toEqual(['User.Profile.Name']);
    });

    it('shows once both the values and the types are in — values first', async () => {
        const el = await mount(show([profileIsAdmin]));
        expect(gatedShown(el)).toBe(false);
        getRecord.emit(USER_RECORD);
        await flush();
        expect(gatedShown(el)).toBe(false); // types not in yet
        getObjectInfo.emit(USER_INFO);
        await flush();
        expect(gatedShown(el)).toBe(true);
    });

    it('…and types first', async () => {
        const el = await mount(show([profileIsAdmin]));
        getObjectInfo.emit(USER_INFO);
        await flush();
        expect(gatedShown(el)).toBe(false);
        getRecord.emit(USER_RECORD);
        await flush();
        expect(gatedShown(el)).toBe(true);
    });

    it('a failed type read leaves user details unavailable, even under NOT', async () => {
        const el = await mount(show([profileIsAdmin], 'custom', 'NOT 1'));
        getRecord.emit(USER_RECORD);
        getObjectInfo.error();
        await flush();
        expect(gatedShown(el)).toBe(false);
    });

    it('compares a user date as a date', async () => {
        const el = await mount(
            show([
                {
                    source: 'user:LastLoginDate',
                    operator: 'greaterThan',
                    value: '2026-01-01'
                }
            ])
        );
        getRecord.emit(USER_RECORD);
        getObjectInfo.emit(USER_INFO);
        await flush();
        expect(gatedShown(el)).toBe(true);
    });

    it('a blank field is a real value: NOT works on it', async () => {
        const el = await mount(
            show(
                [
                    {
                        source: 'user:Title',
                        operator: 'equals',
                        value: 'Manager'
                    }
                ],
                'custom',
                'NOT 1'
            )
        );
        getRecord.emit(USER_RECORD);
        getObjectInfo.emit(USER_INFO);
        await flush();
        expect(gatedShown(el)).toBe(true);
    });
});
