import { createElement } from 'lwc';
import FinalDesignPanel from 'c/finalDesignPanel';
import { buildSampleSpec } from 'c/finalSampleSpec';
import listFonts from '@salesforce/apex/FinalFontController.listFonts';

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
    () => ({
        default: jest.fn(() =>
            Promise.resolve('{"palette":{"accent":"#7c2d9c"}}')
        )
    }),
    { virtual: true }
);
import listCustomThemes from '@salesforce/apex/FinalThemeController.listCustomThemes';

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(spec) {
    const el = createElement('c-final-design-panel', {
        is: FinalDesignPanel
    });
    el.spec =
        spec || buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' });
    document.body.appendChild(el);
    return el;
}

function lastSpec(handler) {
    return handler.mock.calls[handler.mock.calls.length - 1][0].detail.spec;
}

async function goAdvanced(el) {
    el.shadowRoot.querySelectorAll('.lens-btn')[1].click();
    await flush();
}

async function openArea(el, key) {
    el.shadowRoot.querySelector(`.rail-btn[data-area="${key}"]`).click();
    await flush();
}

async function openGallery(el, which) {
    el.shadowRoot
        .querySelector(`.entry-change[data-gallery="${which}"]`)
        .click();
    await flush();
    return el.shadowRoot.querySelector('c-final-gallery-picker');
}

async function pickTheme(el, value) {
    const gallery = await openGallery(el, 'theme');
    gallery.dispatchEvent(new CustomEvent('themepick', { detail: { value } }));
    await flush();
}

async function pickLayout(el, layout, paneFlow) {
    const gallery = await openGallery(el, 'layout');
    gallery.dispatchEvent(
        new CustomEvent('layoutpick', {
            detail: { layout, paneFlow: paneFlow || '' }
        })
    );
    await flush();
}

