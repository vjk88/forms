/**
 * finalDesignArt: the small drawings on Design's picture tiles
 * (IMPL_PLAN_STUDIO_DESIGN_SCALE step 4, DESIGN_SYSTEM 5.24).
 *
 * `designArt(key, value, ctx)` returns a drawing for one option of one
 * Design setting, or null when that setting has no picture:
 *   { viewBox, shapes: [{ t: 'rect' | 'circle' | 'path', ...attrs, c }] }
 * `c` is a class finalPictureChoice styles from the Studio tokens:
 *   pa-paper  a page or field: surface fill, strong border
 *   pa-fill   a grey block (an image, a pane, an unused step)
 *   pa-ink    a solid mark in the tile's ink (accent when chosen)
 *   pa-line   an outline in the tile's ink
 *   pa-accent a solid mark in the Studio accent
 *   pa-soft   a tinted block: accent surface, accent edge
 *   pa-dash   a dashed outline ("whatever the layout does")
 * A shape may carry `fill` (a real color, e.g. a mesh blob).
 *
 * Pure data, no DOM: the stored values never change, only how they're shown.
 */

const BOX = '0 0 56 36';

/** The settings that are picked by picture. */
export const PICTURE_KEYS = [
    'pageFit',
    'pageRadius',
    'radius',
    'mesh',
    'texture',
    'density',
    'paneSide',
    'paneRatio',
    'heroProgress',
    'stepperMode',
    'stepperNarrow',
    'tabStyle',
    'tabAlignment',
    'railSide',
    'buttonArrangement'
];

/** Strengths stay a switch (Subtle / Medium / Strong), never pictures. */
export const SWITCH_KEYS = ['meshIntensity', 'textureIntensity'];

const r = (x, y, width, height, c, rx = 0, extra = {}) => ({
    t: 'rect',
    x,
    y,
    width,
    height,
    rx,
    c,
    ...extra
});
const dot = (cx, cy, rr, c, extra = {}) => ({
    t: 'circle',
    cx,
    cy,
    r: rr,
    c,
    ...extra
});
const p = (d, c) => ({ t: 'path', d, c });

const page = () => r(2, 2, 52, 32, 'pa-paper', 3);
const text = (x, y, w) => r(x, y, w, 2.5, 'pa-fill', 1.25);

/** A little photo: grey block, a sun and a hill. */
function photo(x, y, w, h) {
    return [
        r(x, y, w, h, 'pa-fill', 1.5),
        dot(x + w * 0.72, y + h * 0.3, Math.max(1.2, h * 0.12), 'pa-ink'),
        p(
            `M${x} ${y + h}L${x + w * 0.38} ${y + h * 0.45}L${x + w * 0.62} ${y + h * 0.75}L${x + w} ${y + h * 0.4}V${y + h}Z`,
            'pa-ink'
        )
    ];
}

const RADIUS_PX = {
    '': 0,
    sharp: 0,
    xs: 1.5,
    soft: 3,
    md: 4.5,
    round: 6,
    lg: 7.5,
    xl: 9,
    pill: 11
};

function radius(value) {
    return [r(8, 7, 40, 22, 'pa-line', RADIUS_PX[value] ?? 3)];
}

function pageFit(value) {
    if (value === 'contain') {
        return [page(), ...photo(17, 6, 22, 24)];
    }
    if (value === 'tile') {
        return [
            page(),
            ...photo(4, 4, 23, 13),
            ...photo(29, 4, 23, 13),
            ...photo(4, 19, 23, 13),
            ...photo(29, 19, 23, 13)
        ];
    }
    return [page(), ...photo(2, 2, 52, 32)];
}

