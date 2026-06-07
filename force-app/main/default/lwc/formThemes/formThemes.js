/**
 * Shared form template/skin model — the single source of truth imported by
 * propertyPanel, formDesigner, formPlayer and templateGallery.
 *
 * A TEMPLATE = a LAYOUT (structural shell) + a default SKIN (colours, fonts,
 * background, corners, glass). Users pick a layout, then freely edit the skin.
 * The same form BODY (sections/fields/validation) renders inside every shell.
 */

// ----- Layout archetypes (the structural choice) -----
export const FORM_LAYOUTS = [
    { value: 'classic', label: 'Classic' },
    { value: 'split', label: 'Split' },
    { value: 'immersive', label: 'Immersive' },
    { value: 'stepped', label: 'Stepped' },
    { value: 'compact', label: 'Compact' }
];

// Each template bundles a layout + a tasteful default skin.
export const LAYOUT_TEMPLATES = {
    classic: {
        name: 'classic', layout: 'classic', label: 'Classic', font: 'enterprise',
        accent: '#0176d3', surface: '#ffffff', pageBg: '#f4f6f9',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'card', glass: false
    },
    split: {
        name: 'split', layout: 'split', label: 'Split', font: 'luxe',
        accent: '#c9a24b', surface: '#ffffff',
        pageBg: 'linear-gradient(160deg, #059669 0%, #064e3b 100%)',
        radius: 'sharp', cardShadow: 'none', sectionDefault: 'plain', glass: false
    },
    immersive: {
        name: 'immersive', layout: 'immersive', label: 'Immersive', font: 'geometric',
        accent: '#6d4bff', surface: 'rgba(255, 255, 255, 0.62)',
        pageBg: 'linear-gradient(135deg, #ff8fb1 0%, #7a5cff 52%, #16d2c4 100%)',
        radius: 'round', cardShadow: 'strong', sectionDefault: 'plain',
        glass: true
    },
    stepped: {
        name: 'stepped', layout: 'stepped', label: 'Stepped', font: 'technical',
        accent: '#e6571f', surface: '#f7f6f2', pageBg: '#eceae4',
        radius: 'sharp', cardShadow: 'none', sectionDefault: 'boxed', glass: false
    },
    compact: {
        name: 'compact', layout: 'compact', label: 'Compact', font: 'enterprise',
        accent: '#4f46e5', surface: '#ffffff', pageBg: '#f4f5f7',
        radius: 'rounded', cardShadow: 'soft', sectionDefault: 'plain', glass: false
    }
};

// Back-compat: older code referenced PRESET_THEMES.default for fallback values.
export const PRESET_THEMES = { default: LAYOUT_TEMPLATES.classic };

