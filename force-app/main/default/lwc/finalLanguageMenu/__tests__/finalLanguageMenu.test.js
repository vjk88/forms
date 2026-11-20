import { createElement } from 'lwc';
import FinalLanguageMenu, { languageName } from 'c/finalLanguageMenu';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(props) {
    const el = createElement('c-final-language-menu', {
        is: FinalLanguageMenu
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    await flush();
    return el;
}

describe('c-final-language-menu', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('names each language in its own language, capitalised', () => {
        expect(languageName('fr')).toBe('Français');
        expect(languageName('de')).toBe('Deutsch');
        expect(languageName('en_US')).toBe('English');
        expect(languageName('en_US', true)).toBe('American English');
        expect(languageName('zz9')).toBe('zz9');
    });

    it('is a labelled native select with the current language chosen', async () => {
        const el = await mount({
            languages: ['en_US', 'fr', 'de'],
            value: 'fr'
        });
        const select = el.shadowRoot.querySelector('select');
        expect(select).not.toBeNull();
        expect(select.getAttribute('aria-label')).toBe('Language');
        const opts = [...select.querySelectorAll('option')];
        expect(opts.map((o) => o.textContent.trim())).toEqual([
            'English',
            'Français',
            'Deutsch'
        ]);
        expect(select.value).toBe('fr');
    });

    it('tells two regional variants of one language apart', async () => {
        const el = await mount({
            languages: ['en_US', 'en_GB', 'fr'],
            value: 'en_US'
        });
        const names = [...el.shadowRoot.querySelectorAll('option')].map((o) =>
            o.textContent.trim()
        );
        expect(names).toEqual([
            'American English',
            'British English',
            'Français'
        ]);
    });

    it('emits languagechange with the chosen code', async () => {
        const el = await mount({ languages: ['en_US', 'fr'], value: 'en_US' });
        const handler = jest.fn();
        el.addEventListener('languagechange', handler);
        const select = el.shadowRoot.querySelector('select');
        select.value = 'fr';
        select.dispatchEvent(new Event('change'));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.language).toBe('fr');
    });
});