describe('c-final-design-panel', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('starts in Simple: no rail, essentials only', () => {
        const el = mount();
        expect(el.shadowRoot.querySelector('.rail')).toBeNull();
        expect(el.shadowRoot.querySelector('.s-card')).not.toBeNull();
    });

    it('Advanced shows the 9-area rail', async () => {
        const el = mount();
        await goAdvanced(el);
        const areas = [...el.shadowRoot.querySelectorAll('.rail-btn')].map(
            (b) => b.dataset.area
        );
        expect(areas).toEqual([
            'theme',
            'type',
            'backdrop',
            'layout',
            'paging',
            'header',
            'body',
            'fields',
            'actions'
        ]);
    });

    it('accent change writes a sparse override and emits specchange', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const accent = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        accent.dispatchEvent(
            new CustomEvent('change', { detail: { value: '#123456' } })
        );
        await flush();
        expect(lastSpec(handler).theme.overrides.palette.accent).toBe(
            '#123456'
        );
    });

    it('lens is not a fork: the same override reads back in Advanced with an edited dot + reset chip', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        await goAdvanced(el);
        const adv = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        expect(adv.value).toBe('#123456');
        expect(adv.edited).toBe(true);
        expect(el.shadowRoot.querySelector('.resetchip')).not.toBeNull();
        expect(el.shadowRoot.querySelector('.ovchip')).not.toBeNull();
    });

    it('setting a control back to the theme default deletes the override (no phantom dots)', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const accent = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        accent.dispatchEvent(
            new CustomEvent('change', { detail: { value: '#123456' } })
        );
        await flush();
        // nordic's own accent
        accent.dispatchEvent(
            new CustomEvent('change', { detail: { value: '#1e3a8a' } })
        );
        await flush();
        const theme = lastSpec(handler).theme;
        expect(theme.overrides.palette).toBeUndefined();
    });

    it('group reset clears only that group and emits', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        await goAdvanced(el);
        el.shadowRoot.querySelector('.resetchip').click();
        await flush();
        expect(lastSpec(handler).theme.overrides.palette).toBeUndefined();
    });

    it('theme row: name + Change… opens the gallery popup in theme mode', async () => {
        const el = mount();
        expect(
            el.shadowRoot.querySelectorAll('.entry-name')[0].textContent
        ).toBe('Nordic Minimalist');
        const gallery = await openGallery(el, 'theme');
        expect(gallery).not.toBeNull();
        expect(gallery.mode).toBe('theme');
        // theme cards preview in the CURRENT layout
        expect(gallery.layout).toBe('stepper');
        expect(gallery.themeValue).toBe('nordic');
    });

    it('theme switch with overrides opens the confirm gate; Keep preserves them', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        await pickTheme(el, 'editorialIvory');
        // the gallery closes; the pick parks in the confirm gate
        expect(
            el.shadowRoot.querySelector('c-final-gallery-picker')
        ).toBeNull();
        expect(el.shadowRoot.querySelector('.confirm')).not.toBeNull();
        el.shadowRoot.querySelector('.confirm-go').click();
        await flush();
        const spec = lastSpec(handler);
        expect(spec.theme.name).toBe('editorialIvory');
        expect(spec.theme.overrides.palette.accent).toBe('#123456');
    });

    it('theme switch: Use theme as-is clears the overrides', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        await pickTheme(el, 'editorialIvory');
        el.shadowRoot.querySelectorAll('.confirm-alt')[0].click();
        await flush();
        const spec = lastSpec(handler);
        expect(spec.theme.name).toBe('editorialIvory');
        expect(spec.theme.overrides).toEqual({});
    });

    it('clean theme switch needs no confirm and closes the gallery', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickTheme(el, 'editorialIvory');
        expect(el.shadowRoot.querySelector('.confirm')).toBeNull();
        expect(
            el.shadowRoot.querySelector('c-final-gallery-picker')
        ).toBeNull();
        expect(lastSpec(handler).theme.name).toBe('editorialIvory');
    });

    it('re-picking the current theme is a no-op', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickTheme(el, 'nordic');
        expect(handler).not.toHaveBeenCalled();
    });

    it('Simple shows the advanced-overrides chip for non-simple deviations', async () => {
        const el = mount();
        await goAdvanced(el);
        await openArea(el, 'body');
        const shadow = el.shadowRoot.querySelector('select[data-key="shadow"]');
        shadow.value = 'floating';
        shadow.dispatchEvent(new CustomEvent('change'));
        await flush();
        el.shadowRoot.querySelectorAll('.lens-btn')[0].click();
        await flush();
        const chip = el.shadowRoot.querySelector('.advchip');
        expect(chip).not.toBeNull();
        expect(chip.textContent).toContain('1');
    });

    it('paging: splitHero gets pane controls (incl. progress style)', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'splitHero', themeKey: 'nordic' })
        );
        await goAdvanced(el);
        await openArea(el, 'paging');
        expect(
            el.shadowRoot.querySelector('input[data-key="fullBleed"]')
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('select[data-key="heroProgress"]')
        ).not.toBeNull();
        expect(el.shadowRoot.querySelector('.narrate').textContent).toContain(
            'brand pane'
        );
    });

    it('paging: stepper gets real step controls, no stale narration', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' })
        );
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await goAdvanced(el);
        await openArea(el, 'paging');
        expect(el.shadowRoot.querySelector('.narrate')).toBeNull();
        expect(
            el.shadowRoot.querySelector('input[data-key="fullBleed"]')
        ).toBeNull();

        const mode = el.shadowRoot.querySelector(
            'select[data-key="stepperMode"]'
        );
        expect(mode).not.toBeNull();
        mode.value = 'dots';
        mode.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(lastSpec(handler).layout.options.mode).toBe('dots');

        // placement was removed (owner 2026-07-11: the strip is always on
        // top); Small screens picks the narrow collapse instead
        expect(
            el.shadowRoot.querySelector('select[data-key="stepperPlacement"]')
        ).toBeNull();
        const narrow = el.shadowRoot.querySelector(
            'select[data-key="stepperNarrow"]'
        );
        expect(narrow).not.toBeNull();
        narrow.value = 'progressBar';
        narrow.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(lastSpec(handler).layout.options.narrowMode).toBe('progressBar');
    });

    it('paging: tabs, rail, and oneAtATime each get their own group', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'tabs', themeKey: 'nordic' })
        );
        await goAdvanced(el);
        await openArea(el, 'paging');
        expect(
            el.shadowRoot.querySelector('select[data-key="tabStyle"]')
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('select[data-key="stepperMode"]')
        ).toBeNull();

        const el2 = mount(
            buildSampleSpec({ layout: 'rail', themeKey: 'nordic' })
        );
        await goAdvanced(el2);
        await openArea(el2, 'paging');
        const railContent = el2.shadowRoot.querySelector(
            'select[data-key="railContent"]'
        );
        expect(railContent).not.toBeNull();
        // 'Progress only' was cut (owner 2026-07-11): links, or links+progress
        expect(
            [...railContent.querySelectorAll('option')].map((o) => o.value)
        ).toEqual(['', 'both']);
        expect(
            el2.shadowRoot.querySelector('select[data-key="railNavigation"]')
        ).not.toBeNull();

        const el3 = mount(
            buildSampleSpec({ layout: 'oneAtATime', themeKey: 'nordic' })
        );
        await goAdvanced(el3);
        await openArea(el3, 'paging');
        expect(
            el3.shadowRoot.querySelector('input[data-key="advanceLabel"]')
        ).not.toBeNull();
        expect(
            el3.shadowRoot.querySelector('input[data-key="oaatProgress"]')
        ).not.toBeNull();
    });

    it('LOOK chips step radius + density (Simple drives the same registry values)', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot.querySelector('.chip[data-look="rounder"]').click();
        await flush();
        // nordic radius=soft → next step up is md
        expect(lastSpec(handler).theme.overrides.radius).toBe('md');
        el.shadowRoot.querySelector('.chip[data-look="dense"]').click();
        await flush();
        expect(lastSpec(handler).theme.overrides.density).toBe('compact');
    });

    it('custom font pick writes overrides.customFont; built-in pick clears it', async () => {
        listFonts.mockResolvedValueOnce([
            {
                key: 'Sample_Brand',
                family: 'Sample Brand',
                fallback: 'cursive',
                resource: 'sample_brand_font',
                regularPath: null,
                boldPath: null
            }
        ]);
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await flush();
        await goAdvanced(el);
        await openArea(el, 'type');
        const select = el.shadowRoot.querySelector(
            'select[data-key="typography"]'
        );
        expect(
            [...select.querySelectorAll('option')].map((o) => o.value)
        ).toContain('custom:Sample_Brand');
        select.value = 'custom:Sample_Brand';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        let theme = lastSpec(handler).theme;
        expect(theme.overrides.customFont.family).toBe('Sample Brand');
        expect(theme.overrides.customFont.resource).toBe('sample_brand_font');

        select.value = 'editorial';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        theme = lastSpec(handler).theme;
        expect(theme.overrides.customFont).toBeUndefined();
        expect(theme.overrides.typography).toBe('editorial');
    });

    it('custom themes flow into the gallery; picking one switches source + fetches props', async () => {
        listCustomThemes.mockResolvedValueOnce([
            { id: 'a0AXX0000001', name: 'Brand Purple', baseTheme: 'nordic' }
        ]);
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await flush();
        const gallery = await openGallery(el, 'theme');
        expect(gallery.customThemes.map((t) => t.id)).toContain('a0AXX0000001');
        gallery.dispatchEvent(
            new CustomEvent('themepick', {
                detail: { value: 'custom:a0AXX0000001' }
            })
        );
        await flush();
        const theme = lastSpec(handler).theme;
        expect(theme.source).toBe('custom');
        expect(theme.name).toBe('a0AXX0000001');
        // once the record props land, effective values read from them
        await flush();
        const accent = el.shadowRoot.querySelector(
            'c-final-color-control[data-key="accent"]'
        );
        expect(accent.value).toBe('#7c2d9c');
        // the row names the pick
        expect(
            el.shadowRoot.querySelectorAll('.entry-name')[0].textContent
        ).toBe('Brand Purple · custom');
    });

    it('Edit… dispatches the explicit themeedit action (blast-radius rule); Change… does not', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('themeedit', handler);
        el.shadowRoot
            .querySelector('.entry-change[data-gallery="theme"]')
            .click();
        await flush();
        expect(handler).not.toHaveBeenCalled();
        el.shadowRoot.querySelector('.entry-edit').click();
        expect(handler.mock.calls[0][0].detail).toEqual({
            themeId: null,
            startFrom: 'nordic'
        });
    });

    it('layout row: label + Change… opens the gallery popup in layout mode', async () => {
        const el = mount(
            buildSampleSpec({
                layout: 'splitHero',
                paneFlow: 'oneAtATime',
                themeKey: 'nordic'
            })
        );
        expect(
            el.shadowRoot.querySelectorAll('.entry-name')[1].textContent
        ).toBe('Split Hero · Conversational');
        const gallery = await openGallery(el, 'layout');
        expect(gallery.mode).toBe('layout');
        expect(gallery.layout).toBe('splitHero');
        expect(gallery.paneFlow).toBe('oneAtATime');
    });

    it('layout pick emits specchange with the new type + reconciled options', async () => {
        const spec = buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' });
        spec.layout.maxWidth = 'wide';
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickLayout(el, 'splitHero', 'oneAtATime');
        expect(
            el.shadowRoot.querySelector('c-final-gallery-picker')
        ).toBeNull();
        const next = lastSpec(handler).layout;
        expect(next.type).toBe('splitHero');
        expect(next.options).toEqual({ paneFlow: 'oneAtATime' });
        // layout-agnostic knobs carry over untouched
        expect(next.maxWidth).toBe('wide');
        expect(next.zonesDefault).toEqual({ arrangement: 'single', gap: 'md' });
    });

    it('leaving splitHero drops its layout-specific options', async () => {
        const spec = buildSampleSpec({
            layout: 'splitHero',
            paneFlow: 'oneAtATime',
            themeKey: 'nordic'
        });
        spec.layout.options.fullBleed = false;
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickLayout(el, 'scroll');
        const next = lastSpec(handler).layout;
        expect(next.type).toBe('scroll');
        expect(next.options).toEqual({});
    });

    it('splitHero variant switch keeps fullBleed; re-picking the current layout is a no-op', async () => {
        const spec = buildSampleSpec({
            layout: 'splitHero',
            themeKey: 'nordic'
        });
        spec.layout.options.fullBleed = false;
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickLayout(el, 'splitHero', 'oneAtATime');
        expect(lastSpec(handler).layout.options).toEqual({
            paneFlow: 'oneAtATime',
            fullBleed: false
        });
        handler.mockClear();
        await pickLayout(el, 'splitHero', 'oneAtATime');
        expect(handler).not.toHaveBeenCalled();
    });

    it('layout pick with theme overrides present needs NO confirm (overrides are layout-agnostic)', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        el.shadowRoot
            .querySelector('c-final-color-control[data-key="accent"]')
            .dispatchEvent(
                new CustomEvent('change', { detail: { value: '#123456' } })
            );
        await flush();
        await pickLayout(el, 'tabs');
        expect(el.shadowRoot.querySelector('.confirm')).toBeNull();
        const spec = lastSpec(handler);
        expect(spec.layout.type).toBe('tabs');
        expect(spec.theme.overrides.palette.accent).toBe('#123456');
    });

    it('gallery close event dismisses the popup without a spec change', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const gallery = await openGallery(el, 'layout');
        gallery.dispatchEvent(new CustomEvent('close'));
        await flush();
        expect(
            el.shadowRoot.querySelector('c-final-gallery-picker')
        ).toBeNull();
        expect(handler).not.toHaveBeenCalled();
    });

    it('plain content controls (title) write spec paths, never overrides', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const input = el.shadowRoot.querySelector('input[data-key="title"]');
        input.value = 'New Title';
        input.dispatchEvent(new CustomEvent('change'));
        await flush();
        const spec = lastSpec(handler);
        expect(spec.header.title).toBe('New Title');
        expect(spec.theme.overrides || {}).toEqual({});
    });
});
