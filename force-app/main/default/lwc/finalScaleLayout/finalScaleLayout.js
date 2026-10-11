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
 * Before giving up on one row it squeezes the gaps a little (never below 6px, or
 * the density's own gap if that is smaller): eleven comfortable buttons need 564px
 * with 8px gaps, and a One at a time column is 560px, so 4px short used to mean
 * 6 + 5 on a wide screen. In the conversational look, whose buttons are 6px bigger
 * (50px), it then shrinks them back to the standard size: eleven of them need
 * 630px, which no One at a time column offers, and one row matters more than 6px.
 * That step is tried and MEASURED, never assumed: the rating's stars do not follow
 * the conversational size, so a plan that counted on them shrinking would leave a
 * lone star.
 *
 * The cap is written as --scale-row-max on the row (finalElementRenderer.css
 * turns it into max-width), a squeezed gap as --scale-row-gap and the shrink as
 * --c-q-control-h. No cap = the property is removed = max-width: none.
 */

/** A hair of room so a button never wraps for want of a sub-pixel. A button is
 *  never narrower than 36px, so this can never let one more button in. */
const SLACK = 2;

/** The smallest gap a row will squeeze to rather than wrap. A gap that is already
 *  smaller (compact density, a phone's 4px) is left alone. */
const MIN_SQUEEZED_GAP = 6;

/** Room kept when the gaps are squeezed so the last button never wraps for want
 *  of a sub-pixel. */
const SQUEEZE_SLACK = 1;

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

/**
 * What to do with a scale row: nothing (everything fits), squeeze its gaps (it
 * fits with gaps no smaller than 6px), or cap it so it wraps into balanced rows.
 * @param {number[]} widths width of each button
 * @param {number} available width of the column
 * @param {number} gap the density's gap between buttons
 * @returns {{max: number|null, gap: number|null}} at most one of them is set
 */
export function scaleRowPlan(widths, available, gap) {
    const none = { max: null, gap: null };
    const count = widths.length;
    if (!count || !(available > 0) || widths.some((w) => !(w > 0))) {
        return none;
    }
    if (rowsNeeded(widths, available, gap) <= 1) {
        return none;
    }
    if (count > 1) {
        const floor = Math.min(gap, MIN_SQUEEZED_GAP);
        const total = widths.reduce((sum, w) => sum + w, 0);
        const room = (available - SQUEEZE_SLACK - total) / (count - 1);
        // the largest gap that fits, to a tenth of a pixel, never above the normal one
        const squeezed = Math.min(gap, Math.floor(room * 10) / 10);
        if (squeezed >= floor) {
            return { max: null, gap: squeezed };
        }
    }
    return { max: scaleRowMax(widths, available, gap), gap: null };
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
    // measure the row as the density draws it: its gap and its buttons, not what
    // an earlier pass wrote
    row.style.removeProperty('--scale-row-gap');
    row.style.removeProperty('--c-q-control-h');
    const available = contentWidth(field);
    const measure = () => ({
        widths: Array.from(row.children).map((button) =>
            px(window.getComputedStyle(button).width)
        ),
        gap: px(window.getComputedStyle(row).columnGap) || 0
    });
    let { widths, gap } = measure();
    let plan = scaleRowPlan(widths, available, gap);
    if (plan.max !== null) {
        // Still has to wrap. The conversational look makes its buttons 6px bigger
        // (--c-q-control-h); try the standard size and KEEP it only if the buttons
        // really got smaller and then fit. It is measured, not assumed: some
        // buttons (the rating's stars) do not follow that size at all.
        row.style.setProperty('--c-q-control-h', 'var(--c-control-h, 44px)');
        const smaller = measure();
        const shrank = smaller.widths.some((w, i) => w < widths[i] - 0.5);
        const smallerPlan = shrank
            ? scaleRowPlan(smaller.widths, available, smaller.gap)
            : plan;
        if (shrank && smallerPlan.max === null) {
            plan = smallerPlan;
            widths = smaller.widths;
            gap = smaller.gap;
        } else {
            row.style.removeProperty('--c-q-control-h');
        }
    }
    write(row, '--scale-row-max', plan.max, Math.ceil);
    write(row, '--scale-row-gap', plan.gap, Math.floor);
}

/** Writes a pixel custom property to a tenth of a pixel, rounded the safe way. */
function write(row, name, value, round) {
    if (value === null) {
        row.style.removeProperty(name);
    } else {
        row.style.setProperty(name, `${round(value * 10) / 10}px`);
    }
}
