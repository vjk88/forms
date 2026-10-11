import {
    rowsNeeded,
    scaleRowMax,
    scaleRowPlan,
    applyScaleRowLayout
} from 'c/finalScaleLayout';

/**
 * How a scale row wraps (docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md, S2).
 *
 * Owner 2026-10-11: "why are you taking nps to 6-5 in desktop when there's space
 * to display all options in 1 row". The earlier answer was a ladder of widths
 * written for one button size, so any other size (compact density, a narrow
 * form, the conversational look) broke early. This module measures instead:
 * the real width of every button, the real gap, the real width of the column.
 *
 *   - everything fits on one line  -> no cap, one row, always;
 *   - otherwise the row is capped so the browser wraps into the FEWEST rows,
 *     evened out (11 as 6 + 5, never 10 + a lone one).
 */

const widths = (n, w = 44) => Array.from({ length: n }, () => w);

/** How a greedy wrap lays out the buttons when a row holds `perRow` of them. */
const layout = (count, perRow) => {
    const rows = [];
    for (let left = count; left > 0; left -= perRow) {
        rows.push(Math.min(perRow, left));
    }
    return rows;
};

describe('rowsNeeded: the rows the browser would make with no cap', () => {
    it('one row when everything fits, exactly at the limit too', () => {
        // 11 buttons of 44px and ten 8px gaps need 564px
        expect(rowsNeeded(widths(11), 564, 8)).toBe(1);
        expect(rowsNeeded(widths(11), 563.9, 8)).toBe(2);
    });

    it('counts the widths it is given, not an assumed size', () => {
        // compact density: ten 36px buttons and one 41px "10", six px gaps = 461
        const compact = [...widths(10, 36), 41];
        expect(rowsNeeded(compact, 461, 6)).toBe(1);
        expect(rowsNeeded(compact, 460, 6)).toBe(2);
    });

    it('wraps greedily, like a flex row', () => {
        expect(rowsNeeded(widths(11), 238, 4)).toBe(3); // 4 + 4 + 3 at 48px a button
        expect(rowsNeeded(widths(5), 100, 4)).toBe(3); // 2 + 2 + 1
    });
});