function mesh(value, ctx) {
    const colors =
        value === 'custom'
            ? ctx.customMesh && ctx.customMesh.length
                ? ctx.customMesh
                : []
            : ctx.meshSeeds[value] || [];
    if (!colors.length && value !== 'custom') {
        return [page()];
    }
    const spots = [
        [12, 10, 11],
        [44, 9, 10],
        [22, 30, 11],
        [42, 30, 8]
    ];
    const blobs = colors.slice(0, 4).map((color, i) =>
        dot(spots[i][0], spots[i][1], spots[i][2], 'pa-blob', {
            fill: color
        })
    );
    // custom with no colors yet: dashed blobs say "your colors go here"
    const empty = colors.length
        ? []
        : spots
              .slice(0, 3)
              .map(([cx, cy, rr]) => dot(cx, cy, rr - 2, 'pa-dash'));
    return [page(), ...blobs, ...empty, r(2, 2, 52, 32, 'pa-frame', 3)];
}

function texture(value) {
    const out = [page()];
    if (value === 'dots') {
        for (let y = 8; y <= 28; y += 6) {
            for (let x = 8; x <= 48; x += 6) {
                out.push(dot(x, y, 0.9, 'pa-ink'));
            }
        }
    } else if (value === 'grid') {
        let d = '';
        for (let x = 9; x < 54; x += 7) d += `M${x} 2V34`;
        for (let y = 9; y < 34; y += 7) d += `M2 ${y}H54`;
        out.push(p(d, 'pa-hair'));
    } else if (value === 'grain') {
        const pts = [
            [7, 6],
            [15, 11],
            [24, 5],
            [31, 14],
            [40, 7],
            [49, 12],
            [10, 19],
            [19, 24],
            [28, 20],
            [37, 27],
            [46, 21],
            [6, 29],
            [16, 31],
            [25, 29],
            [34, 22],
            [44, 30],
            [51, 26],
            [21, 15],
            [12, 25],
            [39, 17]
        ];
        pts.forEach(([x, y]) => out.push(dot(x, y, 0.7, 'pa-ink')));
    }
    return out;
}

function density(value) {
    if (value === 'compact') {
        return [
            text(6, 5, 18),
            r(6, 9, 44, 6, 'pa-paper', 1.5),
            text(6, 18, 18),
            r(6, 22, 44, 6, 'pa-paper', 1.5)
        ];
    }
    return [
        text(6, 2, 18),
        r(6, 7, 44, 9, 'pa-paper', 2),
        text(6, 21, 18),
        r(6, 26, 44, 8, 'pa-paper', 2)
    ];
}

/** A split: the brand pane and the form side by side. */
function split(side, ratio) {
    const paneW = ratio === 'third' ? 17 : 26;
    const paneX = side === 'right' ? 54 - paneW : 2;
    const formX = side === 'right' ? 6 : paneX + paneW + 4;
    const formW = 52 - paneW - 8;
    return [
        page(),
        r(paneX, 2, paneW, 32, 'pa-soft', 3),
        text(formX, 8, formW * 0.6),
        r(formX, 12, formW, 5, 'pa-paper', 1.5),
        text(formX, 21, formW * 0.6),
        r(formX, 25, formW, 5, 'pa-paper', 1.5)
    ];
}

function heroProgress(value) {
    const out = [
        r(2, 2, 52, 32, 'pa-soft', 3),
        text(8, 9, 24),
        text(8, 14, 16)
    ];
    if (value === 'horizontal') {
        out.push(
            r(8, 26, 40, 3, 'pa-fill', 1.5),
            r(8, 26, 18, 3, 'pa-accent', 1.5)
        );
    } else if (value !== 'none') {
        out.push(
            dot(10, 27.5, 2, 'pa-accent'),
            dot(17, 27.5, 2, 'pa-fill'),
            dot(24, 27.5, 2, 'pa-fill')
        );
    }
    return out;
}

function steps(value) {
    if (value === 'progressBar') {
        return [r(4, 16, 48, 4, 'pa-fill', 2), r(4, 16, 22, 4, 'pa-accent', 2)];
    }
    if (value === 'dots') {
        return [
            dot(16, 18, 2.5, 'pa-accent'),
            dot(24, 18, 2.5, 'pa-accent'),
            dot(32, 18, 2.5, 'pa-fill'),
            dot(40, 18, 2.5, 'pa-fill')
        ];
    }
    return [
        dot(8, 18, 4.5, 'pa-accent'),
        p('M13 18H23', 'pa-accent-line'),
        dot(28, 18, 4.5, 'pa-paper'),
        p('M33 18H43', 'pa-hair'),
        dot(48, 18, 4.5, 'pa-paper')
    ];
}

