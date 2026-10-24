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

// The five legacy installed-font stacks, as they read today.
const STACK_LABELS = {
    system: 'Device default',
    editorial: 'Editorial (serif display)',
    mono: 'Mono',
    geometric: 'Geometric',
    humanist: 'Humanist'
};

const has = (obj, key) =>
    !!obj && Object.prototype.hasOwnProperty.call(obj, key);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** A reference as one select value: stack:k, bundled:k or uploaded:k. */
export function refValue(ref) {
    if (!isObj(ref)) {
        return '';
    }
    return `${ref.source}:${ref.key || ref.family || ''}`;
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
    if (source === 'stack' && has(STACK_LABELS, key)) {
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

/** A short human name for one reference. */
export function refLabel(ref) {
    if (!isObj(ref)) {
        return '';
    }
    if (ref.source === 'stack') {
        return STACK_LABELS[ref.key] || ref.key;
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
    const d = refLabel(refs.display);
    const b = refLabel(refs.body);
    return d === b ? d : `${d} + ${b}`;
}

function pairingDetail(key) {
    const p = FONT_PAIRINGS[key];
    return key === 'system'
        ? 'installed fonts, nothing to download'
        : refsLabel(p);
}

/**
 * What the pairing select shows as chosen for a level:
 * inherit | pairing:<k> | uploaded:<k> | custom | legacy:<typography>.
 */
export function currentChoice(level, { allowInherit = true } = {}) {
    const lv = isObj(level) ? level : {};
    const fonts = isObj(lv.fonts) ? lv.fonts : null;
    if (fonts && (fonts.display || fonts.body)) {
        const d = refValue(fonts.display);
        if (d && d === refValue(fonts.body) && d.startsWith('uploaded:')) {
            return d;
        }
        return 'custom';
    }
    if (fonts && has(FONT_PAIRINGS, fonts.pairing)) {
        return `pairing:${fonts.pairing}`;
    }
    if (isObj(lv.customFont) && lv.customFont.family) {
        return `uploaded:${lv.customFont.key}`;
    }
    if (typeof lv.typography === 'string') {
        return lv.typography === 'system'
            ? 'pairing:system'
            : `legacy:${lv.typography}`;
    }
    return allowInherit ? 'inherit' : 'pairing:system';
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
    inheritLabel = ''
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
        let label = 'Custom';
        if (current.startsWith('legacy:')) {
            const k = current.slice('legacy:'.length);
            label = `${STACK_LABELS[k] || k} · older option`;
        } else if (current.startsWith('uploaded:')) {
            label = `${current.slice('uploaded:'.length)} · uploaded (not found)`;
        }
        groups.unshift({
            key: 'current',
            label: 'Current',
            options: [{ value: current, label }]
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
 * org's uploaded fonts.
 */
export function familyOptions(
    side,
    { uploadedFonts = [], selected = '' } = {}
) {
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
        // a legacy stack or a font that is gone: keep it visible
        groups.unshift({
            key: 'current',
            label: 'Current',
            options: [
                {
                    value: selected,
                    label: `${selected.split(':').pop()} · current`
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

const hasLevelFonts = (lv) =>
    isObj(lv) &&
    (lv.fonts !== undefined ||
        lv.typography !== undefined ||
        lv.customFont !== undefined);

/**
 * A pick in the pairing select → the patch for the level.
 * inherit → no font setting at this level (the theme's fonts come back).
 */
export function pairingPatch(value, { uploadedFonts = [] } = {}) {
    if (value === 'inherit') {
        return { fonts: undefined };
    }
    if (value.startsWith('pairing:')) {
        const key = value.slice('pairing:'.length);
        return has(FONT_PAIRINGS, key) ? { fonts: { pairing: key } } : null;
    }
    if (value.startsWith('uploaded:')) {
        const ref = refFromValue(value, uploadedFonts);
        return ref ? { fonts: { display: ref, body: { ...ref } } } : null;
    }
    // custom / legacy entries only show what the level already holds
    return null;
}

/**
 * A pick for ONE side in Customize → the patch for the level (§A.3b).
 * The untouched side keeps rendering exactly as before:
 * - if this level's own settings decided it, its current font is copied in
 *   (with file info) before the legacy keys go;
 * - if it came from the theme (the level had no font setting), it is left
 *   unset and keeps following the theme.
 * `effective` is resolveFontRefs() for this level as it stands.
 */
export function sidePatch(level, side, ref, effective) {
    if (!isObj(ref)) {
        return null;
    }
    const lv = isObj(level) ? level : {};
    const other = side === 'display' ? 'body' : 'display';
    const prev = isObj(lv.fonts) ? lv.fonts : {};
    const next = { ...prev, [side]: ref };
    const pairing = has(FONT_PAIRINGS, prev.pairing)
        ? FONT_PAIRINGS[prev.pairing]
        : null;
    const otherDecided = next[other] || (pairing && pairing[other]);
    if (!otherDecided && hasLevelFonts(lv) && effective && effective[other]) {
        next[other] = { ...effective[other] };
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
