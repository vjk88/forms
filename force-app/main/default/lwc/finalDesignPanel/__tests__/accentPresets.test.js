import { createElement } from 'lwc';
import FinalDesignPanel from 'c/finalDesignPanel';
import { buildSampleSpec } from 'c/finalSampleSpec';
import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';
import BEFORE from '../../finalThemeCatalog/__tests__/__fixtures__/tokensBeforeCatalogCut.json';
import { withoutFocus } from '../../finalThemeEngine/__tests__/focusContract';

// Accent presets + hidden-theme label (IMPL_PLAN_THEME_CATALOG_CUT P1, P5).

jest.mock(
    '@salesforce/apex/FinalFontController.listFonts',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.listCustomThemes',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({ default: jest.fn(() => Promise.resolve('{}')) }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(themeKey, overrides) {
    const el = createElement('c-final-design-panel', {
        is: FinalDesignPanel
    });
    const spec = buildSampleSpec({ layout: 'stepper', themeKey });
    if (overrides) {
        spec.theme.overrides = overrides;
    }
    el.spec = spec;
    document.body.appendChild(el);
    return el;
}

const openTab = (el, key) =>
    el.shadowRoot
        .querySelector('c-final-studio-rail')
        .dispatchEvent(new CustomEvent('select', { detail: { key } }));
const lastSpec = (h) => h.mock.calls[h.mock.calls.length - 1][0].detail.spec;
const accentControl = (el) =>
    el.shadowRoot.querySelector('c-final-color-control[data-key="accent"]');
const pick = (el, value) =>
    accentControl(el).dispatchEvent(
        new CustomEvent('presetpick', { detail: { value } })
    );

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('accent presets in the Design panel', () => {
    it('the Accent control gets the 15 presets and the card colour it sits on', () => {
        const el = mount('dracula');
        const c = accentControl(el);
        expect(c.presets).toHaveLength(15);
        expect(c.presetBackground).toBe('#282a36');
    });

    it('a frosted card is judged as painted over its page', () => {
        const el = mount('oceanBreeze');
        // rgba(255,255,255,0.72) over #7ec8d8, not the raw rgba token
        expect(accentControl(el).presetBackground).toMatch(/^#[0-9a-f]{6}$/);
        expect(accentControl(el).presetBackground).not.toBe('#ffffff');
    });

    it('one pick = one spec change (one undo step)', async () => {
        const el = mount('mintStepper');
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        pick(el, '#6ee7b7');
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(lastSpec(handler).theme.overrides.palette).toEqual({
            accent: '#6ee7b7',
            inkMode: 'contrast'
        });
    });

    it('a gallery theme already carries the flag, so a pick writes only the accent', async () => {
        const el = mount('nordic');
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        pick(el, '#3b82f6');
        await flush();
        expect(lastSpec(handler).theme.overrides.palette).toEqual({
            accent: '#3b82f6'
        });
    });

    it('never touches inks or button colours the author set', async () => {
        const mine = {
            palette: {
                submitText: '#ffffff',
                onAccent: '#ffffff',
                submitBg: '#000000'
            }
        };
        const el = mount('mintStepper', mine);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        pick(el, '#fbbf24');
        await flush();
        const pal = lastSpec(handler).theme.overrides.palette;
        expect(pal.submitText).toBe('#ffffff');
        expect(pal.onAccent).toBe('#ffffff');
        expect(pal.submitBg).toBe('#000000');
    });

    it('preset → custom colour keeps readable ink; picking the theme colour again restores the start', async () => {
        const el = mount('mintStepper');
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        pick(el, '#6ee7b7');
        await flush();
        accentControl(el).dispatchEvent(
            new CustomEvent('change', { detail: { value: '#123456' } })
        );
        await flush();
        expect(lastSpec(handler).theme.overrides.palette).toEqual({
            accent: '#123456',
            inkMode: 'contrast'
        });
        const themeAccent = getBuiltinTheme('mintStepper').palette.accent;
        accentControl(el).dispatchEvent(
            new CustomEvent('change', { detail: { value: themeAccent } })
        );
        await flush();
        const overrides = lastSpec(handler).theme.overrides;
        expect((overrides.palette || {}).inkMode).toBeUndefined();
        expect(
            withoutFocus(
                resolveTokens(getBuiltinTheme('mintStepper'), overrides)
            )
        ).toEqual(withoutFocus(BEFORE.hidden.mintStepper));
    });

    it('"Reset to theme" on Palette removes the preset and its ink flag', async () => {
        const el = mount('mintStepper');
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        pick(el, '#6ee7b7');
        await flush();
        el.shadowRoot.querySelectorAll('.lens-btn')[1].click();
        await flush();
        openTab(el, 'brand');
        await flush();
        el.shadowRoot.querySelector('.resetchip').click();
        await flush();
        const overrides = lastSpec(handler).theme.overrides;
        expect((overrides.palette || {}).inkMode).toBeUndefined();
        expect(
            withoutFocus(
                resolveTokens(getBuiltinTheme('mintStepper'), overrides)
            )
        ).toEqual(withoutFocus(BEFORE.hidden.mintStepper));
    });
});

// The Colors rail tab carries the accent too (it took over the old toolbar
// strip's Colors menu, IMPL_PLAN_DESIGN_RAIL): same presets, same writes.
describe('Colors tab presets', () => {
    async function colorsTab(themeKey) {
        const el = mount(themeKey);
        el.shadowRoot.querySelectorAll('.lens-btn')[1].click();
        await flush();
        openTab(el, 'colors');
        await flush();
        return el;
    }
    const colorsAccent = (el) =>
        el.shadowRoot.querySelector(
            '.colors-tab c-final-color-control[data-key="accent"]'
        );

    it('a Colors-tab pick is one spec change with accent + ink flag', async () => {
        const el = await colorsTab('mintStepper');
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        colorsAccent(el).dispatchEvent(
            new CustomEvent('presetpick', { detail: { value: '#6ee7b7' } })
        );
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(lastSpec(handler).theme.overrides.palette).toEqual({
            accent: '#6ee7b7',
            inkMode: 'contrast'
        });
    });

    it('offers the same presets and card colour as Brand › Colors', async () => {
        const el = await colorsTab('mintStepper');
        const inColors = colorsAccent(el);
        openTab(el, 'brand');
        await flush();
        const inBrand = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        expect(inColors.presets).toEqual(inBrand.presets);
        expect(inColors.presets.length).toBeGreaterThan(0);
        expect(inColors.presetBackground).toBe(inBrand.presetBackground);
    });

    it('the Colors-tab reset on Accent also drops the ink flag', async () => {
        const el = await colorsTab('mintStepper');
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        colorsAccent(el).dispatchEvent(
            new CustomEvent('presetpick', { detail: { value: '#6ee7b7' } })
        );
        await flush();
        el.shadowRoot.querySelector('.color-reset[data-key="accent"]').click();
        await flush();
        const overrides = lastSpec(handler).theme.overrides;
        expect(
            withoutFocus(
                resolveTokens(getBuiltinTheme('mintStepper'), overrides)
            )
        ).toEqual(withoutFocus(BEFORE.hidden.mintStepper));
    });
});

describe('a form on a hidden theme', () => {
    it('names its theme with "no longer in the gallery"', () => {
        const el = mount('mintStepper');
        expect(
            el.shadowRoot.querySelectorAll('.entry-name')[0].textContent
        ).toBe('Neo-Mint Stepper · no longer in the gallery');
    });
});
