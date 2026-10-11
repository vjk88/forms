/**
 * The 0-10 (NPS) question: centered, balanced rows, labels at the ends
 * (docs/FinalDesign/IMPL_PLAN_NPS_LAYOUT.md).
 *
 * The owner's reference: the buttons centered in the column, wrapping into
 * balanced rows (6 + 5, never 10 + a lone "10"), "Not at all likely" above the 0
 * and "Extremely likely" below the 10.
 *
 * Mechanism, CSS only: the group is a three-row grid (left label, buttons, right
 * label); the end-label container is `display: contents` so its two spans become
 * grid items; the button row is capped to N buttons wide so the browser wraps it
 * after exactly N, and N comes from a ladder keyed on the section's width. These
 * tests pin the structure, the ladder as arithmetic, and that only the 0-10
 * question is touched (rating, opinion scale and emoji share its markup).
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
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
    body: m[2]
}));
const bodiesFor = (selector) =>
    rules
        .filter((r) => r.selectors.includes(selector))
        .map((r) => r.body)
        .join('\n');

// ---- the sizes the ladder is derived from -------------------------------------
// Comfortable density is every theme's default: 44px buttons, 8px gap
// (--c-control-h and --c-space-2). Compact buttons are smaller, so a row sized
// for these always fits.
const BTN = 44;
const GAP = 8;
const widthOf = (n) => n * BTN + (n - 1) * GAP;
const ITEMS = 11; // 0 to 10

/** How a greedy wrap lays out ITEMS buttons when a row holds `perRow`. */
const rowsFor = (perRow) => {
    const rows = [];
    for (let left = ITEMS; left > 0; left -= perRow) {
        rows.push(Math.min(perRow, left));
    }
    return rows;
};

const GROUP = '.scale-group.nps-group';

describe('only the 0-10 question gets the new layout', () => {
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

    it('the 0-10 group carries nps-group', () => {
        const el = mount({ id: 'e1', type: 'nps', label: 'Recommend us?' });
        expect(
            el.shadowRoot.querySelector('.scale-group.nps-group')
        ).not.toBeNull();
    });

    it.each(['rating', 'scale', 'emojiScale'])(
        '%s keeps the plain scale-group',
        (type) => {
            const el = mount({ id: 'e1', type, label: 'Question' });
            expect(el.shadowRoot.querySelector('.scale-group')).not.toBeNull();
            expect(el.shadowRoot.querySelector('.nps-group')).toBeNull();
        }
    );
});

describe('the 0-10 block is centered, with its labels at the ends', () => {
    it('is a three-row grid (left label, buttons, right label), centered in the column', () => {
        const body = bodiesFor(GROUP);
        expect(body).toMatch(/display\s*:\s*grid\s*;/);
        expect(body).toMatch(
            /grid-template-areas\s*:\s*['"]left['"]\s*['"]row['"]\s*['"]right['"]/
        );
        expect(body).toMatch(/align-self\s*:\s*center\s*;/);
    });

    it('the end-label container disappears so its two spans become grid items', () => {
        expect(bodiesFor(`${GROUP} .scale-endlabels`)).toMatch(
            /display\s*:\s*contents\s*;/
        );
    });

    it('the left label sits above the buttons at the left edge, the right label below them at the right edge', () => {
        const left = bodiesFor(`${GROUP} .scale-endlabels > :first-child`);
        const right = bodiesFor(`${GROUP} .scale-endlabels > :last-child`);
        expect(left).toMatch(/grid-area\s*:\s*left\s*;/);
        expect(left).toMatch(/justify-self\s*:\s*start\s*;/);
        expect(right).toMatch(/grid-area\s*:\s*right\s*;/);
        expect(right).toMatch(/justify-self\s*:\s*end\s*;/);
    });

    it('an empty label takes no room', () => {
        expect(bodiesFor(`${GROUP} .scale-endlabels > :empty`)).toMatch(
            /display\s*:\s*none\s*;/
        );
    });

    it('the button row is centered and capped to N buttons wide, so it wraps after exactly N', () => {
        const body = bodiesFor(`${GROUP} .scale-row`);
        expect(body).toMatch(/grid-area\s*:\s*row\s*;/);
        expect(body).toMatch(/justify-content\s*:\s*center\s*;/);
        expect(body).toMatch(/justify-self\s*:\s*center\s*;/);
        // N buttons plus N - 1 gaps, from the same tokens the buttons use
        expect(body).toMatch(
            /max-width\s*:\s*calc\(\s*var\(--nps-n\)\s*\*\s*var\(--c-q-control-h,\s*var\(--c-control-h,\s*44px\)\)\s*\+\s*\(var\(--nps-n\)\s*-\s*1\)\s*\*\s*var\(--c-space-2,\s*6px\)\s*\)/
        );
    });
});

describe('buttons per row follow the width of the section', () => {
    // [N, narrower than] pairs read from the stylesheet: every
    // `@container section (max-width: X) { .scale-group.nps-group { --nps-n: N } }`
    const ladder = [
        ...css.matchAll(
            /@container section \(max-width:\s*([\d.]+)px\)\s*\{\s*\.scale-group\.nps-group\s*\{\s*--nps-n:\s*(\d+)\s*;\s*\}\s*\}/g
        )
    ].map((m) => ({ below: Number(m[1]), n: Number(m[2]) }));

    it('one row by default, then 6, 4 and 3 per row as the section narrows', () => {
        expect(bodiesFor(GROUP)).toMatch(/--nps-n\s*:\s*11\s*;/);
        expect(ladder.map((l) => l.n)).toEqual([6, 4, 3]);
    });

    it('each step starts just below the width the next larger row needs (never asks a row to hold more than fits)', () => {
        // a loop over an empty ladder would pass without checking anything
        expect(ladder).toHaveLength(3);
        const larger = { 6: 11, 4: 6, 3: 4 };
        for (const { below, n } of ladder) {
            expect(below).toBeCloseTo(widthOf(larger[n]) - 0.02, 5);
        }
    });

    it.each([11, 6, 4, 3])(
        'a row of %i wraps the eleven buttons into balanced rows',
        (n) => {
            const rows = rowsFor(n);
            expect(rows.reduce((a, b) => a + b, 0)).toBe(ITEMS);
            expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(
                1
            );
        }
    );

    it('the sizes behind the ladder are the real comfortable density', () => {
        const engine = read(
            '..',
            '..',
            'finalThemeEngine',
            'finalThemeEngine.js'
        );
        const comfortable =
            /comfortable:\s*\{\s*space:\s*\[([^\]]*)\],\s*controlH:\s*'(\d+)px'/.exec(
                engine
            );
        expect(comfortable).not.toBeNull();
        expect(Number(comfortable[2])).toBe(BTN);
        expect(comfortable[1].split(',')[1].trim()).toBe(`'${GAP}px'`);
    });
});
