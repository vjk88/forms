/**
 * Cross-host legibility, stage 1 (docs/FinalDesign/IMPL_PLAN_CROSS_HOST_STAGES_1_2.md).
 *
 * The platform paints radio and checkbox option text, the dropdown's text and
 * arrow, and the help and calendar icons in fixed greys and blues, so an
 * inherited `color` never reaches them. Each host family reads its own styling
 * hook. These tests pin every hook. The hook names were found by setting each
 * candidate to red on the widget host of the real form, on all three hosts
 * (audit section 3A), and the state matrix then found which states they miss.
 *
 * TEXT follows the theme text colour. ICONS follow --c-icon (a mid grey the
 * engine emits only on dark surfaces), never the text colour: the same icons
 * sit in the platform's fixed-white popups (date picker arrows, the list's check
 * mark), where a light icon would vanish.
 *
 * The hooks sit on the WIDGETS, never on .field: several are global tokens that
 * the open popups inherit as well, so the narrowest host that still reaches the
 * target is used.
 */
const fs = require('fs');
const path = require('path');

const css = fs
    .readFileSync(
        path.join(__dirname, '..', 'finalElementRenderer.css'),
        'utf8'
    )
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat rule list [{ selectors, body }]; at-rule wrappers fall away. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
    body: m[2]
}));

/** Every declaration body of the rules whose selector list contains `selector`. */
const bodiesFor = (selector) =>
    rules
        .filter((r) => r.selectors.includes(selector))
        .map((r) => r.body)
        .join('\n');

/** `--name: value` with nothing between the name and the colon. */
const declares = (name, value) =>
    new RegExp(`${name}\\s*:\\s*${value.replace(/[()]/g, '\\$&')}\\s*;`);

const TEXT = 'var(--c-text)';
const ICON = 'var(--c-icon)';

describe('platform widgets take the theme colours through their own hooks', () => {
    it('radio and checkbox option text, on every host family', () => {
        for (const selector of [
            '.field lightning-radio-group',
            '.field lightning-checkbox-group'
        ]) {
            const body = bodiesFor(selector);
            // Lightning Experience
            expect(body).toMatch(declares('--slds-g-color-on-surface-2', TEXT));
            // the Studio (Visualforce page + Lightning Out)
            expect(body).toMatch(
                declares('--slds-g-color-neutral-base-30', TEXT)
            );
            // the public site
            expect(body).toMatch(
                declares('--dxp-s-form-element-label-color', TEXT)
            );
        }
    });

    it('dropdown text follows the text colour, its arrow the icon ink', () => {
        const combo = bodiesFor('.field lightning-combobox');
        // Studio and public site (Lightning already follows
        // --slds-c-input-text-color, which :host sets)
        expect(combo).toMatch(declares('--slds-g-color-neutral-base-50', TEXT));
        // the arrow, every host
        expect(combo).toMatch(
            declares('--slds-c-icon-color-foreground-default', ICON)
        );
    });

    it('help and calendar icons, resting AND on hover/focus', () => {
        for (const selector of [
            '.field-label-row lightning-helptext',
            '.field lightning-input'
        ]) {
            const body = bodiesFor(selector);
            expect(body).toMatch(
                declares('--slds-c-icon-color-foreground', ICON)
            );
            // hover and focus are coloured separately by the platform (a dark
            // navy that disappears on a dark theme): Lightning and the Studio
            // read this hook, the Studio under both of its spellings
            expect(body).toMatch(
                declares('--slds-c-button-text-color-hover', ICON)
            );
            expect(body).toMatch(
                declares('--sds-c-button-text-color-hover', ICON)
            );
        }
        // the public site colours the help icon's hover and focus from this one
        expect(bodiesFor('.field-label-row lightning-helptext')).toMatch(
            declares('--dxp-g-neutral-3', ICON)
        );
    });

    it('the dead help-icon hook is gone', () => {
        // ...-foreground-default moves only the dropdown arrow; on the help
        // icon it did nothing on any host (measured 2026-10-10).
        expect(bodiesFor('.field-label-row lightning-helptext')).not.toMatch(
            /--slds-c-icon-color-foreground-default/
        );
    });

    it('icon hooks never take the text colour (popups are white)', () => {
        // only the widget rules: the callout blocks further down set their own
        // icon colours on their own elements
        const widgets = [
            '.field lightning-combobox',
            '.field lightning-input',
            '.field-label-row lightning-helptext'
        ]
            .map(bodiesFor)
            .join('\n');
        for (const name of [
            '--slds-c-icon-color-foreground-default',
            '--slds-c-icon-color-foreground',
            '--slds-c-button-text-color-hover',
            '--sds-c-button-text-color-hover',
            '--dxp-g-neutral-3'
        ]) {
            const used = widgets.match(
                new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g')
            );
            expect(used).not.toBeNull();
            expect(used.every((d) => d.includes('var(--c-icon)'))).toBe(true);
        }
    });

    it('a disabled dropdown gets a dark ink again, later in the cascade', () => {
        // The platform keeps its disabled dropdown on a fixed light-grey box in
        // every theme; light text there measured 1.04 : 1.
        const readonly = bodiesFor('.field-readonly lightning-combobox');
        expect(readonly).toMatch(
            /--slds-g-color-neutral-base-50\s*:\s*#[0-9a-f]{6}\s*;/i
        );
        const at = (selector) =>
            rules.findIndex(
                (r) =>
                    r.selectors.includes(selector) &&
                    r.body.includes('--slds-g-color-neutral-base-50')
            );
        expect(at('.field-readonly lightning-combobox')).toBeGreaterThan(
            at('.field lightning-combobox')
        );
    });

    it('none of the colour hooks sit on .field', () => {
        const field = bodiesFor('.field');
        for (const name of [
            '--slds-g-color-on-surface-2',
            '--slds-g-color-neutral-base-30',
            '--slds-g-color-neutral-base-50',
            '--dxp-s-form-element-label-color',
            '--dxp-g-neutral-3',
            '--slds-c-icon-color-foreground',
            '--slds-c-button-text-color-hover'
        ]) {
            expect(field).not.toContain(name);
        }
    });
});

