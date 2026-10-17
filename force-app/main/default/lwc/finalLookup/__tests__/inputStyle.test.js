/**
 * The custom lookup follows the form's Input style (owner 2026-10-11, DEFERRED 35;
 * docs/FinalDesign/IMPL_PLAN_LOOKUP_INPUT_STYLE.md).
 *
 * What a person saw, measured on the Studio, Lightning and the public site: the
 * empty box was 40px tall with 4px corners next to 32px text boxes with 8px
 * corners; clicking into it drew a thin black border where a text box draws the
 * accent ring; a chosen record shrank into a small chip; and none of it moved
 * when Advanced design > Fields and Sections changed the Input style. Cause: the
 * stylesheet read tokens the theme engine never writes (--c-field-height, -radius,
 * -ink, -padding, -hover-bg, -readonly-bg, -help-ink, --c-error-ink) so it always
 * painted its hard-coded fallbacks, and it used --c-focus-ring (a GLOW) as if it
 * were a colour, which is invalid there.
 *
 * These tests read the stylesheet as text, because jest has no layout engine:
 * they pin the CONTRACT (which tokens, which rules), and the measured pictures
 * in the plan doc prove the result on the three hosts.
 */
const fs = require('fs');
const path = require('path');

const strip = (text) =>
    text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const read = (...parts) =>
    strip(fs.readFileSync(path.join(__dirname, ...parts), 'utf8'));
const readRaw = (...parts) =>
    fs.readFileSync(path.join(__dirname, ...parts), 'utf8');

const css = read('..', 'finalLookup.css');
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

// Every token somebody actually writes: the theme engine's object keys and the
// page frame's type scale declarations.
const written = new Set([
    ...[
        ...readRaw(
            '..',
            '..',
            'finalThemeEngine',
            'finalThemeEngine.js'
        ).matchAll(/'(--c-[a-z0-9-]+)'/g)
    ].map((m) => m[1]),
    ...[
        ...readRaw('..', '..', 'finalPageFrame', 'finalPageFrame.css').matchAll(
            /(--c-[a-z0-9-]+)\s*:/g
        )
    ].map((m) => m[1])
]);

describe('c-final-lookup follows the Input style', () => {
    it('reads only tokens that something writes (the old stylesheet read eight that nothing does)', () => {
        const used = [...css.matchAll(/var\(\s*(--c-[a-z0-9-]+)/g)].map(
            (m) => m[1]
        );
        const unwritten = [...new Set(used)].filter((t) => !written.has(t));
        expect(unwritten).toEqual([]);
    });

    it('the box takes the same Input style tokens the platform text boxes are given', () => {
        const box = bodiesFor(css, '.fl-input');
        expect(box).toMatch(
            /background:\s*var\(\s*--c-input-bg,\s*var\(--c-field-bg/
        );
        expect(box).toMatch(
            /border:\s*1px solid var\(\s*--c-input-border-color,\s*var\(--c-field-border/
        );
        expect(box).toMatch(
            /border-radius:\s*var\(\s*--c-input-radius,\s*var\(--c-radius/
        );
        expect(box).toMatch(/box-shadow:\s*var\(\s*--c-input-shadow,\s*none\)/);
        expect(box).toMatch(/color:\s*var\(--c-text/);
    });

    it('is as tall as a text box (32px), not 40px', () => {
        expect(bodiesFor(css, '.fl-input')).toMatch(/height:\s*2rem/);
    });

    it('a chosen record is the SAME box as the empty one: one rule styles both, so picking does not change the field', () => {
        const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => {
            const selectors = m[1].split(',').map((s) => flat(s));
            return (
                selectors.includes('.fl-input') &&
                selectors.includes('.fl-pill')
            );
        });
        expect(rule).toBeDefined();
        expect(flat(rule[2])).toMatch(/height:\s*2rem/);
        expect(flat(rule[2])).toMatch(/--c-input-radius/);
    });

    it('focus is the text box focus: the ring shadow of the Input style, never a colour made from a glow', () => {
        const focus = bodiesFor(css, '.fl-input:focus');
        expect(focus).toMatch(
            /box-shadow:\s*var\(\s*--c-input-shadow-focus,\s*var\(--c-focus-ring/
        );
        // a transparent outline still shows in forced-colors (high contrast) mode, where shadows are not drawn
        expect(focus).toMatch(/outline:\s*2px solid transparent/);
        // --c-focus-ring is a box-shadow value ("0 0 0 3px ..."), invalid as an outline or border colour
        expect(css).not.toMatch(/outline:[^;]*var\(--c-focus-ring/);
        expect(css).not.toMatch(/border-color:\s*var\(--c-focus-ring/);
        expect(css).not.toMatch(/border-top-color:\s*var\(--c-focus-ring/);
    });

    it('the clear button gets the ring too (its focus used to be an invalid outline)', () => {
        expect(bodiesFor(css, '.fl-clear:focus-visible')).toMatch(
            /box-shadow:\s*var\(--c-focus-ring/
        );
    });

    it('on a phone the clear button keeps its 28px look but gets a 44px hit area, and the box stays as tall as the text boxes', () => {
        const narrow = css.slice(
            css.indexOf('@container final-form-viewport (max-width: 540px)')
        );
        expect(narrow).toMatch(/\.fl-clear::after\s*\{[^}]*inset:\s*-8px/);
        // 28px + 2 x 8px = 44px; and no rule makes the box itself taller on a narrow form
        expect(bodiesFor(css, '.fl-clear')).toMatch(/width:\s*1\.75rem/);
        expect(narrow).not.toMatch(/\.fl-input\s*\{[^}]*height/);
    });

    it('an invalid field uses the theme error colour for the box and the message', () => {
        expect(
            bodiesFor(css, ".fl-field[data-invalid='true'] .fl-input")
        ).toMatch(/border-color:\s*var\(--c-field-error/);
        expect(
            bodiesFor(css, ".fl-field[data-invalid='true'] .fl-pill")
        ).toMatch(/border-color:\s*var\(--c-field-error/);
        expect(bodiesFor(css, '.fl-error')).toMatch(
            /color:\s*var\(--c-field-error/
        );
    });

    it('the results list is an opaque surface (the field fill is see-through on dark themes), rounded like the Input style but capped', () => {
        const list = bodiesFor(css, '.fl-listbox');
        expect(list).toMatch(/background:\s*#fff/);
        expect(list).not.toMatch(/--c-field-bg|--c-input-bg/);
        expect(list).toMatch(
            /border-radius:\s*min\(\s*var\(\s*--c-input-radius/
        );
        expect(bodiesFor(css, '.fl-opt-active')).toMatch(/color-mix\(/);
    });

    it('read-only is drawn the way a read-only text box is: plain text, no box', () => {
        const ro = bodiesFor(css, ".fl-pill[data-readonly='true']");
        expect(ro).toMatch(/background:\s*transparent/);
        expect(ro).toMatch(/border-color:\s*transparent/);
        expect(ro).toMatch(/box-shadow:\s*none/);
    });
});
