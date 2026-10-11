/**
 * finalScaleLayout: how a scale row (0-10, rating, opinion scale, emoji faces)
 * wraps. docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md, slice S2.
 *
 * Everything fits on one line -> the row is left alone, so one row, always.
 * Otherwise the row is capped so the browser wraps it into the FEWEST rows,
 * evened out (11 buttons as 6 + 5, never 10 + a lone one).
 *
 * It measures, it does not assume. An earlier version picked buttons-per-row from
 * a ladder of widths written for one button size, so any other size (compact
 * density, a phone's 4px gap, the conversational look's bigger buttons) wrapped
 * early and showed 6 + 5 where all eleven would have fitted. Here the inputs are
 * the real width of every button, the real gap and the real width of the column.
 *
 * The cap is written as --scale-row-max on the row (finalElementRenderer.css
 * turns it into max-width). No cap = the property is removed = max-width: none.
 */

/** A hair of room so a button never wraps for want of a sub-pixel. A button is
 *  never narrower than 36px, so this can never let one more button in. */
const SLACK = 2;

/**
 * How many rows a flex row would make with no cap: buttons are placed greedily
 * until the next one no longer fits.
 * @param {number[]} widths width of each button
 * @param {number} available width of the column
 * @param {number} gap space between buttons
 */
export function rowsNeeded(widths, available, gap) {
    let rows = 1;
    let used = 0;
    for (const w of widths) {
        const next = used === 0 ? w : used + gap + w;
        if (used > 0 && next > available) {
            rows++;
            used = w;
        } else {
            used = next;
        }
    }
    return rows;
}

/**
 * The width to cap a wrapping row at, or null when no cap is wanted
 * (everything fits on one line, or there is nothing to size yet).
 * @param {number[]} widths width of each button
 * @param {number} available width of the column
 * @param {number} gap space between buttons
 * @returns {number|null}
 */
export function scaleRowMax(widths, available, gap) {
    const count = widths.length;
    if (!count || !(available > 0) || widths.some((w) => !(w > 0))) {
        return null;
    }
    const rows = rowsNeeded(widths, available, gap);
    if (rows <= 1) {
        return null;
    }
    // the same number of rows, evened out
    const perRow = Math.ceil(count / rows);
    // the widest run of that many buttons (a two-digit "10" can be wider than
    // the rest), plus the gaps between them
    let widest = 0;
    for (let start = 0; start + perRow <= count; start++) {
        let sum = 0;
        for (let i = start; i < start + perRow; i++) {
            sum += widths[i];
        }
        widest = Math.max(widest, sum);
    }
    return widest + (perRow - 1) * gap + SLACK;
}

const px = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : NaN;
};

/** The width the buttons can use: a column's content width, whatever its box-sizing. */
function contentWidth(node) {
    const cs = window.getComputedStyle(node);
    const width = px(cs.width);
    if (cs.boxSizing !== 'border-box') {
        return width;
    }
    const edge = (name) => px(cs[name]) || 0;
    return (
        width -
        edge('paddingLeft') -
        edge('paddingRight') -
        edge('borderLeftWidth') -
        edge('borderRightWidth')
    );
}

/**
 * Measures the scale row inside `field` and writes (or removes) its cap. Widths
 * come from computed style, not getBoundingClientRect: that ignores a button's
 * hover and selected transforms and the Studio preview's scale, so the buttons,
 * the gap and the column are always in the same layout pixels.
 * @param {HTMLElement|null} field the element that wraps the scale (its width is
 *   the column; it is sized by the grid, never by the buttons)
 */
export function applyScaleRowLayout(field) {
    const row = field && field.querySelector('.scale-row');
    if (!row) {
        return;
    }
    const widths = Array.from(row.children).map((button) =>
        px(window.getComputedStyle(button).width)
    );
    const gap = px(window.getComputedStyle(row).columnGap) || 0;
    const max = scaleRowMax(widths, contentWidth(field), gap);
    if (max === null) {
        row.style.removeProperty('--scale-row-max');
    } else {
        row.style.setProperty(
            '--scale-row-max',
            `${Math.ceil(max * 10) / 10}px`
        );
    }
}
