/**
 * Immersive full-bleed with Pane side Right. The pane's `order: 2` puts the
 * FORM in the first grid track, so the track that grows to fit an explicit
 * Max content width has to move with it. Before this, Right gave the wide
 * track to the brand pane (Full: pane 60%, form 40%), and Right + One-third
 * applied the ratio that full-bleed ignores on the Left.
 *
 * jsdom has no grid layout, so this reads the stylesheet: the browser check
 * is the 1280px render at Left/Right x Wide/Full/default (same widths).
 */
const fs = require('fs');
const path = require('path');

const css = fs
    .readFileSync(path.join(__dirname, '..', 'finalNavSplitHero.css'), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
// top-level rules only: the narrow @container block is skipped by [^{}]
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m, index) => ({
    index,
    selector: m[1].replace(/\s+/g, ' ').trim(),
    body: m[2].replace(/\s+/g, ' ').trim()
}));
const rule = (selector) => rules.find((r) => r.selector === selector);
const columns = (r) =>
    (r.body.match(/grid-template-columns: ([^;]+);/) || [])[1];

describe('full-bleed Split grid tracks', () => {
    it('Left: the form (second track) is the one that grows', () => {
        expect(columns(rule('.mode-bleed'))).toBe(
            'minmax(0, 1fr) var(--bleed-form-track)'
        );
    });

    it('Right: the growing track moves first, with the form', () => {
        expect(columns(rule('.mode-bleed.side-right'))).toBe(
            'var(--bleed-form-track) minmax(0, 1fr)'
        );
        expect(rule('.side-right .pane').body).toContain('order: 2');
    });

    it('Right wins over every carded side/ratio rule, so Pane width stays ignored', () => {
        const bleedRight = rule('.mode-bleed.side-right').index;
        ['.ratio-third', '.side-right', '.side-right.ratio-third'].forEach(
            (s) => expect(rule(s).index).toBeLessThan(bleedRight)
        );
    });
});
