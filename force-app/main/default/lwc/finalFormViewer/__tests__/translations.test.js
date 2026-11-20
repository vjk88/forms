import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';

// Translations PR 2: author text is swapped from spec.translations before the
// viewer renders; answers and the spec the author owns are untouched.
jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalGuestController.runtimeLabels',
    () => ({ default: jest.fn(() => Promise.resolve({})) }),
    { virtual: true }
);

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
                        elements: [
                            {
                                id: 'el_name',
                                type: 'field',
                                label: 'Your name',
                                render: { inputType: 'text' }
                            },
                            {
                                id: 'el_ok',
                                type: 'field',
                                label: 'Agree?',
                                render: { inputType: 'picklist' },
                                config: {
                                    renderAs: 'Radio_Buttons',
                                    options: [
                                        { value: 'yes', label: 'Yes please' },
                                        { value: 'no', label: 'No thanks' }
                                    ]
                                }
                            }
                        ]
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
                        elements: [
                            {
                                id: 'el_note',
                                type: 'field',
                                label: 'Note',
                                render: { inputType: 'text' }
                            }
                        ]
                    }
                ]
            }
        ],
        ...extra
    };
}

const LANGUAGES = {
    languages: { default: 'en_US', available: ['en_US', 'fr'] },
    translations: {
        fr: {
            'el:el_name.label': 'Votre nom',
            'el:el_ok.opt:yes': 'Oui merci',
            'el:el_ok.opt:no': 'Non merci',
            'submit.label': 'Envoyer',
            'submit.nextLabel': 'Continuer',
            'page:pg_1.name': 'A propos de vous'
        }
    }
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function deepText(root) {
    let text = root.textContent || '';
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            text += ' ' + deepText(el.shadowRoot);
        }
        if (el.label) {
            text += ' ' + el.label;
        }
        if (Array.isArray(el.options)) {
            text += ' ' + el.options.map((o) => o.label).join(' ');
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

/** Dynamic (lwc:is) layouts mount as <x-test>; find the nav by its options. */
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

function mount(value) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = value;
    el.delegateSubmit = true;
    document.body.appendChild(el);
    return el;
}

async function settle() {
    await flush();
    await flush();
    await flush();
}

describe('c-final-form-viewer translations', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        window.history.replaceState({}, '', '/');
        jest.clearAllMocks();
    });

    it('?lang=fr swaps a label, an option, the next label and a page name', async () => {
        window.history.replaceState({}, '', '/?lang=fr');
        const el = mount(spec(LANGUAGES));
        await settle();

        const text = deepText(el.shadowRoot);
        expect(text).toContain('Votre nom');
        expect(text).toContain('Oui merci');
        expect(text).toContain('Continuer');
        expect(text).toContain('A propos de vous');
        expect(text).not.toContain('Your name');
        expect(text).not.toContain('Yes please');
        // a text with no translation keeps its default, never blank
        expect(text).toContain('Extras');
    });

    it('the split pane copies the TRANSLATED header title', async () => {
        window.history.replaceState({}, '', '/?lang=fr');
        const el = mount(
            spec({
                ...LANGUAGES,
                layout: { type: 'splitHero', options: {} },
                header: { style: 'standard', title: 'Welcome aboard' },
                translations: { fr: { 'header.title': 'Bienvenue a bord' } }
            })
        );
        await settle();

        const nav = findNav(el.shadowRoot);
        expect(nav).not.toBeNull();
        expect(nav.options.paneTitle).toBe('Bienvenue a bord');
    });

    it('does not change the spec it was given', async () => {
        window.history.replaceState({}, '', '/?lang=fr');
        const given = spec(LANGUAGES);
        const before = JSON.stringify(given);
        mount(given);
        await settle();
        expect(JSON.stringify(given)).toBe(before);
    });

    it('with no languages block nothing changes, even with ?lang=fr', async () => {
        window.history.replaceState({}, '', '/?lang=fr');
        const el = mount(spec());
        await settle();

        const text = deepText(el.shadowRoot);
        expect(text).toContain('Your name');
        expect(text).toContain('Yes please');
        expect(text).toContain('Go on');
    });

    it('in the Studio, a French browser does not flip the preview; ?lang= still does', async () => {
        const langs = jest
            .spyOn(window.navigator, 'languages', 'get')
            .mockReturnValue(['fr-FR', 'fr']);
        const el = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        el.authoring = true;
        el.spec = spec(LANGUAGES);
        el.delegateSubmit = true;
        document.body.appendChild(el);
        await settle();
        expect(deepText(el.shadowRoot)).toContain('Your name');

        window.history.replaceState({}, '', '/?lang=fr');
        const asked = createElement('c-final-form-viewer', {
            is: FinalFormViewer
        });
        asked.authoring = true;
        asked.spec = spec(LANGUAGES);
        asked.delegateSubmit = true;
        document.body.appendChild(asked);
        await settle();
        expect(deepText(asked.shadowRoot)).toContain('Votre nom');
        langs.mockRestore();
    });

    it("a signed-in user's own language (English here) beats a French browser", async () => {
        // jest runs as a signed-in en-US user; the guest/browser order is
        // covered by the pickLanguage unit tests
        const langs = jest
            .spyOn(window.navigator, 'languages', 'get')
            .mockReturnValue(['fr-FR', 'fr']);
        const el = mount(spec(LANGUAGES));
        await settle();
        expect(deepText(el.shadowRoot)).toContain('Your name');
        langs.mockRestore();
    });

    it('stays in the form default when the link asks for an unoffered language', async () => {
        window.history.replaceState({}, '', '/?lang=ja');
        const el = mount(spec(LANGUAGES));
        await settle();
        expect(deepText(el.shadowRoot)).toContain('Your name');
    });

    it('sends the chosen language as meta.lang, answers still by value', async () => {
        window.history.replaceState({}, '', '/?lang=fr');
        const el = mount(spec(LANGUAGES));
        const handler = jest.fn();
        el.addEventListener('submitrequest', handler);
        await settle();

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();

        expect(handler).toHaveBeenCalledTimes(1);
        const payload = handler.mock.calls[0][0].detail.payload;
        expect(payload.meta.lang).toBe('fr');
    });

    it('sends no meta.lang when no language was chosen', async () => {
        const el = mount(spec());
        const handler = jest.fn();
        el.addEventListener('submitrequest', handler);
        await settle();

        deepQuery(el.shadowRoot, 'c-final-submit-bar').dispatchEvent(
            new CustomEvent('submit')
        );
        await flush();

        expect(handler.mock.calls[0][0].detail.payload.meta.lang).toBe(
            undefined
        );
    });
});
