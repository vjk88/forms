import { parseColor } from 'c/finalFocusTreatment';

/**
 * Where the header text fade goes (docs/FinalDesign/IMPL_PLAN_HEADER_FADE.md).
 *
 * The theme engine still works out a text plate for every header surface the
 * text can't read on by itself (--c-header-plate, -page, -banner). The plate
 * is no longer drawn as a box: its colour feeds one soft wash behind the text.
 * This reads the viewer's resolved tokens with the same scope precedence the
 * CSS painters use, so the header and the Split pane know, without measuring
 * anything, whether a wash is due and whether the header sits straight on the
 * page (One at a time, nothing of its own behind it).
 */

/** No colour at all: unset, `transparent`, alpha 0, or a 0% fill mix. */
export function isClear(value) {
    if (value === undefined || value === null) {
        return true;
    }
    const s = String(value).trim();
    if (!s || s === 'none') {
        return true;
    }
    if (/^color-mix\(.*\s0%,\s*transparent\)$/i.test(s)) {
        return true;
    }
    const c = parseColor(s);
    return Boolean(c) && c.a === 0;
}

/** The plate token that applies to a scope, exactly as the CSS falls back:
 *  the header's banner falls back to the base plate; the Split pane's
 *  explicit scopes (-banner, -page) fall back to nothing. */
function plateFor(tokens, scope, fallsBack) {
    const own = tokens[`--c-header-plate${scope}`];
    if (own !== undefined) {
        return own;
    }
    return fallsBack ? tokens['--c-header-plate'] : undefined;
}

/**
 * @param {object} args
 * @param {object} args.tokens the viewer's resolved frame tokens
 * @param {object} args.header the spec's header block
 * @param {boolean} args.flush the header sits on the One at a time open page
 * @returns {{ on: boolean, eligible: boolean, exposed: boolean }}
 *   on = the author's switch (only `textFade: false` turns it off);
 *   eligible = a plate is due, so the strips are reserved and, when on, the
 *   wash painted; exposed = eligible AND the header has no surface of its
 *   own on the open page, so its top and bottom edges are softened too.
 */
export function headerFade({ tokens, header, flush }) {
    const t = tokens || {};
    const h = header || {};
    const banner = Boolean(h.bgImage && h.bgImage.url);
    const eligible = !isClear(plateFor(t, banner ? '-banner' : '', true));
    const exposed =
        eligible &&
        Boolean(flush) &&
        !banner &&
        isClear(t['--c-header-bg-image']) &&
        isClear(t['--c-header-bg-gradient']) &&
        isClear(t['--c-header-bg']);
    return { on: h.textFade !== false, eligible, exposed };
}

/** The Split pane picks its scope itself (finalNavSplitHero paneStyle):
 *  its banner, else the page when immersive, else the card. */
export function paneFadeEligible({ tokens, paneBanner, bleed }) {
    let scope = '';
    if (paneBanner) {
        scope = '-banner';
    } else if (bleed) {
        scope = '-page';
    }
    return !isClear(plateFor(tokens || {}, scope, scope === ''));
}