// ----- Curated font pairings (system-safe stacks; custom webfonts via static
// resources can be layered on later without changing this contract) -----
export const FONT_PAIRINGS = {
    salesforce: {
        label: 'Salesforce Sans (SLDS)',
        display: "'Salesforce Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        body: "'Salesforce Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    },
    system: {
        label: 'System UI (Native)',
        display: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        body: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    },
    enterprise: {
        label: 'Enterprise',
        display: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
        body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    },
    editorial: {
        label: 'Editorial',
        display: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
        body: "'Iowan Old Style', Georgia, 'Times New Roman', serif"
    },
    luxe: {
        label: 'Luxe',
        display: "'Hoefler Text', 'Big Caslon', 'Playfair Display', Garamond, serif",
        body: "'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    },
    technical: {
        label: 'Technical',
        display: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, monospace",
        body: "'Helvetica Neue', Arial, system-ui, sans-serif"
    },
    geometric: {
        label: 'Geometric',
        display: "'Avenir Next', 'Century Gothic', 'Futura', system-ui, sans-serif",
        body: "'Avenir Next', system-ui, 'Segoe UI', sans-serif"
    }
};

export const FONT_OPTIONS = Object.keys(FONT_PAIRINGS).map((k) => ({
    label: FONT_PAIRINGS[k].label,
    value: k
}));

const RADIUS_MAP = { sharp: '2px', rounded: '8px', round: '14px', pill: '9999px' };
const SHADOW_MAP = {
    none: 'none',
    soft: '0 2px 8px rgba(0, 0, 0, 0.06)',
    medium: '0 4px 14px rgba(0, 0, 0, 0.10)',
    strong: '0 24px 60px -20px rgba(0, 0, 0, 0.55)'
};

export function radiusToken(name) {
    return RADIUS_MAP[name] || RADIUS_MAP.rounded;
}

export const RADIUS_OPTIONS = [
    { label: 'Sharp', value: 'sharp' },
    { label: 'Rounded', value: 'rounded' },
    { label: 'Round', value: 'round' },
    { label: 'Pill', value: 'pill' }
];

// Backwards-compat: older forms store a colour-only `theme`; these helpers all
// tolerate missing layout/font/glass keys and fall back to Classic defaults.
export function radiusTokenCard(theme) {
    const t = theme || {};
    const r = radiusToken(t.radius);
    return t.container === 'fullbleed' ? '0px' : t.radius === 'pill' ? '18px' : r;
}

export function fontVars(font) {
    const f = FONT_PAIRINGS[font] || FONT_PAIRINGS.enterprise;
    return `--c-font-body: ${f.body}; --c-font-display: ${f.display}`;
}

/**
 * CSS custom-property string for a theme/skin. Set on the form root; the card,
 * sections, buttons, fonts and page background all inherit from it.
 */
export function themeVars(t) {
    const theme = t || {};
    const accent = theme.accent || LAYOUT_TEMPLATES.classic.accent;
    const radius = radiusToken(theme.radius);
    const container = theme.container || 'boxed';
    const flat = theme.glass || container === 'flat' || container === 'fullbleed';
    const cardShadow = SHADOW_MAP[theme.cardShadow] || (flat ? 'none' : SHADOW_MAP.soft);
    const cardBorder = theme.glass
        ? '1px solid rgba(255,255,255,0.18)'
        : flat
        ? '0 solid transparent'
        : '1px solid var(--c-border-light)';

    const paddingMap = { none: '0.5rem', small: '0.75rem', medium: '1rem', large: '1.5rem' };
    const paddingVal = paddingMap[theme.sectionPadding] || paddingMap.medium;

    const parts = [
        fontVars(theme.font),
        `--c-accent: ${accent}`,
        `--c-brand: ${accent}`,
        `--c-brand-dark: ${accent}`,
        `--c-radius: ${radius}`,
        `--c-radius-card: ${radiusTokenCard(theme)}`,
        `--c-submit-bg: ${theme.submitColor || accent}`,
        `--c-back-color: ${theme.backColor || accent}`,
        `--c-card-bg: ${theme.surfaceGradient || theme.surface || '#ffffff'}`,
        `--c-card-border: ${cardBorder}`,
        `--c-card-shadow: ${cardShadow}`,
        `--c-page-bg: ${theme.pageBg || 'transparent'}`,
        `--c-section-style: ${theme.sectionDefault || 'card'}`,
        `--c-section-header-bg: ${theme.sectionHeaderBg || 'var(--c-surface-sunken)'}`,
        `--c-section-padding: ${paddingVal}`,
        `--c-header-style: ${theme.headerStyle || 'inherit'}`
    ];

    // Dark skins (e.g. Immersive glass) flip the chrome text tokens so our
    // titles/labels/help text stay readable over the dark card.
    if (theme.dark) {
        parts.push(
            '--c-text: #f3f0ff',
            '--c-text-weak: #c4bfe0',
            '--c-text-meta: #a59ec9',
            '--c-label: #d7d2ee',
            '--c-border-light: rgba(255,255,255,0.16)',
            '--c-border: rgba(255,255,255,0.20)',
            '--c-surface-sunken: rgba(255,255,255,0.06)',
            '--c-surface-alt: rgba(255,255,255,0.08)'
        );
    }
    return parts.join('; ');
}

// Whether a theme paints a page background behind the card (vs. transparent).
export function hasPageBackground(t) {
    const bg = t && t.pageBg;
    return !!bg && bg !== 'transparent' && bg !== 'none' && bg !== '#ffffff';
}

// The layout archetype, defaulting to classic for older colour-only themes.
export function layoutOf(t) {
    return (t && t.layout) || 'classic';
}

// ----- Section style variants -----
export const SECTION_STYLE_OPTIONS = [
    { label: 'Match template', value: 'inherit' },
    { label: 'Card (border + header)', value: 'card' },
    { label: 'Subtle (bold header, no border)', value: 'subtle' },
    { label: 'Plain (no border, minimal)', value: 'plain' },
    { label: 'Boxed (strong frame)', value: 'boxed' }
];

export function resolveSectionStyle(sectionStyle, templateDefault) {
    if (sectionStyle && sectionStyle !== 'inherit') return sectionStyle;
    return templateDefault || 'card';
}