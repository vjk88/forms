/**
 * Security Engine: Sanitizes dynamic JSON attributes before applying them to host properties.
 */
const COLOR_REG = /^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$|^rgba?\([^)]+\)$|^[a-zA-Z]+$/;
const SIZE_REG = /^\d+(\.\d+)?(px|rem|em|%|vh|vw|ch)$|^auto$/;
const FONT_REG = /^[a-zA-Z0-9\s?,'"-]+$/;
const BORDER_REG = /^\d+(px|rem|em)\s+(solid|dashed|dotted|double|none)\s+.*$/;
const GRADIENT_REG = /^(linear|radial)-gradient\([^)]+\)$/;

export function sanitizeStyle(value, type) {
    if (!value || typeof value !== 'string') return '';
    
    const lower = value.toLowerCase();
    
    // STRICT SECURITY BLOCK: Reject any pixel tracking or server requests
    if (lower.includes('url') || 
        lower.includes('expression') || 
        lower.includes('javascript') || 
        lower.includes('..')) {
        console.warn('Blocked malicious style property signature:', value);
        return '';
    }
    
    const clean = value.trim();
    switch (type) {
        case 'color':
            return COLOR_REG.test(clean) ? clean : '';
        case 'size':
            return SIZE_REG.test(clean) ? clean : '';
        case 'font':
            return FONT_REG.test(clean) ? clean : '';
        case 'border':
            return BORDER_REG.test(clean) ? clean : '';
        case 'gradient':
            return GRADIENT_REG.test(clean) ? clean : '';
        default:
            return '';
    }
}

export function sanitizeCustomCss(cssString) {
    if (!cssString || typeof cssString !== 'string') return '';
    
    const declarations = cssString.split(';');
    const cleanDeclarations = [];
    
    for (let decl of declarations) {
        decl = decl.trim();
        if (!decl) continue;
        
        const colonIdx = decl.indexOf(':');
        if (colonIdx === -1) continue;
        
        const property = decl.substring(0, colonIdx).trim().toLowerCase();
        const value = decl.substring(colonIdx + 1).trim();
        
        // Validate property name (letters, numbers, hyphens, and starting double hyphens)
        const propReg = /^(--)?[a-z0-9-]+$/i;
        if (!propReg.test(property)) {
            console.warn('Blocked invalid CSS property name:', property);
            continue;
        }
        
        // Strict security checks on the value
        const valLower = value.toLowerCase();
        if (valLower.includes('url') || 
            valLower.includes('expression') || 
            valLower.includes('javascript') || 
            valLower.includes('..') ||
            valLower.includes('<') ||
            valLower.includes('>')) {
            console.warn('Blocked potentially malicious custom CSS value:', value);
            continue;
        }
        
        cleanDeclarations.push(`${property}: ${value}`);
    }
    
    return cleanDeclarations.join('; ');
}
