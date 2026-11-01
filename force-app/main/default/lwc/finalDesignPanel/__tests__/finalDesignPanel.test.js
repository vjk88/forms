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

// one rail tab at a time (IMPL_PLAN_DESIGN_RAIL): pick it on the rail
async function openArea(el, key) {
    el.shadowRoot
        .querySelector('c-final-studio-rail')
        .dispatchEvent(new CustomEvent('select', { detail: { key } }));
    await flush();
}

const rail = (el) => el.shadowRoot.querySelector('c-final-studio-rail');
const railTab = (el, key) => rail(el).tabs.find((t) => t.key === key);
const searchEntries = (el) =>
    el.shadowRoot.querySelector('c-final-design-search').entries;

const railKeys = (el) =>
    el.shadowRoot.querySelector('c-final-studio-rail').tabs.map((t) => t.key);

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
    // The old toolbar strip's jobs, now inside the pane (IMPL_PLAN_DESIGN_RAIL):
    // search at the top, every color on the Colors rail tab.
    describe('pane search + Colors tab', () => {
        it('search indexes every control with the same availability as the rendered panel', async () => {
            const el = mount();
            await goAdvanced(el);
            const entries = searchEntries(el);
            expect(entries).toHaveLength(flattenControls().length);
            expect(
                entries.find((entry) => entry.key === 'pageScrim')
            ).toMatchObject({
                available: false,
                reason: 'Add a page background image first.'
            });
            for (const section of DESIGN_SECTIONS) {
                // The same panel must navigate sequentially through its sections.
                // eslint-disable-next-line no-await-in-loop
                await openArea(el, section.key);
                for (const entry of entries.filter(
                    (item) => item.section === section.key
                )) {
                    expect(
                        Boolean(
                            el.shadowRoot.querySelector(
                                `[data-control="${entry.key}"]`
                            )
                        )
                    ).toBe(entry.available);
                }
            }
            const changed = jest.fn();
            el.addEventListener('specchange', changed);
            expect(el.revealControl('pageScrim')).toBe(false);
            expect(changed).not.toHaveBeenCalled();
        });

        it('search is offered in Simple too, and a pick lands in Advanced on its tab', async () => {
            const el = mount();
            expect(searchEntries(el)).toHaveLength(flattenControls().length);
            // the list says a pick will switch to Advanced design
            expect(
                el.shadowRoot.querySelector('c-final-design-search')
                    .opensAdvanced
            ).toBe(true);
            el.shadowRoot.querySelector('c-final-design-search').dispatchEvent(
                new CustomEvent('settingselect', {
                    detail: { key: 'labelColor' }
                })
            );
            await flush();
            expect(rail(el).value).toBe('fields');
            expect(
                el.shadowRoot.querySelector('[data-control="labelColor"]')
            ).not.toBeNull();
        });

        it('the Colors tab lists exactly the available colors, gradients and mesh colors', async () => {
            const el = mount();
            await goAdvanced(el);
            await openArea(el, 'colors');
            const shown = [
                ...el.shadowRoot.querySelectorAll('.colors-tab .color-row')
            ].map((row) => row.dataset.control);
            const types = new Map(
                flattenControls().map((e) => [e.control.key, e.control.type])
            );
            const expected = searchEntries(el)
                .filter((entry) => entry.available)
                .map((entry) => entry.key)
                .filter((key) =>
                    ['color', 'gradientSurface', 'meshColors'].includes(
                        types.get(key)
                    )
                );
            expect(shown.length).toBeGreaterThan(0);
            expect([...shown].sort()).toEqual([...expected].sort());
        });

        it('a gradient edit on the Colors tab goes through specchange, and its reset drops both halves', async () => {
            const el = mount();
            const changed = jest.fn();
            el.addEventListener('specchange', changed);
            await goAdvanced(el);
            await openArea(el, 'colors');
            const gradient = {
                type: 'linear',
                angle: 90,
                start: '#112233',
                end: '#445566'
            };
            el.shadowRoot
                .querySelector(
                    '.colors-tab c-final-gradient-control[data-key="pageBg"]'
                )
                .dispatchEvent(
                    new CustomEvent('change', {
                        detail: { solid: '#123456', gradient }
                    })
                );
            await flush();
            expect(
                lastSpec(changed).theme.overrides.palette.pageBgGradient
            ).toEqual(gradient);
            el.spec = lastSpec(changed);
            await flush();
            expect(railTab(el, 'colors').dot).toBe(true);
            el.shadowRoot
                .querySelector('.color-reset[data-key="pageBg"]')
                .click();
            await flush();
            expect(
                lastSpec(changed).theme.overrides.palette?.pageBgGradient
            ).toBeUndefined();
            expect(
                lastSpec(changed).theme.overrides.palette?.pageBg
            ).toBeUndefined();
        });

        it('a color changed on the Colors tab is the same setting, edited dot included, in its own tab', async () => {
            const el = mount();
            const changed = jest.fn();
            el.addEventListener('specchange', changed);
            await goAdvanced(el);
            await openArea(el, 'colors');
            el.shadowRoot
                .querySelector(
                    '.colors-tab c-final-color-control[data-key="labelColor"]'
                )
                .dispatchEvent(
                    new CustomEvent('change', { detail: { value: '#123456' } })
                );
            await flush();
            el.spec = lastSpec(changed);
            await flush();
            expect(railTab(el, 'fields').dot).toBe(true);
            await openArea(el, 'fields');
            const own = el.shadowRoot.querySelector(
                'c-final-color-control[data-key="labelColor"]'
            );
            expect(own.value).toBe('#123456');
            expect(own.edited).toBe(true);
        });

        it('reveals and focuses a control on its own tab without editing the spec', async () => {
            const el = mount();
            const changed = jest.fn();
            el.addEventListener('specchange', changed);
            await goAdvanced(el);
            await openArea(el, 'page');
            expect(el.revealControl('typography')).toBe(true);
            await flush();
            expect(rail(el).value).toBe('brand');
            const wrapper = el.shadowRoot.querySelector(
                '[data-control="typography"]'
            );
            expect(wrapper.closest('details.group').open).toBe(true);
            expect(wrapper.classList.contains('control-target--focused')).toBe(
                true
            );
            expect(el.shadowRoot.activeElement).toBe(
                wrapper.querySelector('c-final-font-picker')
            );
            expect(changed).not.toHaveBeenCalled();
        });

        it('resetting mesh colors on the Colors tab restores the theme mesh as well as its colors', async () => {
            const spec = buildSampleSpec({
                layout: 'stepper',
                themeKey: 'nordic'
            });
            spec.theme.overrides = {
                effects: {
                    mesh: 'custom',
                    meshColors: ['#112233', '#445566']
                }
            };
            const el = mount(spec);
            const changed = jest.fn();
            el.addEventListener('specchange', changed);
            await goAdvanced(el);
            await openArea(el, 'colors');
            el.shadowRoot
                .querySelector('.color-reset[data-key="meshColors"]')
                .click();
            await flush();
            expect(
                lastSpec(changed).theme.overrides.effects?.mesh
            ).toBeUndefined();
            expect(
                lastSpec(changed).theme.overrides.effects?.meshColors
            ).toBeUndefined();
            expect(changed).toHaveBeenCalledTimes(1);
        });
    });

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

    it('Simple has three rail tabs, one section each, and opens on Appearance', async () => {
        const el = mount();
        expect(railKeys(el)).toEqual(['theme', 'brand', 'navigation']);
        expect(rail(el).tabs.map((t) => t.label)).toEqual([
            'Theme',
            'Brand',
            'Buttons'
        ]);
        expect(rail(el).value).toBe('theme');
        const titles = () =>
            [
                ...el.shadowRoot.querySelectorAll('.simple-section .area-title')
            ].map((t) => t.textContent);
        expect(titles()).toEqual(['Appearance']);
        await openArea(el, 'brand');
        expect(titles()).toEqual(['Content & branding']);
        await openArea(el, 'navigation');
        expect(titles()).toEqual(['Buttons & confirmation']);
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
        async (layout, paneFlow, labels) => {
            const el = mount(
                buildSampleSpec({ layout, paneFlow, themeKey: 'nordic' })
            );
            await openArea(el, 'navigation');
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
        await openArea(el, 'brand');
        expect(
            el.shadowRoot.querySelector('.simple-section .area-summary')
                .textContent
        ).toBe('Welcome & hello');
        await goAdvanced(el);
        await openArea(el, 'completion');
        el.shadowRoot.querySelectorAll('.lens-btn')[0].click();
        await flush();
        // Finish has no Simple tab: its confirmation lives on Simple's Buttons
        expect(rail(el).value).toBe('navigation');
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
        await openArea(el, 'navigation');
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
        await openArea(el, 'navigation');
        expect(el.shadowRoot.querySelector('[data-key="asTitle"]')).toBeNull();
        expect(
            el.shadowRoot.querySelector('[data-key="asMessage"]')
        ).toBeNull();
        const link = [
            ...el.shadowRoot.querySelectorAll('.simple-body button')
        ].find((b) => b.textContent.includes('after-submit'));
        link.click();
        await flush();
        expect(rail(el).value).toBe('completion');
        expect(
            el.shadowRoot.querySelector('.design-section .area-title')
                .textContent
        ).toBe('After submit');
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
        await openArea(el, 'brand');
        el.shadowRoot.querySelector('[data-group="header"]').click();
        await flush();
        const updated = lastSpec(handler);
        expect(updated.theme.overrides.palette.headerText).toBeUndefined();
        expect(updated.theme.overrides.palette.accent).toBe('#654321');
        expect(updated.header).toEqual(spec.header);
    });

    it('starts in Simple on the Theme tab, essentials only', () => {
        const el = mount();
        expect(rail(el)).not.toBeNull();
        expect(rail(el).value).toBe('theme');
        expect(el.shadowRoot.querySelectorAll('.simple-section')).toHaveLength(
            1
        );
        expect(el.shadowRoot.querySelector('.design-section')).toBeNull();
    });

    it('Advanced has seven rail tabs, Colors last after a divider, one area at a time', async () => {
        const el = mount();
        await goAdvanced(el);
        expect(railKeys(el)).toEqual([
            'theme',
            'brand',
            'page',
            'fields',
            'navigation',
            'completion',
            'colors'
        ]);
        expect(rail(el).tabs.map((t) => t.label)).toEqual([
            'Theme',
            'Brand',
            'Page',
            'Fields',
            'Buttons',
            'Finish',
            'Colors'
        ]);
        expect(railTab(el, 'colors').divider).toBe(true);
        expect(railTab(el, 'theme').dot).toBeFalsy();
        const titles = () =>
            [
                ...el.shadowRoot.querySelectorAll('.design-section .area-title')
            ].map((t) => t.textContent);
        expect(titles()).toEqual(['Theme']);
        await openArea(el, 'page');
        expect(titles()).toEqual(['Page & form']);
        await openArea(el, 'colors');
        expect(titles()).toEqual(['Colors']);
    });

    it('every group in the open tab starts open, and one the author closes stays closed', async () => {
        const el = mount();
        await goAdvanced(el);
        await openArea(el, 'brand');
        const groups = () => [
            ...el.shadowRoot.querySelectorAll('details.group')
        ];
        expect(groups().length).toBeGreaterThan(1);
        expect(groups().every((g) => g.open)).toBe(true);
        const fonts = el.shadowRoot.querySelector(
            'details.group[data-disclosure-group="fonts"]'
        );
        fonts.open = false;
        fonts.dispatchEvent(new CustomEvent('toggle'));
        await openArea(el, 'page');
        await openArea(el, 'brand');
        expect(
            el.shadowRoot.querySelector(
                'details.group[data-disclosure-group="fonts"]'
            ).open
        ).toBe(false);
    });

    it('a lens switch keeps the tab both lenses have, else lands on Theme', async () => {
        const el = mount();
        await openArea(el, 'brand');
        await goAdvanced(el);
        expect(rail(el).value).toBe('brand');
        await openArea(el, 'colors');
        el.shadowRoot.querySelectorAll('.lens-btn')[0].click();
        await flush();
        expect(rail(el).value).toBe('theme');
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
        // Advanced keeps accent in Brand › Colors (one home per control)
        await openArea(el, 'brand');
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
        await openArea(el, 'brand');
        el.shadowRoot.querySelector('.resetchip').click();
        await flush();
        expect(lastSpec(handler).theme.overrides.palette).toBeUndefined();
    });

    it('theme row: name + Change… opens the gallery popup in theme mode', async () => {
        const el = mount();
        expect(
            el.shadowRoot.querySelectorAll('.entry-name')[0].textContent
        ).toBe('Clean · Nordic Minimalist');
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

    it('font picker: uploaded and pairing picks write overrides.fonts and clear legacy keys', async () => {
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
        const picker = el.shadowRoot.querySelector(
            'c-final-font-picker[data-key="typography"]'
        );
        const select = picker.shadowRoot.querySelector(
            'select[data-role="pairing"]'
        );
        const values = [...select.querySelectorAll('option')].map(
            (o) => o.value
        );
        expect(values).toContain('uploaded:Sample_Brand');
        expect(values).toContain('pairing:editorialSerif');
        // nothing set at the form level yet: "From theme" is chosen
        expect(select.value).toBe('inherit');

        select.value = 'uploaded:Sample_Brand';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        let theme = lastSpec(handler).theme;
        expect(theme.overrides.fonts.display.family).toBe('Sample Brand');
        expect(theme.overrides.fonts.body.resource).toBe('sample_brand_font');
        expect(theme.overrides.customFont).toBeUndefined();

        select.value = 'pairing:editorialSerif';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        theme = lastSpec(handler).theme;
        expect(theme.overrides.fonts).toEqual({ pairing: 'editorialSerif' });

        select.value = 'inherit';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        theme = lastSpec(handler).theme;
        expect(theme.overrides.fonts).toBeUndefined();
    });

    it('font picker: a legacy choice shows as an older option until a new pick replaces it', async () => {
        const spec = buildSampleSpec({
            layout: 'stepper',
            themeKey: 'editorialIvory'
        });
        spec.theme.overrides = { typography: 'geometric' };
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await flush();
        await goAdvanced(el);
        await openArea(el, 'brand');
        const picker = el.shadowRoot.querySelector(
            'c-final-font-picker[data-key="typography"]'
        );
        const select = picker.shadowRoot.querySelector(
            'select[data-role="pairing"]'
        );
        const chosen = select.querySelector('option:checked');
        expect(chosen.value).toBe('legacy:geometric');
        expect(chosen.textContent).toContain('older option');
        expect(picker.edited).toBe(true);

        select.value = 'pairing:modern';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        const overrides = lastSpec(handler).theme.overrides;
        expect(overrides.typography).toBeUndefined();
        expect(overrides.fonts).toEqual({ pairing: 'modern' });
    });

    it('font group reset removes every form-level font key', async () => {
        const spec = buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' });
        spec.theme.overrides = {
            fonts: { pairing: 'modern' },
            typography: 'mono',
            customFont: null
        };
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await flush();
        await goAdvanced(el);
        await openArea(el, 'brand');
        const picker = el.shadowRoot.querySelector(
            'c-final-font-picker[data-key="typography"]'
        );
        const reset = picker
            .closest('details.group')
            .querySelector('.resetchip');
        expect(reset).not.toBeNull();
        reset.click();
        await flush();
        const overrides = lastSpec(handler).theme.overrides;
        expect(overrides.fonts).toBeUndefined();
        expect(overrides.typography).toBeUndefined();
        expect(overrides.customFont).toBeUndefined();
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
        spec.layout.maxWidth = 'narrow';
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickLayout(el, 'splitHero', 'oneAtATime');
        expect(
            el.shadowRoot.querySelector('c-final-gallery-picker')
        ).toBeNull();
        const next = lastSpec(handler).layout;
        expect(next.type).toBe('splitHero');
        // coming INTO Split starts carded and Wide, like a new Split form
        // (owner 2026-10-25), even over the old layout's Narrow
        expect(next.options).toEqual({
            paneFlow: 'oneAtATime',
            fullBleed: false,
            widthIsStart: true
        });
        expect(next.maxWidth).toBe('wide');
        expect(next.zonesDefault).toEqual({ arrangement: 'single', gap: 'md' });
    });

    const setToggle = async (el, key, on) => {
        const input = el.shadowRoot.querySelector(`input[data-key="${key}"]`);
        input.checked = on;
        input.dispatchEvent(new CustomEvent('change'));
        await flush();
    };
    const setSelect = async (el, key, value) => {
        const sel = el.shadowRoot.querySelector(`select[data-key="${key}"]`);
        sel.value = value;
        sel.dispatchEvent(new CustomEvent('change'));
        await flush();
    };

    it("turning Immersive on drops a new Split form's untouched Wide (owner 2026-10-25)", async () => {
        const el = mount(
            buildSampleSpec({ layout: 'splitHero', themeKey: 'nordic' })
        );
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await goAdvanced(el);
        await openArea(el, 'page');
        await setToggle(el, 'fullBleed', true);
        const next = lastSpec(handler).layout;
        expect(next.options.fullBleed).toBe(true);
        expect('maxWidth' in next).toBe(false);
        expect(next.options.widthIsStart).toBeUndefined();
    });

    it('a Wide the author picked stays Wide when Immersive goes on', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'splitHero', themeKey: 'nordic' })
        );
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await goAdvanced(el);
        await openArea(el, 'page');
        await setSelect(el, 'maxWidth', 'wide');
        expect(lastSpec(handler).layout.options.widthIsStart).toBeUndefined();
        await setToggle(el, 'fullBleed', true);
        expect(lastSpec(handler).layout.maxWidth).toBe('wide');
    });

    it('leaving Split keeps its width (owner 2026-10-25)', async () => {
        const el = mount(
            buildSampleSpec({ layout: 'splitHero', themeKey: 'nordic' })
        );
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickLayout(el, 'scroll');
        const next = lastSpec(handler).layout;
        expect(next.options).toEqual({});
        expect(next.maxWidth).toBe('wide');
    });

    it('a saved Split form keeps its own full-bleed and width on a variant switch', async () => {
        // an existing form: full-bleed never chosen (= ON), width Narrow
        const spec = buildSampleSpec({
            layout: 'splitHero',
            themeKey: 'nordic'
        });
        spec.layout.options = {};
        spec.layout.maxWidth = 'narrow';
        const el = mount(spec);
        const handler = jest.fn();
        el.addEventListener('specchange', handler);
        await pickLayout(el, 'splitHero', 'oneAtATime');
        const next = lastSpec(handler).layout;
        expect(next.options).toEqual({ paneFlow: 'oneAtATime' });
        expect(next.maxWidth).toBe('narrow');
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
            fullBleed: false,
            widthIsStart: true
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
        await openArea(el, 'brand');
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

    describe('Advanced rich-text disclosures (Studio UX plan, Task 4)', () => {
        const RICH_KEYS = ['title', 'description', 'brandName'];
        const RICH_TEXT_HTML =
            '<p><strong>Bold</strong> and <a href="https://example.com">a link</a></p><ul><li>one</li></ul>';

        async function openBrand(spec) {
            const el = mount(spec);
            await goAdvanced(el);
            await openArea(el, 'brand');
            return el;
        }
        const editorOf = (el, key) =>
            el.shadowRoot.querySelector(
                `lightning-input-rich-text[data-key="${key}"]`
            );
        const disclosureOf = (el, key) =>
            editorOf(el, key).closest('details.rt-disclosure');
        const previewOf = (el, key) =>
            disclosureOf(el, key)
                .querySelector('.rt-preview')
                .textContent.trim();
        const sampleWith = (header) => {
            const spec = buildSampleSpec({
                layout: 'stepper',
                themeKey: 'nordic'
            });
            Object.assign(spec.header, header);
            return spec;
        };

        it('each control starts closed with its label and a summary, and keeps the full editor mounted', async () => {
            const el = await openBrand(
                sampleWith({
                    title: '<p><strong>Welcome</strong> &amp; hello</p>',
                    description: '',
                    brandName: ''
                })
            );
            for (const key of RICH_KEYS) {
                const editor = editorOf(el, key);
                expect(editor).not.toBeNull(); // mounted while closed
                expect(disclosureOf(el, key).open).toBe(false);
                expect(editor.variant).toBe('bottom-toolbar');
                expect(
                    disclosureOf(el, key)
                        .querySelector('summary .rt-label')
                        .textContent.trim().length
                ).toBeGreaterThan(0);
            }
            expect(previewOf(el, 'title')).toBe('Welcome & hello');
            expect(previewOf(el, 'description')).toBe('Not set');
            expect(previewOf(el, 'brandName')).toBe('Not set');
        });

        it('summaries cap plain text at 80 characters and say so for an image-only value', async () => {
            const el = await openBrand(
                sampleWith({
                    title: `<p>${'a'.repeat(100)}</p>`,
                    description: '<p><img src="x.png" alt=""></p>',
                    brandName: '<p>  </p>'
                })
            );
            expect(previewOf(el, 'title')).toBe(`${'a'.repeat(80)}…`);
            expect(previewOf(el, 'description')).toBe('Contains an image');
            expect(previewOf(el, 'brandName')).toBe('Not set');
        });

        it('opening, closing and a Simple/Advanced round trip change nothing', async () => {
            const spec = sampleWith({ title: RICH_TEXT_HTML });
            const before = JSON.parse(JSON.stringify(spec));
            const el = await openBrand(spec);
            const handler = jest.fn();
            el.addEventListener('specchange', handler);

            const details = disclosureOf(el, 'title');
            details.open = true;
            details.dispatchEvent(new CustomEvent('toggle'));
            await flush();
            details.open = false;
            details.dispatchEvent(new CustomEvent('toggle'));
            await flush();
            el.shadowRoot.querySelectorAll('.lens-btn')[0].click(); // Simple
            await flush();
            await goAdvanced(el);
            await openArea(el, 'brand');

            expect(handler).not.toHaveBeenCalled();
            expect(el.spec).toEqual(before);
            expect(editorOf(el, 'title').value).toBe(RICH_TEXT_HTML);
        });

        it('a deliberate edit inside the disclosure writes the same canonical path', async () => {
            const el = await openBrand(sampleWith({ title: RICH_TEXT_HTML }));
            const handler = jest.fn();
            el.addEventListener('specchange', handler);
            disclosureOf(el, 'title').open = true;
            const editor = editorOf(el, 'title');
            editor.value = '<p>New Title</p>';
            editor.dispatchEvent(new CustomEvent('change'));
            await flush();
            const spec = lastSpec(handler);
            expect(spec.header.title).toBe('<p>New Title</p>');
            expect(spec.theme.overrides || {}).toEqual({});
        });

        it('a spec echo after typing does not close a disclosure the author opened', async () => {
            const el = await openBrand(sampleWith({ title: RICH_TEXT_HTML }));
            const handler = jest.fn();
            el.addEventListener('specchange', handler);
            const details = disclosureOf(el, 'title');
            details.open = true;
            const editor = editorOf(el, 'title');
            editor.value = '<p>Typed</p>';
            editor.dispatchEvent(new CustomEvent('change'));
            await flush();

            el.spec = lastSpec(handler); // the host echoes the new spec back
            await flush();
            expect(disclosureOf(el, 'title')).toBe(details);
            expect(details.open).toBe(true);
            expect(previewOf(el, 'title')).toBe('Typed');
        });

        it('Simple keeps its own editors, unwrapped', async () => {
            const el = mount(sampleWith({ title: RICH_TEXT_HTML }));
            await openArea(el, 'brand');
            expect(editorOf(el, 'title')).not.toBeNull();
            expect(editorOf(el, 'title').closest('details.rt-disclosure')).toBe(
                null
            );
        });
    });
});
