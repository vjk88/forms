import { createElement } from 'lwc';
import FinalDesignPanel from 'c/finalDesignPanel';
import { buildSampleSpec } from 'c/finalSampleSpec';
import { flattenControls } from 'c/finalDesignRegistry';

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

/**
 * Design > Header > Text fade (IMPL_PLAN_HEADER_FADE): On/Off tiles. Off
 * saves the boolean false, On removes the key; a Hidden header hides it,
 * except where the layout's pane is the header (Split).
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(formSpec) {
    const el = createElement('c-final-design-panel', {
        is: FinalDesignPanel
    });
    el.spec = formSpec;
    document.body.appendChild(el);
    return el;
}

async function openHeader(el) {
    el.shadowRoot.querySelectorAll('.lens-btn')[1].click();
    await flush();
    el.shadowRoot
        .querySelector('c-final-studio-rail')
        .dispatchEvent(new CustomEvent('select', { detail: { key: 'brand' } }));
    await flush();
}

// the pane's "Find a design setting" gets the same availability
const searchEntries = (el) =>
    el.shadowRoot.querySelector('c-final-design-search').entries;

const tile = (el, value) =>
    el.shadowRoot.querySelector(
        `button[data-key="textFade"][data-value="${value}"]`
    );
const lastSpec = (handler) =>
    handler.mock.calls[handler.mock.calls.length - 1][0].detail.spec;

function spec(layout, header) {
    const s = buildSampleSpec({ layout, themeKey: 'nordic' });
    s.header = { ...(s.header || {}), ...header };
    return s;
}

describe('Design panel: Text fade', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('is a registered tiles control in the header group', () => {
        const entry = flattenControls().find(
            (e) => e.control.key === 'textFade'
        );
        expect(entry.area).toBe('header');
        const control = entry.control;
        expect(control.type).toBe('tiles');
        expect(control.path).toBe('header.textFade');
    });

    it('starts On; Off saves false; On removes the key', async () => {
        const el = mount(spec('stepper', {}));
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await openHeader(el);
        expect(tile(el, 'on').className).toBe('as-tile on');
        expect(tile(el, 'off').className).toBe('as-tile');

        tile(el, 'off').click();
        await flush();
        expect(lastSpec(handler).header.textFade).toBe(false);
        expect(tile(el, 'off').className).toBe('as-tile on');

        tile(el, 'on').click();
        await flush();
        expect('textFade' in lastSpec(handler).header).toBe(false);
        expect(tile(el, 'on').className).toBe('as-tile on');
    });

    it('a saved Off survives a save and reload (JSON round trip)', async () => {
        const saved = JSON.parse(
            JSON.stringify(spec('stepper', { textFade: false }))
        );
        const el = mount(saved);
        await openHeader(el);
        expect(tile(el, 'off').className).toBe('as-tile on');
        expect(tile(el, 'on').className).toBe('as-tile');
    });

    it('a Hidden header hides it, in the panel and in search', async () => {
        const el = mount(spec('stepper', { style: 'none' }));
        await openHeader(el);
        expect(tile(el, 'on')).toBeNull();
        const entry = searchEntries(el).find((e) => e.key === 'textFade');
        expect(entry.available).toBe(false);
    });

    it('on Split a Hidden header left from another layout does not hide it', async () => {
        const el = mount(spec('splitHero', { style: 'none' }));
        await openHeader(el);
        expect(tile(el, 'on')).not.toBeNull();
        const entry = searchEntries(el).find((e) => e.key === 'textFade');
        expect(entry.available).toBe(true);
    });

    it('conditions without the flag still apply on Split', async () => {
        // Highlight position needs a highlight text on Split: unflagged, so an
        // empty highlight still hides it there
        const el = mount(spec('splitHero', { highlight: { text: '' } }));
        await openHeader(el);
        const entry = searchEntries(el).find(
            (e) => e.key === 'highlightPlacement'
        );
        expect(entry.available).toBe(false);
    });
});
