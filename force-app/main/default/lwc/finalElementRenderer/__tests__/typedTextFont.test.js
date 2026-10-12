/**
 * Cross-host consistency, stage 4, B3 (docs/FinalDesign/IMPL_PLAN_STAGE4_5_TYPED_FONT_AND_PREVIEW_FRAME.md).
 *
 * A form's font (its theme's body font, or a custom brand font) reaches the text
 * people TYPE and the radio and checkbox option labels in Lightning and in the
 * Studio preview, because those widgets inherit it. The public site's widgets do
 * not inherit: they read their own settings and fall back to the system font. So
 * on the public site only, a form with a brand font typed its answers in Segoe UI
 * or San Francisco.
 *
 * Measured on all three hosts with a custom font on the full kitchen sink: six
 * kinds of text missed the font on the public site (text boxes, text area, the
 * required marker, radio and checkbox option labels), none in Lightning. Setting
 * each candidate to a different font on the widget found the two settings below;
 * both exist on the public site only, so Lightning and the Studio are untouched.
 */
const fs = require('fs');
const path = require('path');

const read = (...parts) =>
    fs
        .readFileSync(path.join(__dirname, ...parts), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

const css = read('..', 'finalElementRenderer.css');
const frame = read('..', '..', 'finalPageFrame', 'finalPageFrame.css');

const flat = (text) => text.replace(/\s+/g, ' ').trim();

/** Declarations of every rule whose selector list contains `selector`. */
function bodiesFor(text, selector) {
    return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) =>
            m[1]
                .split(',')
                .map((s) => flat(s))
                .includes(selector)
        )
        .map((m) => flat(m[2]))
        .join(' ');
}

describe('typed text and option labels follow the form font on the public site', () => {
    it("the field gives typed text the form's body font, beside the size setting it already gives", () => {
        const field = bodiesFor(css, '.field');
        expect(field).toMatch(
            /--dxp-s-form-element-text-font-size:\s*var\(--c-fs-answer\);/
        );
        expect(field).toMatch(
            /--dxp-s-form-element-text-font-family:\s*var\(--c-font-body\);/
        );
    });

    it("and the platform's own label text (option labels, the required marker) too", () => {
        expect(bodiesFor(css, '.field')).toMatch(
            /--dxp-s-form-element-label-font-family:\s*var\(--c-font-body\);/
        );
    });

    it('--c-font-body is the very token our own labels and titles use, so a custom font reaches all of them', () => {
        expect(frame).toMatch(/font-family:\s*var\(--c-font-body\);/);
    });

    it('both are public-site settings (--dxp-*): nothing sets a font-family on a Lightning widget, so the hosts that already follow the font are untouched', () => {
        const families = [
            ...css.matchAll(/(--[a-z0-9-]*font-family)\s*:/gi)
        ].map((m) => m[1]);
        expect(families.sort()).toEqual([
            '--dxp-s-form-element-label-font-family',
            '--dxp-s-form-element-text-font-family'
        ]);
        expect(css).not.toMatch(
            /lightning-[a-z-]+[^{}]*\{[^{}]*[^-]font-family\s*:/
        );
    });
});
