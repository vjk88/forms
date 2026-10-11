/**
 * Our own controls on a phone (docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md, slice S2).
 *
 * On a narrow form (540px wide or less):
 *   - every control that reads the density height is at least 44px, even at the
 *     compact density (the page frame lifts --c-control-h; nothing else changes);
 *   - the gap between scale buttons is 4px (--c-scale-gap), so five 44px buttons
 *     fit the 238px answer column of a 320px phone;
 *   - controls with a fixed size of their own (ranking arrows, the slider, the
 *     emoji faces) are 44px too;
 *   - a scale that does not fit on one line wraps into rows that never end in a
 *     lone button (5 as 3 + 2, 7 as 4 + 3, 10 as 5 + 5), by the same
 *     capped-row mechanism as the 0-10 question.
 * Everything is read from the real stylesheets; wide forms are checked to be
 * untouched.
 */
import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

const fs = require('fs');
const path = require('path');

const read = (...parts) =>
    fs
        .readFileSync(path.join(__dirname, ...parts), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

const css = read('..', 'finalElementRenderer.css');
const frame = read('..', '..', 'finalPageFrame', 'finalPageFrame.css');
const engine = read('..', '..', 'finalThemeEngine', 'finalThemeEngine.js');

const NARROW = '@container final-form-viewport (max-width: 540px)';

/** Brace-matched bodies of every block that starts with `header`. */
function blocksOf(text, header) {
    const bodies = [];
    let from = text.indexOf(header);
    while (from >= 0) {
        const open = text.indexOf('{', from);
        let depth = 0;
        let i = open;
        for (; i < text.length; i++) {
            if (text[i] === '{') {
                depth++;
            } else if (text[i] === '}') {
                depth--;
                if (depth === 0) {
                    break;
                }
            }
        }
        bodies.push(text.slice(open + 1, i));
        from = text.indexOf(header, i);
    }
    return bodies;
}

const flat = (text) => text.replace(/\s+/g, ' ').trim();

/** Declarations of every rule inside `text` whose selector list contains `selector`. */
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

const narrowFrame = blocksOf(frame, NARROW).join('\n');
const narrowRenderer = blocksOf(css, NARROW).join('\n');
const wideRenderer = blocksOf(css, NARROW).reduce(
    (text, body) => text.replace(body, ''),
    css
);

describe('the page frame lifts the density height and the scale gap on a narrow form', () => {
    it('the narrow .page sets --c-control-h to 44px and --c-scale-gap to 4px', () => {
        const page = bodiesFor(narrowFrame, '.page');
        expect(page).toMatch(/--c-control-h:\s*44px;/);
        expect(page).toMatch(/--c-scale-gap:\s*4px;/);
    });

    it('wide forms never meet --c-scale-gap (every reader has the density gap as its fallback)', () => {
        const rest = blocksOf(frame, NARROW).reduce(
            (text, body) => text.replace(body, ''),
            frame
        );
        expect(rest).not.toContain('--c-scale-gap');
    });

    it('44px is a floor, not a ceiling: no density is taller than 44px (else the narrow rule would shrink it)', () => {
        const heights = [...engine.matchAll(/controlH:\s*'(\d+)px'/g)].map(
            (m) => Number(m[1])
        );
        expect(heights.length).toBeGreaterThan(0);
        expect(Math.max(...heights)).toBeLessThanOrEqual(44);
    });
});

describe('controls with a size of their own are 44px on a narrow form', () => {
    it('the ranking arrows', () => {
        const body = bodiesFor(narrowRenderer, '.rank-btn');
        expect(body).toMatch(/min-width:\s*44px;/);
        expect(body).toMatch(/height:\s*44px;/);
    });

    it('the slider has a 44px touch target (the track is still drawn thin)', () => {
        expect(bodiesFor(narrowRenderer, '.slider-input')).toMatch(
            /height:\s*44px;/
        );
    });

    it('the emoji faces shrink a little so five fit one row at 44px wide', () => {
        const body = bodiesFor(narrowRenderer, '.scale-chip.emoji-chip');
        expect(body).toMatch(/padding:\s*4px 0;/);
        expect(body).toMatch(
            /font-size:\s*calc\(var\(--c-fs-answer\)\s*\*\s*1\.75\);/
        );
    });

    it('and wide forms keep the sizes they have today', () => {
        expect(bodiesFor(wideRenderer, '.rank-btn')).toMatch(
            /min-width:\s*34px;[\s\S]*height:\s*34px;/
        );
        expect(bodiesFor(wideRenderer, '.slider-input')).toMatch(
            /height:\s*30px;/
        );
    });
});

describe('every scale row uses the scale gap and a per-row cap', () => {
    it('the gap between buttons is --c-scale-gap, falling back to the density gap', () => {
        expect(bodiesFor(css, '.scale-row')).toMatch(
            /gap:\s*var\(--c-scale-gap,\s*var\(--c-space-2,\s*6px\)\);/
        );
    });

    it('the row is capped to N buttons wide (N buttons and N - 1 gaps, from the tokens the buttons use)', () => {
        expect(bodiesFor(css, '.scale-group .scale-row')).toMatch(
            /max-width:\s*calc\(\s*var\(--scale-per-row\)\s*\*\s*var\(--c-q-control-h,\s*var\(--c-control-h,\s*44px\)\)\s*\+\s*\(var\(--scale-per-row\)\s*-\s*1\)\s*\*\s*var\(--c-scale-gap,\s*var\(--c-space-2,\s*6px\)\)\s*\)/
        );
    });

    it('an unset N has NO fallback, so the declaration is invalid and max-width stays none (a wide form computes exactly as before)', () => {
        const body = bodiesFor(css, '.scale-group .scale-row');
        expect(body).not.toMatch(/var\(--scale-per-row\s*,/);
    });
});

describe('a scale that does not fit one line wraps without a lone button', () => {
    // the phone gap and the two button sizes (standard 44px; conversational 44 + 6)
    const GAP = 4;
    const STD = 44;
    const CONVO = 50;
    const fit = (n, btn) => n * btn + (n - 1) * GAP;
    /** How a greedy wrap lays out `n` buttons when a row holds `perRow`. */
    const rowsFor = (n, perRow) => {
        const rows = [];
        for (let left = n; left > 0; left -= perRow) {
            rows.push(Math.min(perRow, left));
        }
        return rows;
    };
    /** per row, by size of scale (rating 5 / 10, opinion 5 / 7, emoji 5) */
    const FAMILIES = { 5: 3, 7: 4, 10: 5 };

    const ladderOf = (name) =>
        [
            ...css.matchAll(
                new RegExp(
                    `@container ${name} \\(max-width:\\s*([\\d.]+)px\\)\\s*\\{\\s*\\.scale-group\\.scale-n-(\\d+)\\s*\\{\\s*--scale-per-row:\\s*(\\d+)\\s*;\\s*\\}\\s*\\}`,
                    'g'
                )
            )
        ].map((m) => ({
            below: Number(m[1]),
            size: Number(m[2]),
            per: Number(m[3])
        }));

    it.each([
        ['section', STD],
        ['convo', CONVO]
    ])(
        'the %s ladder: one row when it fits, below that the balanced split',
        (name, btn) => {
            const ladder = ladderOf(name);
            expect(ladder.map((l) => l.size)).toEqual([5, 7, 10]);
            ladder.forEach(({ below, size, per }) => {
                // starts just below the width a single row needs
                expect(below).toBeCloseTo(fit(size, btn) - 0.02, 5);
                expect(per).toBe(FAMILIES[size]);
            });
        }
    );

    it.each(Object.entries(FAMILIES))(
        'a scale of %s buttons at %s per row has no lone button',
        (size, per) => {
            const rows = rowsFor(Number(size), Number(per));
            expect(rows.reduce((a, b) => a + b, 0)).toBe(Number(size));
            expect(Math.min(...rows)).toBeGreaterThanOrEqual(2);
        }
    );

    it('the conversational ladders come after the standard ones, so they win inside a conversational section', () => {
        expect(css.indexOf('@container convo')).toBeGreaterThan(
            css.lastIndexOf('@container section')
        );
    });

    it('the arithmetic at the real phone widths: 238 / 252 / 278 / 308px', () => {
        // standard buttons: five fit one row from 236px, so every public phone
        // width (238, 278, 308) and Lightning (252, 282) shows one row
        [238, 252, 278, 308].forEach((w) => {
            expect(w).toBeGreaterThanOrEqual(fit(5, STD));
        });
        // conversational buttons: 266px needed, so the 320px phone (238px) wraps
        // 3 + 2 by the ladder instead of 4 + a lone one
        expect(238).toBeLessThan(fit(5, CONVO));
        expect(rowsFor(5, FAMILIES[5])).toEqual([3, 2]);
        expect(rowsFor(5, Math.floor((238 + GAP) / (CONVO + GAP)))).toEqual([
            4, 1
        ]);
    });
});

describe('the scale groups carry their size, so the ladder can pick the right row', () => {
    const mount = (element) => {
        const el = createElement('c-final-element-renderer', {
            is: FinalElementRenderer
        });
        el.element = element;
        document.body.appendChild(el);
        return el;
    };
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it.each([
        [{ type: 'rating' }, 'scale-n-5'],
        [{ type: 'rating', config: { max: 10 } }, 'scale-n-10'],
        [{ type: 'scale' }, 'scale-n-5'],
        [{ type: 'scale', config: { size: 7 } }, 'scale-n-7'],
        [{ type: 'emojiScale' }, 'scale-n-5'],
        [{ type: 'nps' }, 'scale-n-11']
    ])('%j -> %s', (partial, expected) => {
        const el = mount({ id: 'e1', label: 'Question', ...partial });
        const group = el.shadowRoot.querySelector('.scale-group');
        expect(group.classList.contains(expected)).toBe(true);
    });
});
