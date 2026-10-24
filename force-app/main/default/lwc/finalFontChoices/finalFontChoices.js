/**
 * finalFontChoices — what the font pickers offer and what a pick writes
 * (IMPL_PLAN_FONTS_AND_BRAND_THEME §A.3b, §A.4). Pure: no DOM, no Apex.
 *
 * A "level" is the object a picker edits: the form's theme overrides in the
 * Design panel, or a custom theme's properties in the theme editor. Only its
 * font keys matter: `fonts` (new), `typography` and `customFont` (legacy).
 *
 * Every pick returns a PATCH for that level: { fonts } to write (undefined =
 * remove), and the legacy keys are always removed with it, so a level never
 * holds both. A pick is the opt-in to the new rules; nothing changes for a
 * form until someone picks.
 */
import { BUNDLED_FONTS, FONT_PAIRINGS, bundledFont } from 'c/finalFontFamilies';
import { fontRefStack } from 'c/finalThemeEngine';

export const GROUPS = [
    { key: 'everyday', label: 'Everyday / business' },
    { key: 'modern', label: 'Modern / geometric' },
    { key: 'friendly', label: 'Friendly / rounded' },
    { key: 'editorial', label: 'Editorial / elegant' },
    { key: 'bold', label: 'Bold / condensed' },
    { key: 'mono', label: 'Technical / monospace' },
    { key: 'handwritten', label: 'Handwritten / expressive' }
];

// Pairing labels in picker order (saved keys never change; labels may).
export const PAIRING_LABELS = [
    ['system', 'Device default'],
    ['modern', 'Modern'],
    ['geometricSans', 'Geometric'],
    ['startup', 'Startup'],
    ['friendly', 'Friendly'],
    ['classic', 'Classic'],
    ['editorialSerif', 'Editorial'],
    ['bold', 'Bold'],
    ['poster', 'Poster'],
    ['tech', 'Tech'],
    ['code', 'Code'],
    ['handwritten', 'Handwritten']
];

// The five legacy installed-font stacks, named for what each SIDE really
// uses — never "Editorial" or "Geometric", which are new pairings now.
const STACK_NAMES = {
    system: { display: 'Device default', body: 'Device default' },
    editorial: {
        display: 'Georgia serif (installed)',
        body: 'Device default'
    },
    mono: {
        display: 'System mono (installed)',
        body: 'System mono (installed)'
    },
    geometric: {
        display: 'Avenir / Century Gothic (installed)',
        body: 'Avenir / Century Gothic (installed)'
    },
    humanist: {
        display: 'Seravek / Gill Sans (installed)',
        body: 'Seravek / Gill Sans (installed)'
    }
};

const SYSTEM = { source: 'stack', key: 'system' };

const has = (obj, key) =>
    !!obj && Object.prototype.hasOwnProperty.call(obj, key);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A reference the engine can actually use on this side. */
const usable = (ref, side) => Boolean(fontRefStack(ref, side));

/** A reference as one select value: stack:k, bundled:k or uploaded:k. */
export function refValue(ref) {
    if (!isObj(ref)) {
        return '';
    }
    return `${ref.source}:${ref.key || ref.family || ''}`;
}

/**
 * The value a side's select should show. A legacy stack whose side is just
 * the device font (Editorial's body) reads as "Device default".
 */
export function sideValue(ref, side) {
    if (
        isObj(ref) &&
        ref.source === 'stack' &&
        fontRefStack(ref, side) &&
        fontRefStack(ref, side) === fontRefStack(SYSTEM, side)
    ) {
        return 'stack:system';
    }
    return refValue(ref);
}

/** The uploaded Form_Font__mdt font as a full reference (file info kept). */
function uploadedRefFrom(font) {
    return {
        source: 'uploaded',
        key: font.key,
        family: font.family,
        fallback: font.fallback,
        resource: font.resource,
        regularPath: font.regularPath,
        boldPath: font.boldPath
    };
}

/** A select value back to a reference, or null when it names nothing real. */
export function refFromValue(value, uploadedFonts = []) {
    const [source, ...rest] = String(value || '').split(':');
    const key = rest.join(':');
    if (source === 'stack' && has(STACK_NAMES, key)) {
        return { source, key };
    }
    if (source === 'bundled' && bundledFont(key)) {
        return { source, key };
    }
    if (source === 'uploaded') {
        const font = uploadedFonts.find((f) => f.key === key);
        return font ? uploadedRefFrom(font) : null;
    }
    return null;
}

/** A short human name for one reference on one side. */
export function refLabel(ref, side = 'display') {
    if (!isObj(ref)) {
        return '';
    }
    if (ref.source === 'stack') {
        return has(STACK_NAMES, ref.key) ? STACK_NAMES[ref.key][side] : ref.key;
    }
    if (ref.source === 'bundled') {
        const font = bundledFont(ref.key);
        return font ? font.name : ref.key;
    }
    return ref.family || ref.key || '';
}