describe('scaleRowMax: the width to cap a wrapping row at (null = no cap)', () => {
    it('is null when everything fits, whatever the button size or gap', () => {
        expect(scaleRowMax(widths(11), 564, 8)).toBeNull();
        expect(scaleRowMax(widths(11, 36), 456, 6)).toBeNull();
        expect(scaleRowMax(widths(5), 236, 4)).toBeNull();
        expect(scaleRowMax(widths(11, 50), 630, 8)).toBeNull();
    });

    it('is null when there is nothing to size (hidden panel, no buttons)', () => {
        expect(scaleRowMax(widths(11), 0, 8)).toBeNull();
        expect(scaleRowMax([], 300, 8)).toBeNull();
        expect(scaleRowMax(widths(5), NaN, 4)).toBeNull();
        expect(scaleRowMax([NaN, 44], 300, 4)).toBeNull();
    });

    it.each([
        // count, buttons, gap, available, expected rows
        [11, 44, 8, 563, [6, 5]],
        [11, 44, 8, 304, [6, 5]],
        [11, 44, 8, 303, [4, 4, 3]],
        [11, 44, 8, 280, [4, 4, 3]],
        [11, 44, 4, 238, [4, 4, 3]],
        [5, 44, 4, 235, [3, 2]],
        [5, 50, 4, 238, [3, 2]],
        [7, 44, 4, 308, [4, 3]],
        [10, 44, 4, 470, [5, 5]]
    ])(
        '%i buttons of %ipx, gap %ipx, in %ipx: rows %j',
        (count, btn, gap, available, expected) => {
            const max = scaleRowMax(widths(count, btn), available, gap);
            // the cap holds exactly the evened-out number of buttons (plus 2px of slack)
            const perRow = expected[0];
            expect(max).toBe(perRow * btn + (perRow - 1) * gap + 2);
            // and a browser wrapping at that cap would make those rows
            const fitsAtCap = Math.floor((max + gap) / (btn + gap));
            expect(fitsAtCap).toBe(perRow);
            expect(layout(count, fitsAtCap)).toEqual(expected);
        }
    );

    // count, button width, gap: the 0-10 at three sizes, then five-, seven- and ten-point scales
    const SHAPES = [
        [11, 44, 8],
        [11, 36, 6],
        [11, 50, 4],
        [5, 44, 4],
        [7, 44, 4],
        [10, 44, 4]
    ];

    it('never caps wider than the column, and never asks a row to hold more than fits', () => {
        const tooWide = [];
        for (let available = 60; available <= 900; available += 1) {
            for (const [count, btn, gap] of SHAPES) {
                const max = scaleRowMax(widths(count, btn), available, gap);
                if (max !== null && max > available + 2) {
                    tooWide.push({ count, btn, gap, available, max });
                }
            }
        }
        expect(tooWide).toEqual([]);
    });

    it('uses the fewest rows and leaves no lone button where that can be avoided', () => {
        const wrong = [];
        for (let available = 100; available <= 900; available += 1) {
            for (const [count, btn, gap] of SHAPES) {
                const max = scaleRowMax(widths(count, btn), available, gap);
                if (max === null) {
                    continue;
                }
                const perRow = Math.floor((max + gap) / (btn + gap));
                const rows = layout(count, perRow);
                // the fewest rows the width allows
                const fit = Math.floor((available + gap) / (btn + gap));
                const fewest = rows.length === Math.ceil(count / fit);
                // a lone last button only when no row length with the same
                // number of rows could avoid it
                const lone = rows[rows.length - 1] === 1;
                const avoidable =
                    lone &&
                    Array.from({ length: fit - 1 }, (_, i) => i + 2).some(
                        (p) => {
                            const alt = layout(count, p);
                            return (
                                alt.length === rows.length &&
                                alt[alt.length - 1] !== 1
                            );
                        }
                    );
                if (!fewest || avoidable) {
                    wrong.push({ count, btn, gap, available, rows });
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it('caps by the widest buttons a row would hold', () => {
        // eleven buttons, one of them 5px wider (the two-digit "10" at compact density)
        const mixed = [...widths(10, 36), 41];
        const max = scaleRowMax(mixed, 300, 6);
        expect(max).not.toBeNull();
        // a window of six buttons that includes the wide one: 5 * 36 + 41 + 5 gaps, plus slack
        expect(max).toBe(5 * 36 + 41 + 5 * 6 + 2);
    });
});

describe('applyScaleRowLayout: measures the real elements and writes the cap', () => {
    const real = window.getComputedStyle.bind(window);
    let styles;

    const px = (n) => `${n}px`;
    /** field > scale-group > scale-row > `count` buttons, as the renderer draws it */
    const make = (count) => {
        const field = document.createElement('div');
        field.className = 'field';
        const group = document.createElement('div');
        group.className = 'scale-group';
        const row = document.createElement('div');
        row.className = 'scale-row';
        for (let i = 0; i < count; i++) {
            row.appendChild(document.createElement('button'));
        }
        group.appendChild(row);
        field.appendChild(group);
        document.body.appendChild(field);
        return { field, row };
    };
    const fake = (node, props) => styles.set(node, props);

    beforeEach(() => {
        styles = new Map();
        window.getComputedStyle = (node) => {
            const mine = styles.get(node);
            return mine ? { boxSizing: 'content-box', ...mine } : real(node);
        };
    });
    afterEach(() => {
        window.getComputedStyle = real;
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const build = (count, btn, gap, available) => {
        const { field, row } = make(count);
        fake(field, {
            width: px(available),
            paddingLeft: '0px',
            paddingRight: '0px'
        });
        fake(row, { columnGap: px(gap) });
        row.querySelectorAll('button').forEach((b) =>
            fake(b, { width: px(btn) })
        );
        return { field, row };
    };

    it('writes --scale-row-max when the row has to wrap', () => {
        const { field, row } = build(11, 44, 4, 238);
        applyScaleRowLayout(field);
        // four per row: 4 * 44 + 3 * 4 + 2
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('190px');
    });

    it('removes it again when everything fits (a wider column, a smaller button)', () => {
        const { field, row } = build(11, 44, 4, 238);
        applyScaleRowLayout(field);
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('190px');
        fake(field, {
            width: px(600),
            paddingLeft: '0px',
            paddingRight: '0px'
        });
        applyScaleRowLayout(field);
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('');
    });

    it('takes the field padding and border off a border-box column', () => {
        const { field, row } = build(5, 44, 4, 250);
        fake(field, {
            width: px(250),
            boxSizing: 'border-box',
            paddingLeft: '8px',
            paddingRight: '8px',
            borderLeftWidth: '1px',
            borderRightWidth: '1px'
        });
        applyScaleRowLayout(field);
        // 250 - 18 = 232 < 236, so five buttons wrap (3 + 2)
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('142px');
    });

    it('leaves a hidden column alone (no width yet)', () => {
        const { field, row } = build(11, 44, 4, 0);
        row.style.setProperty('--scale-row-max', '99px');
        applyScaleRowLayout(field);
        expect(row.style.getPropertyValue('--scale-row-max')).toBe('');
    });

    it('does nothing for a field without a scale row', () => {
        const field = document.createElement('div');
        field.className = 'field';
        field.appendChild(document.createElement('p'));
        document.body.appendChild(field);
        expect(() => applyScaleRowLayout(field)).not.toThrow();
        expect(() => applyScaleRowLayout(null)).not.toThrow();
    });
});

describe('scaleRowPlan: squeeze the gaps a little before giving up on one row', () => {
    // Owner 2026-10-11: the 0-10 question showed 6 + 5 in a One at a time column of
    // 560px, where eleven comfortable buttons (44px, 8px gaps) need 564px: 4px short.
    // Gaps may shrink from the density's gap down to 6px (never below the phone's
    // 4px, and never wider than they started) to keep one row.
    it('keeps one row by shrinking the gaps when that is all it takes', () => {
        const plan = scaleRowPlan(widths(11), 560, 8);
        expect(plan.max).toBeNull();
        // (560 - 11 * 44 - 1px of slack) / 10 gaps
        expect(plan.gap).toBe(7.5);
        // eleven buttons and ten gaps really fit
        expect(11 * 44 + 10 * plan.gap).toBeLessThanOrEqual(560);
    });

    it('changes nothing when everything already fits at the normal gap', () => {
        expect(scaleRowPlan(widths(11), 564, 8)).toEqual({
            max: null,
            gap: null
        });
        expect(scaleRowPlan(widths(11), 900, 8)).toEqual({
            max: null,
            gap: null
        });
    });

    it('stops at 6px: a narrower column wraps into balanced rows as before', () => {
        // eleven buttons with 6px gaps need 544px, plus a pixel of slack
        expect(scaleRowPlan(widths(11), 545, 8).gap).toBe(6);
        const wrapped = scaleRowPlan(widths(11), 544, 8);
        expect(wrapped.gap).toBeNull();
        expect(wrapped.max).toBe(6 * 44 + 5 * 8 + 2);
    });

    it('never squeezes a gap that is already 6px or less (compact density, a phone)', () => {
        expect(scaleRowPlan(widths(11, 36), 455, 6).gap).toBeNull();
        expect(scaleRowPlan(widths(11, 36), 455, 6).max).not.toBeNull();
        expect(scaleRowPlan(widths(5), 235, 4).gap).toBeNull();
        expect(scaleRowPlan(widths(5), 235, 4).max).not.toBeNull();
    });

    it('is always one or the other, a gap never wider than the normal one, and always fits', () => {
        const wrong = [];
        for (let available = 100; available <= 900; available += 1) {
            for (const [count, btn, gap] of [
                [11, 44, 8],
                [11, 36, 6],
                [11, 50, 8],
                [5, 44, 8],
                [7, 44, 4],
                [10, 44, 8]
            ]) {
                const w = widths(count, btn);
                const { max, gap: squeezed } = scaleRowPlan(w, available, gap);
                const both = max !== null && squeezed !== null;
                const tooWide = squeezed !== null && squeezed > gap;
                const tooTight =
                    squeezed !== null && squeezed < Math.min(gap, 6);
                const overflows =
                    squeezed !== null &&
                    count * btn + (count - 1) * squeezed > available;
                if (both || tooWide || tooTight || overflows) {
                    wrong.push({ count, btn, gap, available, max, squeezed });
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it('measures the nominal gap, not one it wrote earlier', () => {
        const real = window.getComputedStyle.bind(window);
        const field = document.createElement('div');
        field.className = 'field';
        const row = document.createElement('div');
        row.className = 'scale-row';
        const group = document.createElement('div');
        group.appendChild(row);
        field.appendChild(group);
        for (let i = 0; i < 11; i++) {
            row.appendChild(document.createElement('button'));
        }
        document.body.appendChild(field);
        // a column that only fits with squeezed gaps; the row's gap follows the
        // custom property it was given, like the stylesheet does
        window.getComputedStyle = (node) => {
            if (node === field) {
                return {
                    width: '560px',
                    boxSizing: 'content-box',
                    paddingLeft: '0px',
                    paddingRight: '0px'
                };
            }
            if (node === row) {
                return {
                    columnGap:
                        row.style.getPropertyValue('--scale-row-gap') || '8px'
                };
            }
            if (node.parentNode === row) {
                return { width: '44px' };
            }
            return real(node);
        };
        try {
            applyScaleRowLayout(field);
            expect(row.style.getPropertyValue('--scale-row-gap')).toBe('7.5px');
            // a second pass (a re-render, a resize) must read 8px again, not 7.5px
            applyScaleRowLayout(field);
            expect(row.style.getPropertyValue('--scale-row-gap')).toBe('7.5px');
            expect(row.style.getPropertyValue('--scale-row-max')).toBe('');
        } finally {
            window.getComputedStyle = real;
            document.body.removeChild(field);
        }
    });
});
