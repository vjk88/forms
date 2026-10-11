/**
 * Cross-host legibility, stage 1 (docs/FinalDesign/IMPL_PLAN_CROSS_HOST_STAGES_1_2.md).
 *
 * The platform paints radio and checkbox option text, the dropdown's text and
 * arrow, and the help and calendar icons in fixed greys and blues, so an
 * inherited `color` never reaches them. Each host family reads its own styling
 * hook. These tests pin every hook to the theme's text colour. The hook names
 * were found by setting each candidate to red on the widget host of the real
 * form, on all three hosts (audit section 3A).
 *
 * The hooks sit on the WIDGETS, never on .field: several are global colour
 * tokens that the open popups (dropdown list, date picker) inherit as well, so
 * the narrowest host that still reaches the target is used.
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

/** `--name: var(--c-text)` with nothing between the name and the colon. */
const takesTextColour = (name) =>
    new RegExp(`${name}\\s*:\\s*var\\(--c-text\\)`);

describe('platform widgets take the theme text colour through their own hooks', () => {
    it('radio and checkbox option text, on every host family', () => {
        for (const selector of [
            '.field lightning-radio-group',
            '.field lightning-checkbox-group'
        ]) {
            const body = bodiesFor(selector);
            // Lightning Experience
            expect(body).toMatch(
                takesTextColour('--slds-g-color-on-surface-2')
            );
            // the Studio (Visualforce page + Lightning Out)
            expect(body).toMatch(
                takesTextColour('--slds-g-color-neutral-base-30')
            );
            // the public site
            expect(body).toMatch(
                takesTextColour('--dxp-s-form-element-label-color')
            );
        }
    });

    it('dropdown text and arrow', () => {
        const combo = bodiesFor('.field lightning-combobox');
        // Studio and public site (Lightning already follows
        // --slds-c-input-text-color, which :host sets)
        expect(combo).toMatch(
            takesTextColour('--slds-g-color-neutral-base-50')
        );
        // the arrow, every host
        expect(combo).toMatch(
            takesTextColour('--slds-c-icon-color-foreground-default')
        );
    });

    it('help and calendar icons', () => {
        expect(bodiesFor('.field-label-row lightning-helptext')).toMatch(
            takesTextColour('--slds-c-icon-color-foreground')
        );
        // the calendar icon lives inside the date input
        expect(bodiesFor('.field lightning-input')).toMatch(
            takesTextColour('--slds-c-icon-color-foreground')
        );
    });

    it('the dead help-icon hook is gone', () => {
        // ...-foreground-default moves only the dropdown arrow; on the help
        // icon it did nothing on any host (measured 2026-10-10).
        expect(bodiesFor('.field-label-row lightning-helptext')).not.toMatch(
            /--slds-c-icon-color-foreground-default/
        );
    });

    it('none of the colour hooks sit on .field', () => {
        const field = bodiesFor('.field');
        for (const name of [
            '--slds-g-color-on-surface-2',
            '--slds-g-color-neutral-base-30',
            '--slds-g-color-neutral-base-50',
            '--dxp-s-form-element-label-color',
            '--slds-c-icon-color-foreground'
        ]) {
            expect(field).not.toContain(name);
        }
    });
});