/** "Playfair Display + Lora", or one name when both sides match. */
export function refsLabel(refs) {
    if (!refs) {
        return '';
    }
    const d = refLabel(refs.display, 'display');
    const b = refLabel(refs.body, 'body');
    return d === b ? d : `${d} + ${b}`;
}

/** Every bundled family name (the settings search finds the picker by them). */
export function allFontNames() {
    return Object.values(BUNDLED_FONTS).map((f) => f.name);
}

function pairingDetail(key) {
    return key === 'system' ? 'no download' : refsLabel(FONT_PAIRINGS[key]);
}

function fontsUsable(fonts) {
    return (
        isObj(fonts) &&
        (usable(fonts.display, 'display') ||
            usable(fonts.body, 'body') ||
            has(FONT_PAIRINGS, fonts.pairing))
    );
}

/**
 * True when the level holds a font setting that does something: the new
 * `fonts` (only when it resolves — `{}` or an unknown pairing count as
 * nothing), or a legacy `typography` / `customFont` (null included: it hides
 * the theme's uploaded font). Drives the "Customized" dot and counts.
 */
export function levelHasFonts(level) {
    return (
        isObj(level) &&
        (level.typography !== undefined ||
            level.customFont !== undefined ||
            fontsUsable(level.fonts))
    );
}

/**
 * What the pairing select shows as chosen for a level:
 * inherit | pairing:<k> | uploaded:<k> | custom | legacy:<typography> |
 * legacy:hidden (only `customFont: null`, the theme's font turned off).
 */
export function currentChoice(level, { allowInherit = true } = {}) {
    const lv = isObj(level) ? level : {};
    const fonts = isObj(lv.fonts) ? lv.fonts : {};
    if (usable(fonts.display, 'display') || usable(fonts.body, 'body')) {
        const d = refValue(fonts.display);
        if (d && d === refValue(fonts.body) && d.startsWith('uploaded:')) {
            return d;
        }
        return 'custom';
    }
    if (has(FONT_PAIRINGS, fonts.pairing)) {
        return `pairing:${fonts.pairing}`;
    }
    if (isObj(lv.customFont) && lv.customFont.family) {
        return `uploaded:${lv.customFont.key}`;
    }
    if (typeof lv.typography === 'string') {
        return `legacy:${lv.typography}`;
    }
    if (lv.customFont === null) {
        return 'legacy:hidden';
    }
    return allowInherit ? 'inherit' : 'pairing:system';
}

// The family an uploaded current choice names, from the level itself (the
// org's list may no longer have it).
function uploadedFamily(level, key) {
    const lv = isObj(level) ? level : {};
    const fonts = isObj(lv.fonts) ? lv.fonts : {};
    const ref = [fonts.display, fonts.body, lv.customFont].find(
        (r) => isObj(r) && r.key === key
    );
    return (ref && ref.family) || key;
}

function currentLabel(current, level, fontsLoaded) {
    if (current === 'legacy:hidden') {
        return 'Theme’s uploaded font turned off · older option';
    }
    if (current.startsWith('legacy:')) {
        const ref = { source: 'stack', key: current.slice('legacy:'.length) };
        return `${refsLabel({ display: ref, body: ref })} · older option`;
    }
    if (current.startsWith('uploaded:')) {
        const family = uploadedFamily(level, current.slice('uploaded:'.length));
        // until the org's list has loaded, absence means nothing yet
        return fontsLoaded
            ? `${family} · removed from Setup (still in use)`
            : `${family} · uploaded`;
    }
    return 'Custom';
}

/**
 * Grouped options for the pairing select (and a flat copy for the toolbar).
 * The current value is always listed, even a legacy one that is otherwise
 * hidden, so the select never shows a choice the level does not hold.
 */
export function pairingOptions({
    level,
    uploadedFonts = [],
    allowInherit = true,
    inheritLabel = '',
    fontsLoaded = true
} = {}) {
    const current = currentChoice(level, { allowInherit });
    const groups = [];
    if (allowInherit) {
        groups.push({
            key: 'theme',
            label: 'Theme',
            options: [
                {
                    value: 'inherit',
                    label: inheritLabel
                        ? `From theme · ${inheritLabel}`
                        : 'From theme'
                }
            ]
        });
    }
    groups.push({
        key: 'pairings',
        label: 'Pairings',
        options: PAIRING_LABELS.map(([key, label]) => ({
            value: `pairing:${key}`,
            label: `${label} · ${pairingDetail(key)}`
        }))
    });
    if (uploadedFonts.length) {
        groups.push({
            key: 'uploaded',
            label: 'Your uploaded fonts',
            options: uploadedFonts.map((f) => ({
                value: `uploaded:${f.key}`,
                label: `${f.family} · uploaded`
            }))
        });
    }
    const listed = groups.flatMap((g) => g.options.map((o) => o.value));
    if (!listed.includes(current)) {
        groups.unshift({
            key: 'current',
            label: 'Current',
            options: [
                {
                    value: current,
                    label: currentLabel(current, level, fontsLoaded)
                }
            ]
        });
    }
    groups.forEach((g) => {
        g.options = g.options.map((o) => ({
            ...o,
            selected: o.value === current
        }));
    });
    return { current, groups, flat: groups.flatMap((g) => g.options) };
}

