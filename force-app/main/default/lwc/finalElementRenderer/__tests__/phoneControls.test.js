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
 *   - every scale (rating, opinion scale, emoji faces, like the 0-10 question)
 *     is centered: the block in the column, its rows centered, the left label
 *     above the first button and the right label below the last.
 * Everything is read from the real stylesheets; wide forms are checked to be
 * untouched. How a scale wraps is measured, not styled: see finalScaleLayout.
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

describe('every scale row uses the scale gap', () => {
    it('the gap between buttons is --c-scale-gap, falling back to the density gap', () => {
        expect(bodiesFor(css, '.scale-row')).toMatch(
            /gap:\s*var\(--c-scale-gap,\s*var\(--c-space-2,\s*6px\)\);/
        );
    });
});

describe('every scale is centered like the 0-10 question on a narrow form (owner 2026-10-11)', () => {
    const ZERO_TO_TEN = '.scale-group.nps-group';
    const ALL = '.scale-group';
    // the five rules that make the 0-10 look, as [0-10 selector suffix, narrow suffix]
    const PARTS = [
        ['', ''],
        [' .scale-row', ' .scale-row'],
        [' .scale-endlabels', ' .scale-endlabels'],
        [
            ' .scale-endlabels > :first-child',
            ' .scale-endlabels > :first-child'
        ],
        [' .scale-endlabels > :last-child', ' .scale-endlabels > :last-child'],
        [' .scale-endlabels > :empty', ' .scale-endlabels > :empty']
    ];

    it('the narrow-form block gives EVERY scale group the 0-10 look: the same declarations, rule for rule', () => {
        PARTS.forEach(([zero, all]) => {
            const wanted = bodiesFor(wideRenderer, `${ZERO_TO_TEN}${zero}`);
            const got = bodiesFor(narrowRenderer, `${ALL}${all}`);
            expect(wanted).not.toBe('');
            expect(got).toBe(wanted);
        });
    });

    it('so the block is a centered three-row grid, the row is centered, the end labels sit at the ends', () => {
        const group = bodiesFor(narrowRenderer, ALL);
        expect(group).toMatch(/display:\s*grid;/);
        expect(group).toMatch(/align-self:\s*center;/);
        const row = bodiesFor(narrowRenderer, `${ALL} .scale-row`);
        expect(row).toMatch(/justify-content:\s*center;/);
        expect(row).toMatch(/justify-self:\s*center;/);
    });

    it('wide forms keep rating, opinion scale and emoji where they are (left, labels under the row)', () => {
        expect(bodiesFor(wideRenderer, '.scale-group')).toMatch(
            /display:\s*flex;[\s\S]*align-self:\s*var\(--c-q-justify,\s*flex-start\);/
        );
        expect(bodiesFor(wideRenderer, '.scale-group .scale-row')).not.toMatch(
            /justify-self|grid-area/
        );
    });
});
