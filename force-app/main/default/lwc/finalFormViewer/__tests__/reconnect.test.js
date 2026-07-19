import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

// LWR page caching can reconnect a surviving viewer instance into a rebuilt
// Locker realm; the cached lwc:is ctor from the old realm then blanks the page
// ("Illegal constructor"). The fix re-resolves navCtor on every reconnect
// (FINALFORMVIEWER_EXPERIENCE_CLOUD_BLANK_PAGE.md, Option B) — this locks the
// observable half: after disconnect + reconnect the nav must remount, not
// short-circuit on the _loadedKey/instance-cache path.
const SPEC = () => ({
    specVersion: 1,
    form: { name: 'Reconnect' },
    layout: { type: 'scroll' },
    header: { title: 'T' },
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
                            id: 'el_1',
                            type: 'field',
                            label: 'A',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ]
});

const flush = () => new Promise((r) => setTimeout(r, 0));

/** sfdx-lwc-jest mounts dynamic (`lwc:is`) components as <x-test> — find the
 *  nav by its `options` @api rather than by tag. */
function findNav(root) {
    for (const el of root.querySelectorAll('*')) {
        if (el.tagName === 'X-TEST' && 'options' in el) {
            return el;
        }
        if (el.shadowRoot) {
            const found = findNav(el.shadowRoot);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

describe('reconnect re-resolves the dynamic nav (LWR realm-rebuild fix)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('nav remounts after disconnect + reconnect of the same instance', async () => {
        const cmp = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        cmp.spec = SPEC();
        document.body.appendChild(cmp);
        await flush();
        await flush();
        expect(findNav(cmp.shadowRoot)).not.toBeNull();

        document.body.removeChild(cmp);
        document.body.appendChild(cmp); // same instance, connectedCallback re-fires
        await flush();
        await flush(); // re-import resolves, navCtor reassigned

        const nav = findNav(cmp.shadowRoot);
        expect(nav).not.toBeNull();
        // the remounted nav still carries the applied model
        expect(nav.options).toBeDefined();
    });
});