/**
 * Grouped options for one side in Customize: Device default, the bundled
 * families by group (the Body list leaves out display-only faces), and the
 * org's uploaded fonts. `selectedRef` is that side's current reference.
 */
export function familyOptions(
    side,
    { uploadedFonts = [], selectedRef = null } = {}
) {
    const selected = sideValue(selectedRef, side);
    const groups = [
        {
            key: 'device',
            label: 'Installed',
            options: [{ value: 'stack:system', label: 'Device default' }]
        },
        ...GROUPS.map((g) => ({
            key: g.key,
            label: g.label,
            options: Object.entries(BUNDLED_FONTS)
                .filter(
                    ([, f]) =>
                        f.group === g.key && (side !== 'body' || f.bodySafe)
                )
                .map(([key, f]) => ({ value: `bundled:${key}`, label: f.name }))
        })).filter((g) => g.options.length)
    ];
    if (uploadedFonts.length) {
        groups.push({
            key: 'uploaded',
            label: 'Your uploaded fonts',
            options: uploadedFonts.map((f) => ({
                value: `uploaded:${f.key}`,
                label: f.family
            }))
        });
    }
    const listed = groups.flatMap((g) => g.options.map((o) => o.value));
    if (selected && !listed.includes(selected)) {
        // a legacy stack or a font that is gone: keep it visible, by name
        groups.unshift({
            key: 'current',
            label: 'Current',
            options: [
                {
                    value: selected,
                    label: `${refLabel(selectedRef, side)} · current`
                }
            ]
        });
    }
    groups.forEach((g) => {
        g.options = g.options.map((o) => ({
            ...o,
            selected: o.value === selected
        }));
    });
    return groups;
}

/**
 * A pick in the pairing select → the patch for the level.
 * inherit → no font setting at this level (the theme's fonts come back).
 */
export function pairingPatch(value, { uploadedFonts = [] } = {}) {
    const v = String(value || '');
    if (v === 'inherit') {
        return { fonts: undefined };
    }
    if (v.startsWith('pairing:')) {
        const key = v.slice('pairing:'.length);
        return has(FONT_PAIRINGS, key) ? { fonts: { pairing: key } } : null;
    }
    if (v.startsWith('uploaded:')) {
        const ref = refFromValue(v, uploadedFonts);
        return ref ? { fonts: { display: ref, body: { ...ref } } } : null;
    }
    // custom / legacy entries only show what the level already holds
    return null;
}

/**
 * A pick for ONE side in Customize → the patch for the level (§A.3b).
 * The untouched side keeps rendering exactly as before:
 * - already set at this level (its own font, or the level's pairing) → kept;
 * - decided by this level's LEGACY keys (typography / customFont, null
 *   included) → its current font is copied in, with file info, before those
 *   keys go;
 * - otherwise it came from the theme → left unset, so it keeps following the
 *   theme, including any later change (a second edit never pins it).
 * Only references the engine can use count as "set".
 * `effective` is resolveFontRefs() for this level as it stands.
 */
export function sidePatch(level, side, ref, effective) {
    if (!isObj(ref) || !usable(ref, side)) {
        return null;
    }
    const lv = isObj(level) ? level : {};
    const other = side === 'display' ? 'body' : 'display';
    const prev = isObj(lv.fonts) ? lv.fonts : {};
    const next = { ...prev, [side]: ref };
    const pairing = has(FONT_PAIRINGS, prev.pairing)
        ? FONT_PAIRINGS[prev.pairing]
        : null;
    const otherDecided =
        usable(next[other], other) || usable(pairing && pairing[other], other);
    const legacyDecides =
        lv.typography !== undefined || lv.customFont !== undefined;
    if (!otherDecided) {
        delete next[other]; // an unusable leftover is not a setting
        if (legacyDecides && effective && effective[other]) {
            next[other] = { ...effective[other] };
        }
    }
    return { fonts: next };
}

/** Apply a patch to a level IN PLACE (the caller owns the copy). */
export function applyFontPatch(level, patch) {
    if (!isObj(level) || !patch) {
        return level;
    }
    delete level.typography;
    delete level.customFont;
    if (patch.fonts === undefined) {
        delete level.fonts;
    } else {
        level.fonts = patch.fonts;
    }
    return level;
}
