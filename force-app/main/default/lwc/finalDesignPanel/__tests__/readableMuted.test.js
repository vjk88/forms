import { createElement } from 'lwc';
import FinalDesignPanel from 'c/finalDesignPanel';
import { buildSampleSpec } from 'c/finalSampleSpec';
import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';

// IMPL_PLAN_TEXT_CONTRAST PR A (PR 408 review S1): the Muted text swatch shows
// the colour the form paints, not the theme's original, and its contrast badge
// judges that colour. An author's own pick shows as picked.

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

async function mount(themeKey, overrides) {
    const el = createElement('c-final-design-panel', { is: FinalDesignPanel });
    const spec = buildSampleSpec({ layout: 'stepper', themeKey });
    if (overrides) {
        spec.theme.overrides = overrides;
    }
    el.spec = spec;
    document.body.appendChild(el);
    // Muted text lives in Advanced (Colors); open it as the search does
    el.revealControl('textWeak');
    await flush();
    return el;
}

const muted = (el) =>
    el.shadowRoot.querySelector('c-final-color-control[data-key="textWeak"]');
// the hint line rendered right after the colour control
const hintOf = (el) => {
    const next = muted(el).nextElementSibling;
    return next && next.classList.contains('ctl-hint') ? next.textContent : '';
};

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('Design panel: Muted text shows what the form paints', () => {
    it('Dracula shows its readable muted colour, not the original #6272a4', async () => {
        const el = await mount('dracula');
        const painted = resolveTokens(getBuiltinTheme('dracula'), null)[
            '--c-text-weak'
        ];
        expect(painted).not.toBe('#6272a4');
        expect(muted(el).value).toBe(painted);
        expect(hintOf(el)).toContain('Adjusted from this theme');
    });

    it("an author's own muted colour shows as picked, without the note", async () => {
        const el = await mount('dracula', { palette: { textWeak: '#999999' } });
        expect(muted(el).value).toBe('#999999');
        expect(hintOf(el)).not.toContain('Adjusted from this theme');
    });

    it('a theme whose muted colour already reads shows it unchanged', async () => {
        const el = await mount('lavender');
        expect(muted(el).value).toBe(
            getBuiltinTheme('lavender').palette.textWeak
        );
        expect(hintOf(el)).not.toContain('Adjusted from this theme');
    });
});