function tabStyle(value) {
    if (value === 'pills') {
        return [
            r(3, 12, 17, 10, 'pa-accent', 5),
            text(24, 15.75, 12),
            text(40, 15.75, 12)
        ];
    }
    if (value === 'enclosed') {
        return [
            p('M2 26H54', 'pa-hair'),
            r(3, 10, 18, 16, 'pa-paper', 2),
            text(6, 16.5, 12),
            text(25, 16.5, 11),
            text(40, 16.5, 11)
        ];
    }
    return [
        p('M2 25H54', 'pa-hair'),
        text(4, 15, 13),
        r(3, 23.5, 15, 2.5, 'pa-accent', 1),
        text(23, 15, 12),
        text(40, 15, 12)
    ];
}

function tabAlignment(value) {
    const line = p('M2 25H54', 'pa-hair');
    if (value === 'center') {
        return [line, text(10, 15, 10), text(23, 15, 10), text(36, 15, 10)];
    }
    if (value === 'fullWidth') {
        return [line, text(4, 15, 14), text(21, 15, 14), text(38, 15, 14)];
    }
    return [line, text(4, 15, 10), text(17, 15, 10), text(30, 15, 10)];
}

function railSide(value) {
    const right = value === 'right';
    const railX = right ? 40 : 2;
    const formX = right ? 6 : 20;
    return [
        page(),
        r(railX, 2, 14, 32, 'pa-fill', 3),
        r(railX + 3, 7, 8, 2.5, 'pa-accent', 1.25),
        text(railX + 3, 13, 8),
        text(railX + 3, 19, 8),
        text(formX, 8, 18),
        r(formX, 12, 30, 5, 'pa-paper', 1.5),
        text(formX, 21, 18),
        r(formX, 25, 30, 5, 'pa-paper', 1.5)
    ];
}

function buttonArrangement(value) {
    // Back (outline) and Next (accent), big enough to read on a 56px tile
    const b = (x, w, c) => r(x, 11, w, 14, c, 3);
    switch (value) {
        case 'together-left':
            return [b(3, 19, 'pa-line'), b(25, 19, 'pa-accent')];
        case 'together-right':
            return [b(12, 19, 'pa-line'), b(34, 19, 'pa-accent')];
        case 'split':
            return [b(3, 19, 'pa-line'), b(34, 19, 'pa-accent')];
        case 'stretch':
            return [b(3, 24, 'pa-line'), b(29, 24, 'pa-accent')];
        default:
            // "whatever the layout does": the buttons drawn dashed
            return [b(3, 19, 'pa-dash'), b(34, 19, 'pa-dash')];
    }
}

const DRAW = {
    pageFit,
    pageRadius: radius,
    radius,
    mesh,
    texture,
    density,
    paneSide: (v) => split(v === 'right' ? 'right' : 'left', ''),
    paneRatio: (v, ctx) => split(ctx.paneSide, v),
    heroProgress,
    stepperMode: steps,
    stepperNarrow: (v) => steps(v || 'dots'),
    tabStyle,
    tabAlignment,
    railSide,
    buttonArrangement
};

/**
 * @param {string} key   the registry control key
 * @param {string} value one option's stored value
 * @param {object} ctx   { meshSeeds, customMesh, paneSide }
 */
export function designArt(key, value, ctx = {}) {
    const draw = DRAW[key];
    if (!draw) {
        return null;
    }
    const full = { meshSeeds: {}, customMesh: [], paneSide: 'left', ...ctx };
    const shapes = draw(
        value === null || value === undefined ? '' : String(value),
        full
    );
    return {
        viewBox: BOX,
        shapes: shapes.map((s, i) => ({ ...s, key: `s${i}` }))
    };
}
