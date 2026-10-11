/**
 * Error and required inks stay legible on every built-in theme
 * (cross-host audit A5 to A7, docs/FinalDesign/IMPL_PLAN_CROSS_HOST_STAGES_1_2.md).
 *
 * The default red (#b42318) is 6.5 : 1 on a light panel but only 1.7 to 2.5 : 1
 * on the dark ones. This is the tripwire that keeps a new dark theme from
 * shipping it.
 *
 *   message and required marker (text)  >= 4.5 : 1 on the panel AND on the
 *                                          panel plus the 8 % text tint a card
 *                                          or boxed section adds
 *   invalid border (same ink)           >= 3 : 1 on the field fill
 *
 * Translucent "glass" panels are composited over the page colour, and get 0.3
 * of headroom because the backdrop behind them moves.
 */
import { listBuiltinThemes, getBuiltinTheme } from 'c/finalThemeCatalog';
import { resolveTokens, contrastRatio } from 'c/finalThemeEngine';

const WHITE = { r: 255, g: 255, b: 255, a: 1 };

function parse(value) {
    const s = String(value || '').trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(s);
    if (hex) {
        return {
            r: parseInt(hex[1].slice(0, 2), 16),
            g: parseInt(hex[1].slice(2, 4), 16),
            b: parseInt(hex[1].slice(4, 6), 16),
            a: 1
        };
    }
    const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (fn) {
        const p = fn[1].split(',').map((x) => parseFloat(x));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    return null;
}

function over(top, bottom) {
    return {
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
        a: 1
    };
}

function toHex(c) {
    return (
        '#' +
        [c.r, c.g, c.b]
            .map((v) => Math.round(v).toString(16).padStart(2, '0'))
            .join('')
    );
}

/** The surfaces an error ink sits on, as hex. */
function surfacesOf(theme, tokens) {
    const pal = theme.palette;
    const page = parse(pal.pageBg) || WHITE;
    const content = parse(pal.contentBg);
    const text = parse(pal.text);
    const panel = over(content, over(page, WHITE));
    const tint = over({ ...text, a: 0.08 }, panel);
    const fill =
        parse(pal.fieldBg) || parse(tokens['--c-input-bg-swatch']) || null;
    return {
        panel: toHex(panel),
        tint: toHex(tint),
        field: toHex(fill ? over(fill, panel) : panel),
        glass: content.a < 1
    };
}

describe('error and required inks are legible on every built-in theme', () => {
    const keys = listBuiltinThemes().map((t) => t.key);

    it('covers the whole roster', () => {
        expect(keys).toHaveLength(32);
    });

    it.each(keys)('%s', (key) => {
        const theme = getBuiltinTheme(key);
        const tokens = resolveTokens(theme, null);
        const { panel, tint, field, glass } = surfacesOf(theme, tokens);
        const headroom = glass ? 0.3 : 0;
        const error = tokens['--c-field-error'];
        const required = tokens['--c-field-required'];

        expect(contrastRatio(error, panel)).toBeGreaterThanOrEqual(
            4.5 + headroom
        );
        expect(contrastRatio(error, tint)).toBeGreaterThanOrEqual(
            4.5 + headroom
        );
        expect(contrastRatio(required, panel)).toBeGreaterThanOrEqual(
            4.5 + headroom
        );
        expect(contrastRatio(required, tint)).toBeGreaterThanOrEqual(
            4.5 + headroom
        );
        expect(contrastRatio(error, field)).toBeGreaterThanOrEqual(
            3 + headroom
        );
    });
});
