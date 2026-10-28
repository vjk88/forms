import { createElement } from 'lwc';
import FinalThemeGallery from 'c/finalThemeGallery';

// IMPL_PLAN_THEME_FAMILIES step 5: one card per family; a dot changes only
// the preview, activating the card picks the variant it shows.

jest.mock(
    '@salesforce/resourceUrl/formThemeAssets',
    () => ({ default: '/resource/1/formThemeAssets' }),
    { virtual: true }
);
jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1/formFonts' }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

async function mount(props = {}) {
    const el = createElement('c-final-theme-gallery', {
        is: FinalThemeGallery
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    await flush();
    return el;
}
const fam = (el, key) =>
    el.shadowRoot.querySelector(`.fam[data-family="${key}"]`);
const card = (el, key) => fam(el, key).querySelector('c-final-theme-card');
const dots = (el, key) => [...fam(el, key).querySelectorAll('.fam-dot')];

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-theme-gallery: families', () => {
    it('one card per family, heads first', async () => {
        const el = await mount();
        const keys = [...el.shadowRoot.querySelectorAll('.fam')].map(
            (f) => f.dataset.family
        );
        expect(keys).toEqual([
            'clean',
            'editorial',
            'dark',
            'photoHeader',
            'scenic',
            'darkGlass',
            'terminal',
            'neonNights',
            'neoBrutalism'
        ]);
        expect(card(el, 'scenic').themeKey).toBe('oceanBreeze');
        expect(card(el, 'scenic').label).toBe('Ocean Breeze');
    });

    it('a family with one look has no dots', async () => {
        const el = await mount();
        expect(dots(el, 'neonNights')).toHaveLength(0);
        expect(dots(el, 'scenic')).toHaveLength(5);
    });

    it('a dot changes ONLY the preview: no themeselect', async () => {
        const el = await mount();
        const handler = jest.fn();
        el.addEventListener('themeselect', handler);
        dots(el, 'scenic')[1].click();
        await flush();
        expect(card(el, 'scenic').themeKey).toBe('desertOasis');
        expect(card(el, 'scenic').label).toBe('Misty Pines');
        expect(dots(el, 'scenic')[1].getAttribute('aria-checked')).toBe('true');
        // the card title already names the look: no separate "Showing" line
        expect(fam(el, 'scenic').querySelector('.fam-showing')).toBeNull();
        expect(handler).not.toHaveBeenCalled();
    });

    it('arrow keys move through the dots (one tab stop), still without picking', async () => {
        const el = await mount();
        const handler = jest.fn();
        el.addEventListener('themeselect', handler);
        let d = dots(el, 'darkGlass');
        expect(d.map((x) => x.getAttribute('tabindex'))).toEqual([
            '0',
            '-1',
            '-1',
            '-1'
        ]);
        d[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        await flush();
        expect(card(el, 'darkGlass').themeKey).toBe('cosmicVortex');
        d = dots(el, 'darkGlass');
        d[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
        await flush();
        expect(card(el, 'darkGlass').themeKey).toBe('auraSplit');
        d = dots(el, 'darkGlass');
        d[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        await flush();
        expect(card(el, 'darkGlass').themeKey).toBe('carbonMatrix');
        expect(
            dots(el, 'darkGlass').map((x) => x.getAttribute('tabindex'))
        ).toEqual(['0', '-1', '-1', '-1']);
        expect(handler).not.toHaveBeenCalled();
    });

    it('activating the card picks the variant it shows, once', async () => {
        const el = await mount();
        const handler = jest.fn();
        el.addEventListener('themeselect', handler);
        dots(el, 'clean')[2].click();
        await flush();
        card(el, 'clean').dispatchEvent(
            new CustomEvent('select', { detail: { themeKey: 'terracotta' } })
        );
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            themeKey: 'terracotta'
        });
    });

    it("opens on the form's current variant, and marks it chosen", async () => {
        const el = await mount({ selectedThemeKey: 'silkLuxury' });
        expect(card(el, 'scenic').themeKey).toBe('silkLuxury');
        expect(card(el, 'scenic').selected).toBe(true);
        expect(card(el, 'clean').selected).toBe(false);
    });

    it('"Preview in" keeps the shown variant and changes only the shape', async () => {
        const el = await mount();
        dots(el, 'photoHeader')[3].click();
        await flush();
        const chips = [...el.shadowRoot.querySelectorAll('.lchip')];
        for (const chip of chips) {
            chip.click();
            // eslint-disable-next-line no-await-in-loop
            await flush();
            const [layout, paneFlow] = chip.dataset.value.split(':');
            expect(card(el, 'photoHeader').themeKey).toBe('cyberSplit');
            expect(card(el, 'photoHeader').layout).toBe(layout);
            expect(card(el, 'photoHeader').paneFlow || '').toBe(paneFlow || '');
        }
    });

    it('a photo theme’s dot shows its photo; others show page colour and accent', async () => {
        const el = await mount();
        const style = (key, i) =>
            dots(el, key)[i].querySelector('.fam-chip').getAttribute('style');
        expect(style('scenic', 0)).toContain('ocean.jpg');
        expect(style('clean', 0)).toContain('linear-gradient');
    });
});

describe('c-final-theme-gallery: review follow-ups (PR 406)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a family with several looks hides the card squares; a single look keeps them', async () => {
        const el = await mount();
        expect(card(el, 'scenic').hideSwatches).toBe(true);
        expect(card(el, 'neonNights').hideSwatches).toBe(false);
    });

    it("marks the form's current look on its dot, and says so after a dot moves away", async () => {
        const el = await mount({ selectedThemeKey: 'sandstone' });
        let d = dots(el, 'editorial');
        expect(d[1].classList.contains('is-current')).toBe(true);
        expect(d[1].getAttribute('aria-label')).toBe(
            'Sandstone & Copper, your current theme'
        );
        expect(fam(el, 'editorial').querySelector('.fam-yours')).toBeNull();
        d[0].click();
        await flush();
        d = dots(el, 'editorial');
        expect(d[1].classList.contains('is-current')).toBe(true);
        expect(card(el, 'editorial').selected).toBe(false);
        expect(
            fam(el, 'editorial').querySelector('.fam-yours').textContent
        ).toBe('Yours: Sandstone & Copper');
    });

    it('says once how dots and previews differ', async () => {
        const el = await mount();
        expect(el.shadowRoot.querySelector('.gal-hint').textContent).toContain(
            'Dots show each look. Click a preview to use it.'
        );
    });
});

// IMPL_PLAN_SPLIT_DEFAULTS_AND_PREVIEW §3
describe('c-final-theme-gallery: previews follow the form', () => {
    it('no form (new-form gallery): a new Split form starts carded and Wide', async () => {
        const el = await mount({ layout: 'splitHero' });
        expect(card(el, 'scenic').fullBleed).toBe(false);
        expect(card(el, 'scenic').maxWidth).toBe('wide');
    });

    it('the form’s own settings for its layout', async () => {
        const el = await mount({
            layout: 'splitHero',
            formLayout: { type: 'splitHero', options: {}, maxWidth: 'medium' }
        });
        expect(card(el, 'scenic').fullBleed).toBeUndefined();
        expect(card(el, 'scenic').maxWidth).toBe('medium');
    });

    it('"Preview in" another layout draws what a switch would give', async () => {
        const el = await mount({
            layout: 'scroll',
            formLayout: { type: 'scroll', options: {}, maxWidth: 'medium' }
        });
        el.shadowRoot.querySelector('.lchip[data-value="splitHero"]').click();
        await flush();
        expect(card(el, 'scenic').fullBleed).toBe(false);
        expect(card(el, 'scenic').maxWidth).toBe('wide');
    });
});