describe('an invalid box keeps the theme fill and text', () => {
    // The platform's error rule re-reads the fill and text from the older
    // --sds- spelling; without it an invalid box turned white under the
    // theme's light text (Neon Nights, owner 2026-11-22).
    it('sets both spellings of the fill and text hooks on :host', () => {
        const host = bodiesFor(':host');
        const FILL = 'var(--c-input-bg, var(--c-field-bg))';
        for (const kind of ['input', 'textarea']) {
            expect(host).toMatch(
                declares(`--slds-c-${kind}-color-background`, FILL)
            );
            expect(host).toMatch(
                declares(`--sds-c-${kind}-color-background`, FILL)
            );
            expect(host).toMatch(declares(`--sds-c-${kind}-text-color`, TEXT));
        }
    });
});

describe('a focused box keeps the theme fill and text', () => {
    // Unset, the platform paints a focused box white: Lightning and the Studio
    // swap only the text area (keeping the theme's light text: unreadable on
    // dark themes, owner screenshot 2026-11-23); the public site swaps every
    // box to white with dark text. Hook names read from each host's live
    // :focus rules.
    const squash = (s) => s.replace(/\s+/g, '');
    const host = squash(bodiesFor(':host'));
    const decl = (name, value) => squash(`${name}: ${value};`);
    const FILL = 'var(--c-input-bg, var(--c-field-bg))';

    it('sets both spellings of the focused fill and text, box and text area', () => {
        for (const kind of ['input', 'textarea']) {
            for (const spelling of ['slds', 'sds']) {
                expect(host).toContain(
                    decl(`--${spelling}-c-${kind}-color-background-focus`, FILL)
                );
                expect(host).toContain(
                    decl(`--${spelling}-c-${kind}-text-color-focus`, TEXT)
                );
            }
        }
    });

    it('covers the text area focused while invalid', () => {
        expect(host).toContain(
            decl('--slds-c-textarea-color-background-error-focus', FILL)
        );
        expect(host).toContain(
            decl('--slds-c-textarea-text-color-error-focus', TEXT)
        );
    });
});
