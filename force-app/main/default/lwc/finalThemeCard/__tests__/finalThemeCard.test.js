import { createElement } from 'lwc';
import FinalThemeCard from 'c/finalThemeCard';

jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1/formFonts' }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props) {
    const el = createElement('c-final-theme-card', { is: FinalThemeCard });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

describe('c-final-theme-card', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        document.head
            .querySelectorAll('style[id^="final-font"]')
            .forEach((s) => s.remove());
    });

    it('a built-in key paints that theme', async () => {
        const el = mount({ themeKey: 'nordic', label: 'Nordic' });
        await flush();
        const root = el.shadowRoot.querySelector('.tc-preview');
        expect(root.getAttribute('style')).toContain('--c-accent: #1e3a8a');
    });

    it('a custom recipe wins over the key and its fonts load (DEFERRED 42)', async () => {
        const el = mount({
            themeKey: 'nordic',
            label: 'Acme brand',
            themeProps: {
                palette: { accent: '#e11d48' },
                fonts: { pairing: 'editorialSerif' }
            }
        });
        await flush();
        const style = el.shadowRoot
            .querySelector('.tc-preview')
            .getAttribute('style');
        expect(style).toContain('--c-accent: #e11d48');
        expect(style).toContain('FormsBundledPlayfairDisplay');
        expect(
            document.getElementById('final-fontb-bundled-playfairdisplay')
        ).not.toBeNull();
        expect(
            document.getElementById('final-fontb-bundled-lora')
        ).not.toBeNull();
    });
});
