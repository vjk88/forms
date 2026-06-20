/**
 * c/brandEmblem — the shared brand/logo engine. Extracted from c/formThemeCard so
 * BOTH the theme-picker card AND the live runtime (c/formViewer) draw the exact
 * same emblems instead of the gallery looking finished and the real form bare.
 *
 *   getLogoUrl(type, accent, text, name, font) → 140×32 emblem + brand-name text
 *                                                (the gallery card's demo lockup)
 *   getEmblemMarkUrl(type, color)             → 32×32 mark only (live form header;
 *                                                the form title already provides the name)
 *   getContrastRatio / getBackgroundHex / isColorDark → contrast helpers so the
 *                                                emblem colour stays legible on its bg
 *
 * Pure string/SVG math — no Apex, no DOM — so it is guest-safe and unit-testable.
 */

function parseToRgb(colorStr) {
    if (!colorStr) return null;
    colorStr = colorStr.trim().toLowerCase();
    if (colorStr.startsWith('#')) {
        let hex = colorStr.replace(/^#/, '');
        if (hex.length === 3 || hex.length === 4) {
            hex = hex.split('').map((c) => c + c).join('');
        }
        if (hex.length === 8) hex = hex.slice(0, 6);
        const num = parseInt(hex, 16);
        if (isNaN(num)) return null;
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }
    const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) {
        return { r: parseInt(rgbMatch[1], 10), g: parseInt(rgbMatch[2], 10), b: parseInt(rgbMatch[3], 10) };
    }
    return null;
}

function getLuminance(rgb) {
    if (!rgb) return 0;
    const a = [rgb.r, rgb.g, rgb.b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

export function getContrastRatio(color1, color2) {
    const rgb1 = parseToRgb(color1);
    const rgb2 = parseToRgb(color2);
    if (!rgb1 || !rgb2) return 1;
    const lum1 = getLuminance(rgb1);
    const lum2 = getLuminance(rgb2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
}

export function isColorDark(colorStr) {
    const rgb = parseToRgb(colorStr);
    if (!rgb) return true;
    return getLuminance(rgb) < 0.5;
}

export function getBackgroundHex(bgValue, textColor) {
    if (!bgValue) return isColorDark(textColor) ? '#ffffff' : '#1e1e24';
    const hexMatch = bgValue.match(/#[0-9a-fA-F]{3,8}/);
    if (hexMatch) return hexMatch[0];
    const rgbMatch = bgValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) return rgbMatch[0];
    return isColorDark(textColor) ? '#ffffff' : '#1e1e24';
}

// The emblem mark (no text) for one logo type, on a 0 0 32 32 viewBox. `stroke`
// draws the outline, `fill` the solid accent shape.
function emblemMarkup(logoType, stroke, fill) {
    switch (logoType) {
        case 'triangle':
            return `<path d="M16 4L6 26h20L16 4z" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 12l-5 10h10l-5-10z" fill="${fill}"/>`;
        case 'shield':
            return `<path d="M16 26s7-3.5 7-9V9l-7-2.5L9 9v8c0 5.5 7 9 7 9z" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 21.5s4.5-2.5 4.5-6v-4l-4-1.5-4 1.5v4c0 3.5 4.5 6 4.5 6z" fill="${fill}"/>`;
        case 'globe':
            return `<circle cx="16" cy="16" r="9" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 16h18M16 7a13 13 0 0 1 3.5 9 13 13 0 0 1-3.5 9 13 13 0 0 1-3.5-9 13 13 0 0 1 3.5-9z" fill="none" stroke="${stroke}" stroke-width="1.2"/>`;
        case 'leaf':
            return `<path d="M16 25A7 7 0 0 1 14.8 11c5.5-1 7-1.5 9-4 1 2 2 3.5 1 8a7 7 0 0 1-9 10zm0 0v-5" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 21A4 4 0 0 1 15.3 14c3-0.5 4-1 5-2.5v1.5c0 1.5-2.5 3-3.7 3z" fill="${fill}"/>`;
        case 'aperture':
            return `<circle cx="16" cy="16" r="9" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="18" y1="9.3" x2="22.7" y2="17.3" stroke="${stroke}" stroke-width="1.5"/><line x1="14" y1="9.3" x2="23.7" y2="9.3" stroke="${stroke}" stroke-width="1.5"/><line x1="12" y1="12.8" x2="16.5" y2="4.8" stroke="${stroke}" stroke-width="1.5"/><line x1="14" y1="20" x2="9.3" y2="12" stroke="${stroke}" stroke-width="1.5"/><line x1="18" y1="20" x2="8.3" y2="20" stroke="${stroke}" stroke-width="1.5"/><line x1="20" y1="16.5" x2="15.5" y2="24.5" stroke="${stroke}" stroke-width="1.5"/>`;
        case 'award':
            return `<circle cx="16" cy="12" r="6" fill="none" stroke="${stroke}" stroke-width="2"/><polyline points="12.6 17 11.5 25 16 22.5 20.5 25 19.4 17" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="12" r="2.5" fill="${fill}"/>`;
        case 'coffee':
            return `<path d="M21 12h1a2.5 2.5 0 0 1 0 5h-1M7 12h14v8a3.5 3.5 0 0 1-3.5 3.5h-7A3.5 3.5 0 0 1 7 20v-8z" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="6" x2="10" y2="9" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/><line x1="14" y1="6" x2="14" y2="9" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/><line x1="18" y1="6" x2="18" y2="9" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round"/>`;
        case 'cross':
            return `<line x1="16" y1="6" x2="16" y2="26" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="16" x2="26" y2="16" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`;
        default:
            return '';
    }
}

// Gallery lockup: emblem mark + brand-name text (140×32). Output is byte-for-byte
// the same as the original c/formThemeCard generator.
export function getLogoUrl(logoType, accent, text, name, font) {
    if (!logoType) return '';
    const mark = emblemMarkup(logoType, accent, accent);
    if (!mark) return '';
    const fontName = font ? font.split(',')[0].replace(/'/g, '').trim() : 'system-ui';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="32" viewBox="0 0 140 32">${mark}<text x="38" y="21" font-family="'${fontName}', system-ui, sans-serif" font-size="14" font-weight="700" fill="${text}">${name}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg.trim());
}

// Live form header: the mark only (32×32). The form title supplies the name.
export function getEmblemMarkUrl(logoType, color) {
    if (!logoType) return '';
    const mark = emblemMarkup(logoType, color, color);
    if (!mark) return '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${mark}</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg.trim());
}
