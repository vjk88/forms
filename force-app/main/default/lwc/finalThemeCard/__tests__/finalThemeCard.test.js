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

describe('c-final-theme-card: picture mode', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('is not a control: no button role, no tab stop, no check, no select', async () => {
        const el = mount({
            themeKey: 'nordic',
            label: 'Preview',
            selected: true,
            picture: true
        });
        const handler = jest.fn();
        el.addEventListener('select', handler);
        await flush();
        const root = el.shadowRoot.querySelector('.tc');
        expect(root.getAttribute('role')).toBe('img');
        expect(root.hasAttribute('tabindex')).toBe(false);
        expect(root.hasAttribute('aria-pressed')).toBe(false);
        expect(el.shadowRoot.querySelector('.tc-check')).toBeNull();
        root.click();
        expect(handler).not.toHaveBeenCalled();
    });

    it('a custom recipe uses the neutral sample copy, not its base theme’s', async () => {
        const el = mount({
            themeKey: 'nordic',
            label: 'Acme',
            themeProps: { palette: { accent: '#e11d48' } }
        });
        await flush();
        expect(el.shadowRoot.textContent).toContain('Registration');
    });
});

describe('c-final-theme-card: accent sample (brand dialog)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it.each(['scroll', 'splitHero', 'accordion'])(
        '%s: a chosen answer only when asked for',
        async (layout) => {
            const plain = mount({ themeKey: 'nordic', label: 'A', layout });
            const sampled = mount({
                themeKey: 'nordic',
                label: 'B',
                layout,
                accentSample: true
            });
            await flush();
            expect(plain.shadowRoot.querySelector('.tc-choice')).toBeNull();
            expect(
                sampled.shadowRoot.querySelector('.tc-choice .tc-radio')
            ).not.toBeNull();
        }
    );
});

describe('c-final-theme-card: colour dots', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a two-colour brand leads with its button (main) colour', async () => {
        const palette = { submitBg: '#e11d48', accent: '#1e3a8a' };
        const two = mount({
            label: 'Two',
            themeProps: {
                palette,
                brand: { color: '#e11d48', secondColor: '#1e3a8a' }
            }
        });
        const one = mount({
            label: 'One',
            themeProps: { palette, brand: { color: '#e11d48' } }
        });
        await flush();
        const dots = (el) =>
            [...el.shadowRoot.querySelectorAll('.tc-swatch')].map(
                (d) => d.title
            );
        expect(dots(two)[0]).toBe('Button');
        expect(dots(one)[0]).toBe('Accent');
    });
});

// IMPL_PLAN_THEME_FAMILIES step 4: the preview draws the theme's header
// surface (photo + veil, gradient, colour) in EVERY layout it can preview.
describe('c-final-theme-card: header surface in every layout', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const LAYOUTS = [
        ['scroll', '', '.tc-banner'],
        ['stepper', '', '.tc-banner'],
        ['tabs', '', '.tc-banner'],
        ['accordion', '', '.tc-banner'],
        ['rail', '', '.tc-banner'],
        ['oneAtATime', '', '.tc-banner.tc-strip'],
        ['splitHero', '', '.tc-rail'],
        ['splitHero', 'oneAtATime', '.tc-rail']
    ];

    it.each(LAYOUTS)(
        '%s %s: a photo-header theme draws its header surface with the photo token',
        async (layout, paneFlow, sel) => {
            const el = mount({
                themeKey: 'marbleSplit',
                label: 'Quiet Studio',
                layout,
                paneFlow
            });
            await flush();
            expect(el.shadowRoot.querySelector(sel)).not.toBeNull();
            const style = el.shadowRoot
                .querySelector('.tc-preview')
                .getAttribute('style');
            expect(style).toContain('--c-header-bg-image');
            expect(style).toContain('marble.jpg');
        }
    );

    it.each(['scroll', 'stepper', 'tabs', 'accordion', 'rail', 'oneAtATime'])(
        '%s: a gradient-header theme draws a banner carrying its gradient',
        async (layout) => {
            const el = mount({ themeKey: 'auraSplit', label: 'B', layout });
            await flush();
            expect(el.shadowRoot.querySelector('.tc-banner')).not.toBeNull();
            expect(
                el.shadowRoot.querySelector('.tc-preview').getAttribute('style')
            ).toMatch(/--c-header-bg-gradient:\s*linear-gradient/);
        }
    );

    it.each(['scroll', 'stepper', 'tabs', 'accordion', 'rail', 'oneAtATime'])(
        '%s: a theme with no header surface keeps the plain title',
        async (layout) => {
            const el = mount({ themeKey: 'nordic', label: 'N', layout });
            await flush();
            expect(el.shadowRoot.querySelector('.tc-banner')).toBeNull();
        }
    );
});
