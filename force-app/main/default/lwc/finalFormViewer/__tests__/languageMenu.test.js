import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

// Translations PR 4: the corner language menu. Choosing a language re-applies
// the author's ORIGINAL spec in it, keeping answers and the current page.
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalGuestController.runtimeLabels',
    () => ({ default: jest.fn(() => Promise.resolve({})) }),
    { virtual: true }
);

function field(id, label) {
    return { id, type: 'field', label, render: { inputType: 'text' } };
}

function spec(extra = {}) {
    return {
        specVersion: 1,
        form: { name: 'Guest', targetObject: 'Contact' },
        layout: { type: 'stepper', options: {} },
        header: { style: 'none' },
        theme: null,
        settings: { completion: { mode: 'screen' } },
        submit: { label: 'Send', nextLabel: 'Go on' },
        pages: [
            {
                id: 'pg_1',
                name: 'About you',
                sections: [
                    {
                        id: 'sec_1',
                        style: 'plain',
                        columns: 1,
                        elements: [field('el_name', 'Your name')]
                    }
                ]
            },
            {
                id: 'pg_2',
                name: 'Extras',
                sections: [
                    {
                        id: 'sec_2',
                        style: 'plain',
                        columns: 1,
                        elements: [field('el_note', 'Note')]
                    }
                ]
            }
        ],
        languages: { default: 'en_US', available: ['en_US', 'fr'] },
        translations: {
            fr: {
                'el:el_name.label': 'Votre nom',
                'el:el_note.label': 'Remarque',
                'submit.label': 'Envoyer',
                'submit.nextLabel': 'Continuer',
                'page:pg_2.name': 'Supplements'
            }
        },
        ...extra
    };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
async function settle() {
    await flush();
    await flush();
    await flush();
}

function deepText(root) {
    let text = root.textContent || '';
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            text += ' ' + deepText(el.shadowRoot);
        }
        if (el.label) {
            text += ' ' + el.label;
        }
    }
    return text;
}

function deepQuery(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) {
        return direct;
    }
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

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

function mount(value, { authoring = false } = {}) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.authoring = authoring;
    el.spec = value;
    el.delegateSubmit = true;
    document.body.appendChild(el);
    return el;
}

const menuOf = (el) => deepQuery(el.shadowRoot, 'c-final-language-menu');
const selectOf = (el) => menuOf(el).shadowRoot.querySelector('select');

async function choose(el, code) {
    const select = selectOf(el);
    select.value = code;
    select.dispatchEvent(new Event('change'));
    await settle();
}

describe('c-final-form-viewer language menu', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        window.history.replaceState({}, '', '/');
        try {
            window.sessionStorage.clear();
        } catch {
            // ignore
        }
        jest.clearAllMocks();
    });

    it('is hidden with one language, or with no languages block', async () => {
        const one = mount(
            spec({ languages: { default: 'en_US', available: ['en_US'] } })
        );
        const none = mount(spec({ languages: undefined }));
        await settle();
        expect(menuOf(one)).toBeNull();
        expect(menuOf(none)).toBeNull();
    });

    it('is hidden when the author turned it off', async () => {
        const el = mount(
            spec({
                languages: {
                    default: 'en_US',
                    available: ['en_US', 'fr'],
                    showSwitcher: false
                }
            })
        );
        await settle();
        expect(menuOf(el)).toBeNull();
    });

    it('shows with 2+ languages, listing each in its own language', async () => {
        const el = mount(spec());
        await settle();
        expect(menuOf(el)).not.toBeNull();
        const names = [...selectOf(el).querySelectorAll('option')].map((o) =>
            o.textContent.trim()
        );
        expect(names[0]).toBe('English');
        expect(names[1]).toBe('Français');
    });

    it('shows in the Studio preview too', async () => {
        const el = mount(spec(), { authoring: true });
        await settle();
        expect(menuOf(el)).not.toBeNull();
        expect(deepText(el.shadowRoot)).toContain('Your name');
        await choose(el, 'fr');
        expect(deepText(el.shadowRoot)).toContain('Votre nom');
    });

    it('choosing French re-renders in French, keeping the answer and the page', async () => {
        const el = mount(spec());
        await settle();
        const nav = findNav(el.shadowRoot);
        nav.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: 'el_name', value: 'Ada' }
            })
        );
        nav.dispatchEvent(
            new CustomEvent('pagechange', { detail: { index: 1 } })
        );
        await settle();
        expect(findNav(el.shadowRoot).currentPageIndex).toBe(1);

        await choose(el, 'fr');

        expect(findNav(el.shadowRoot).currentPageIndex).toBe(1);
        const text = deepText(el.shadowRoot);
        expect(text).toContain('Remarque');
        expect(text).toContain('Supplements');
        expect(text).not.toContain('Extras');
        // the first page's typed answer is still there, by value
        expect(el.answers.el_name).toBe('Ada');
    });

    it('meta.lang follows the chosen language on submit', async () => {
        const el = mount(spec());
        const handler = jest.fn();
        el.addEventListener('submitrequest', handler);
        await settle();
        await choose(el, 'fr');
        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();
        expect(handler.mock.calls[0][0].detail.payload.meta.lang).toBe('fr');
    });

    it('the choice lasts for the visit (sessionStorage)', async () => {
        const el = mount(spec());
        await settle();
        await choose(el, 'fr');
        expect(window.sessionStorage.getItem('final-lang:inline')).toBe('fr');
        document.body.removeChild(el);

        const again = mount(spec());
        await settle();
        expect(deepText(again.shadowRoot)).toContain('Votre nom');
        expect(selectOf(again).value).toBe('fr');
    });

    it('still works when storage is blocked', async () => {
        const set = jest
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('blocked');
            });
        const el = mount(spec());
        await settle();
        await choose(el, 'fr');
        expect(deepText(el.shadowRoot)).toContain('Votre nom');
        set.mockRestore();
    });

    it('sits on the form side of a split hero, not over the picture', async () => {
        const el = mount(
            spec({
                layout: { type: 'splitHero', options: {} },
                header: { style: 'standard', title: 'Welcome' }
            })
        );
        await settle();
        const menu = menuOf(el);
        expect(menu).not.toBeNull();
        expect(menu.parentElement.getAttribute('slot')).toBe('corner');
    });
});
