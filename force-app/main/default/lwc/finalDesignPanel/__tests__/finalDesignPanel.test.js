import { createElement } from 'lwc';
import FinalDesignPanel from 'c/finalDesignPanel';
import { buildSampleSpec } from 'c/finalSampleSpec';
import { DESIGN_SECTIONS, flattenControls } from 'c/finalDesignRegistry';
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
    const button = el.shadowRoot.querySelector(
        `.section-toggle[data-area="${key}"]`
    );
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
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

    it('the five Advanced sections cover every registry control exactly once', () => {
        const keys = DESIGN_SECTIONS.flatMap((s) =>
            s.groups.flatMap((g) => g.controls)
        );
        expect(new Set(keys).size).toBe(keys.length);
        expect([...keys].sort()).toEqual(
            flattenControls()
                .map((e) => e.control.key)
                .sort()
        );
    });

    it('Simple has three sections and only Appearance starts expanded', () => {
        const el = mount();
        const sections = [...el.shadowRoot.querySelectorAll('.simple-section')];
        expect(
            sections.map((s) => s.querySelector('.section-title').textContent)
        ).toEqual([
            'Appearance',
            'Content & branding',
            'Buttons & confirmation'
        ]);
        expect(sections.map((s) => s.open)).toEqual([true, false, false]);
        expect(el.shadowRoot.querySelector('.entry-edit')).toBeNull();
        expect(
            el.shadowRoot.querySelector('[data-key="onePerScreen"]')
        ).toBeNull();
    });

    it.each([
        ['scroll', '', ['submitLabel']],
        ['accordion', '', ['submitLabel']],
        ['stepper', '', ['backLabel', 'nextLabel', 'submitLabel']],
        ['tabs', '', ['backLabel', 'nextLabel', 'submitLabel']],
        ['rail', '', ['backLabel', 'nextLabel', 'submitLabel']],
        ['oneAtATime', '', ['backLabel', 'advanceLabel', 'submitLabel']],
        ['splitHero', '', ['backLabel', 'nextLabel', 'submitLabel']],
        [
            'splitHero',
            'oneAtATime',
            ['backLabel', 'advanceLabel', 'submitLabel']
        ]
    ])(
        'Simple shows working button labels for %s / %s',
        (layout, paneFlow, labels) => {
            const el = mount(
                buildSampleSpec({ layout, paneFlow, themeKey: 'nordic' })
            );
            const actual = [
                ...el.shadowRoot.querySelectorAll('.simple-text input')
            ]
                .map((input) => input.dataset.key)
                .filter((key) => key !== 'asTitle');
            expect(actual).toEqual(labels);
        }
    );

    it('mode switches and collapsed groups preserve content, options and hidden overrides', async () => {
        const spec = buildSampleSpec({
            layout: 'oneAtATime',
            themeKey: 'nordic'
        });
        spec.header.title = '<p><strong>Welcome &amp; hello</strong></p>';
        spec.theme.overrides = {
            density: 'compact',
            palette: { headerText: '#123456' }
        };
        spec.layout.options.advanceLabel = 'Proceed';
        spec.settings = {
            completion: {
                mode: 'screen',
                title: 'All done',
                message: '<p>Saved</p>',
                redirectUrl: 'https://example.com/done',
                autoRedirect: false
            }
        };
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        expect(
            el.shadowRoot.querySelectorAll('.section-summary')[1].textContent
        ).toBe('Welcome & hello');
        await goAdvanced(el);
        await openArea(el, 'completion');
        el.shadowRoot.querySelectorAll('.lens-btn')[0].click();
        await flush();
        expect(handler).not.toHaveBeenCalled();
        expect(el.spec).toEqual(spec);
        const title = el.shadowRoot.querySelector('input[data-key="asTitle"]');
        title.value = 'Finished';
        title.dispatchEvent(new CustomEvent('change'));
        await flush();
        const expected = JSON.parse(JSON.stringify(spec));
        expected.settings.completion.title = 'Finished';
        expect(lastSpec(handler)).toEqual(expected);
    });

    it('Simple confirmation edits update the same controls in Advanced', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const editor = el.shadowRoot.querySelector(
            'lightning-input-rich-text[data-key="asMessage"]'
        );
        editor.value = '<p>Your response is saved.</p>';
        editor.dispatchEvent(new CustomEvent('change'));
        await flush();
        await goAdvanced(el);
        await openArea(el, 'completion');
        expect(
            el.shadowRoot.querySelector(
                'lightning-input-rich-text[data-key="asMessage"]'
            ).value
        ).toBe('<p>Your response is saved.</p>');
        expect(lastSpec(handler).settings.completion.message).toBe(
            '<p>Your response is saved.</p>'
        );
    });

    it('a stored toast mode stays intact in Simple and links to its settings', async () => {
        const spec = buildSampleSpec({ themeKey: 'nordic' });
        spec.settings = {
            completion: {
                mode: 'toast',
                title: 'Retained title',
                message: '<p>Retained message</p>'
            }
        };
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        expect(el.shadowRoot.querySelector('[data-key="asTitle"]')).toBeNull();
        expect(
            el.shadowRoot.querySelector('[data-key="asMessage"]')
        ).toBeNull();
        const link = [
            ...el.shadowRoot.querySelectorAll('.simple-body button')
        ].find((b) => b.textContent.includes('after-submit'));
        link.click();
        await flush();
        expect(
            el.shadowRoot
                .querySelector('.section-toggle[data-area="completion"]')
                .getAttribute('aria-expanded')
        ).toBe('true');
        expect(handler).not.toHaveBeenCalled();
        expect(el.spec.settings.completion).toEqual(spec.settings.completion);
    });

    it('theme switching warns even when the customized control is hidden by a gate', async () => {
        const spec = buildSampleSpec({ themeKey: 'nordic' });
        spec.form.type = 'survey';
        spec.theme.overrides = { labelPosition: 'left' };
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickTheme(el, 'brutalist');
        expect(el.shadowRoot.querySelector('.confirm')).not.toBeNull();
        expect(handler).not.toHaveBeenCalled();
        el.shadowRoot.querySelector('.confirm-go').click();
        await flush();
        expect(lastSpec(handler).theme.overrides.labelPosition).toBe('left');
    });

    it('regrouped resets clear appearance only and keep header content', async () => {
        const spec = buildSampleSpec({ themeKey: 'nordic' });
        spec.header.bgImage = { url: 'https://example.com/banner.png' };
        spec.theme.overrides = {
            palette: { headerText: '#123456', accent: '#654321' }
        };
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await goAdvanced(el);
        el.shadowRoot.querySelector('[data-group="header"]').click();
        await flush();
        const updated = lastSpec(handler);
        expect(updated.theme.overrides.palette.headerText).toBeUndefined();
        expect(updated.theme.overrides.palette.accent).toBe('#654321');
        expect(updated.header).toEqual(spec.header);
    });

    it('starts in Simple: no rail, essentials only', () => {
        const el = mount();
        expect(el.shadowRoot.querySelector('.rail')).toBeNull();
        expect(el.shadowRoot.querySelector('.simple-section')).not.toBeNull();
    });

    it('Advanced exposes five task sections without a rail', async () => {
        const el = mount();
        await goAdvanced(el);
        const areas = [
            ...el.shadowRoot.querySelectorAll('.section-toggle')
        ].map((b) => b.dataset.area);
        expect(areas).toEqual([
            'brand',
            'page',
            'fields',
            'navigation',
            'completion'
        ]);
        expect(el.shadowRoot.querySelector('.rail')).toBeNull();
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
        await openArea(el, 'page');
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
        await openArea(el, 'page');
        expect(
            el.shadowRoot.querySelector('input[data-key="fullBleed"]')
        ).not.toBeNull();
        await openArea(el, 'navigation');
        expect(
            el.shadowRoot.querySelector('select[data-key="heroProgress"]')
        ).not.toBeNull();
        expect(el.shadowRoot.querySelector('.narrate')).toBeNull();
    });

    it('paging: stepper gets real step controls, no stale narration', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' })
        );
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await goAdvanced(el);
        await openArea(el, 'navigation');
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

    it('audit batch: sections group, no Focus control, oaat bleed, scroll dividers', async () => {
        // Body › Sections writes a sparse sectionStyle override
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await goAdvanced(el);
        await openArea(el, 'fields');
        expect(
            el.shadowRoot.querySelector(
                'c-final-color-control[data-key="sectionBg"]'
            )
        ).not.toBeNull();
        const style = el.shadowRoot.querySelector(
            'select[data-key="sectionStyle"]'
        );
        expect(style).not.toBeNull();
        style.value = 'boxed';
        style.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(lastSpec(handler).theme.overrides.sectionStyle).toBe('boxed');

        // border hiding (owner 2026-07-12): None/Hidden retire their color
        // pickers (needsValue notEquals gate)
        await openArea(el, 'page');
        const bw = el.shadowRoot.querySelector('select[data-key="border"]');
        bw.value = 'none';
        bw.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(lastSpec(handler).theme.overrides.border).toBe('none');
        expect(
            el.shadowRoot.querySelector(
                'c-final-color-control[data-key="borderColor"]'
            )
        ).toBeNull();
        await openArea(el, 'fields');
        const sb = el.shadowRoot.querySelector(
            'select[data-key="sectionBorder"]'
        );
        sb.value = 'none';
        sb.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(lastSpec(handler).theme.overrides.sectionBorder).toBe('none');
        expect(
            el.shadowRoot.querySelector(
                'c-final-color-control[data-key="sectionBorderColor"]'
            )
        ).toBeNull();

        // Focus color control is gone (focus rides the accent)
        await openArea(el, 'fields');
        expect(
            el.shadowRoot.querySelector(
                'c-final-color-control[data-key="focus"]'
            )
        ).toBeNull();

        // oneAtATime gets the Immersive toggle its carded look was missing
        const el2 = mount(
            buildSampleSpec({ layout: 'oneAtATime', themeKey: 'nordic' })
        );
        await goAdvanced(el2);
        await openArea(el2, 'page');
        expect(
            el2.shadowRoot.querySelector('input[data-key="oaatBleed"]')
        ).not.toBeNull();

        // scroll gets Page dividers (and loses the "nothing to page" line)
        const el3 = mount(
            buildSampleSpec({ layout: 'scroll', themeKey: 'nordic' })
        );
        await goAdvanced(el3);
        await openArea(el3, 'navigation');
        expect(
            el3.shadowRoot.querySelector('input[data-key="showDividers"]')
        ).not.toBeNull();
        expect(el3.shadowRoot.querySelector('.narrate')).toBeNull();
    });

    it('header surface: fill + banner show on splitHero too (pane maps them — sweep slice 3)', async () => {
        // Pre-2026-07-18 these hid on splitHero; now the pane paints
        // --c-header-bg and the viewer maps header.bgImage → paneImage, so
        // one editor drives the surface on every layout.
        const el = mount(
            buildSampleSpec({ layout: 'splitHero', themeKey: 'nordic' })
        );
        await goAdvanced(el);
        await openArea(el, 'brand');
        expect(
            el.shadowRoot.querySelector(
                'c-final-gradient-control[data-key="headerBg"]'
            )
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector(
                'c-final-image-uploader[data-key="bannerImage"]'
            )
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector(
                'c-final-color-control[data-key="headerText"]'
            )
        ).not.toBeNull();

        const el2 = mount(
            buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' })
        );
        await goAdvanced(el2);
        await openArea(el2, 'brand');
        expect(
            el2.shadowRoot.querySelector(
                'c-final-gradient-control[data-key="headerBg"]'
            )
        ).not.toBeNull();
        expect(
            el2.shadowRoot.querySelector(
                'c-final-image-uploader[data-key="bannerImage"]'
            )
        ).not.toBeNull();
    });

    it('paging: tabs, rail, and oneAtATime each get their own group', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'tabs', themeKey: 'nordic' })
        );
        await goAdvanced(el);
        await openArea(el, 'navigation');
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
        await openArea(el2, 'navigation');
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
        await openArea(el3, 'navigation');
        expect(
            el3.shadowRoot.querySelector('input[data-key="advanceLabel"]')
        ).not.toBeNull();
        expect(
            el3.shadowRoot.querySelector('input[data-key="oaatProgress"]')
        ).not.toBeNull();
    });

    it('paging: accordion gets its options group; other layouts do not', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'accordion', themeKey: 'nordic' })
        );
        await goAdvanced(el);
        await openArea(el, 'navigation');
        expect(
            el.shadowRoot.querySelector('input[data-key="allowMultiple"]')
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('input[data-key="firstPanelOpen"]')
        ).not.toBeNull();
        const iconPos = el.shadowRoot.querySelector(
            'select[data-key="iconPosition"]'
        );
        expect(iconPos).not.toBeNull();
        expect(
            [...iconPos.querySelectorAll('option')].map((o) => o.value)
        ).toEqual(['', 'trailing']);

        const el2 = mount(
            buildSampleSpec({ layout: 'tabs', themeKey: 'nordic' })
        );
        await goAdvanced(el2);
        await openArea(el2, 'navigation');
        expect(
            el2.shadowRoot.querySelector('input[data-key="allowMultiple"]')
        ).toBeNull();
    });

    it('Simple leaves radius and density to Advanced Design', async () => {
        const el = mount();
        expect(el.shadowRoot.querySelector('[data-look]')).toBeNull();
        expect(el.shadowRoot.querySelector('[data-key="density"]')).toBeNull();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await goAdvanced(el);
        await openArea(el, 'page');
        expect(
            el.shadowRoot.querySelector('select[data-key="density"]')
        ).not.toBeNull();
        expect(
            el.shadowRoot.querySelector('select[data-key="radius"]')
        ).not.toBeNull();
        expect(handler).not.toHaveBeenCalled();
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
        await openArea(el, 'brand');
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
        expect(el.shadowRoot.querySelector('.entry-edit')).toBeNull();
        await goAdvanced(el);
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

    it('plain content controls (title, now richtext) write spec paths, never overrides', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        const editor = el.shadowRoot.querySelector(
            'lightning-input-rich-text[data-key="title"]'
        );
        editor.value = '<p>New Title</p>';
        editor.dispatchEvent(new CustomEvent('change'));
        await flush();
        const spec = lastSpec(handler);
        expect(spec.header.title).toBe('<p>New Title</p>');
        expect(spec.theme.overrides || {}).toEqual({});
    });
});
