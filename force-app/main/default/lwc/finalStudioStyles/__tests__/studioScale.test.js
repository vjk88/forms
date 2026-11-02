/**
 * Studio design-system guard (docs/FinalDesign/DESIGN_SYSTEM.md §10).
 *
 * Reads every Studio `final*` stylesheet (every final* component that is not on
 * the respondent list below, so new components are covered automatically) and
 * fails on:
 *   - a raw font size, weight, colour, radius, shadow, z-index, font family or
 *     transition/animation time (use a --c-studio-* token, §4);
 *   - text-transform: uppercase (sentence case everywhere, §0 rule 7);
 *   - a respondent theme token (--c-*, not --c-studio-*) read in Studio CSS (§1);
 *   - a var(--c-studio-*) the bundle does not define;
 *   - a custom property whose own fallback names itself (an invalid cycle).
 * It also pins the bundle's token values to the §4 tables.
 *
 * Today's violations are listed in studioScaleAllowlist.json, keyed by
 * component, selector and rule. The list may only SHRINK: a new violation
 * fails, and so does a listed one that has been fixed (delete it from the list
 * in the same PR). To rewrite the list after fixing violations, run
 *   STUDIO_SCALE_WRITE=1 npx jest studioScale
 * which refuses to write if any count went up.
 */
const fs = require('fs');
const path = require('path');

const LWC_ROOT = path.join(__dirname, '..', '..');
const BUNDLE = path.join(
    LWC_ROOT,
    'finalStudioStyles',
    'finalStudioStyles.css'
);
const ALLOWLIST = path.join(__dirname, 'studioScaleAllowlist.json');

// Respondent components (DESIGN_SYSTEM §1) follow the theme, not this guard.
const RESPONDENT = new Set([
    'finalPageFrame',
    'finalFormViewer',
    'finalFormHeader',
    'finalSubmitBar',
    'finalLayoutZones',
    'finalSectionRenderer',
    'finalElementRenderer',
    'finalAfterSubmit',
    'finalGuestHost',
    'finalLookup',
    'finalFormHighlight'
]);
const isRespondent = (name) =>
    RESPONDENT.has(name) || name.startsWith('finalNav');

const NAMED_COLOURS =
    /\b(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i;

function readCss(file) {
    return fs
        .readFileSync(file, 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Studio stylesheets: final* components with a same-named .css, minus respondent ones and the bundle. */
function studioSheets() {
    return fs
        .readdirSync(LWC_ROOT)
        .filter(
            (d) =>
                d.startsWith('final') &&
                d !== 'finalStudioStyles' &&
                !isRespondent(d) &&
                fs.existsSync(path.join(LWC_ROOT, d, `${d}.css`))
        )
        .sort();
}

/**
 * Split CSS into declarations with the selector they sit under. Paren- and
 * quote-aware, so data URIs and strings with ; or { do not break it.
 * @keyframes bodies are skipped (their steps are not selectors).
 */
function declarations(css) {
    const out = [];
    const stack = [];
    let buf = '';
    let depth = 0;
    let quote = null;
    const flush = () => {
        const text = buf.trim();
        buf = '';
        if (!text || !stack.length) {
            return;
        }
        if (stack.some((h) => /^@(-webkit-)?keyframes/.test(h))) {
            return;
        }
        const selector = [...stack].reverse().find((h) => !h.startsWith('@'));
        const colon = text.indexOf(':');
        if (!selector || colon < 0) {
            return;
        }
        out.push({
            selector: selector.replace(/\s+/g, ' '),
            prop: text.slice(0, colon).trim().toLowerCase(),
            value: text.slice(colon + 1).trim()
        });
    };
    for (const ch of css) {
        if (quote) {
            buf += ch;
            if (ch === quote) {
                quote = null;
            }
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            buf += ch;
        } else if (ch === '(') {
            depth++;
            buf += ch;
        } else if (ch === ')') {
            depth--;
            buf += ch;
        } else if (depth > 0) {
            buf += ch;
        } else if (ch === '{') {
            stack.push(buf.trim());
            buf = '';
        } else if (ch === '}') {
            flush();
            stack.pop();
        } else if (ch === ';') {
            flush();
        } else {
            buf += ch;
        }
    }
    return out;
}

/** Remove every var(...), url(...) and quoted string (paren-aware). */
function stripFunctions(value) {
    let out = '';
    let i = 0;
    while (i < value.length) {
        const rest = value.slice(i);
        const fn = /^(var|url)\(/.exec(rest);
        if (fn) {
            let depth = 0;
            let j = i;
            for (; j < value.length; j++) {
                if (value[j] === '(') {
                    depth++;
                } else if (value[j] === ')') {
                    depth--;
                    if (depth === 0) {
                        j++;
                        break;
                    }
                }
            }
            out += ' V ';
            i = j;
        } else if (value[i] === '"' || value[i] === "'") {
            const end = value.indexOf(value[i], i + 1);
            out += ' S ';
            i = end < 0 ? value.length : end + 1;
        } else {
            out += value[i];
            i++;
        }
    }
    return out;
}

const LENGTH = /(^|[^\w#-])-?\d*\.?\d+(px|rem|em|pt|%)(?![\w-])/i;
const TIME = /(^|[^\w-])-?\d*\.?\d+m?s(?![\w-])/i;
const COLOUR =
    /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklch|oklab|color)\(/i;

/** Rules a declaration breaks (each is one allowlist key part). */
function violations({ prop, value }, defined) {
    const found = [];
    const bare = stripFunctions(value);
    const isCustom = prop.startsWith('--');

    if (
        (prop === 'font-size' || prop === 'font') &&
        (LENGTH.test(bare) || /\b(x?x-)?(small|large)\b|\bmedium\b/.test(bare))
    ) {
        found.push('raw font size');
    }
    if (
        prop === 'font-weight' &&
        !/^\s*(V|inherit|initial|unset)\s*$/.test(bare)
    ) {
        found.push('raw font weight');
    }
    if (
        prop === 'font-family' &&
        !/^\s*(V|inherit|initial|unset)\s*$/.test(bare)
    ) {
        found.push('raw font family');
    }
    if (
        COLOUR.test(bare) ||
        (!isCustom &&
            NAMED_COLOURS.test(bare) &&
            !/^(content|grid-template-areas)$/.test(prop))
    ) {
        found.push('raw colour');
    }
    if (
        /radius/.test(prop) &&
        !isCustom &&
        LENGTH.test(bare) &&
        !/^\s*0(px)?\s*$/.test(bare)
    ) {
        found.push('raw radius');
    }
    if (
        /shadow/.test(prop) &&
        !isCustom &&
        /\d/.test(bare) &&
        !/^\s*none\s*$/.test(bare)
    ) {
        found.push('raw shadow');
    }
    if (prop === 'z-index' && /\d/.test(bare) && !/^\s*0\s*$/.test(bare)) {
        found.push('raw z-index');
    }
    if (
        /^(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)$/.test(
            prop
        ) &&
        TIME.test(bare)
    ) {
        found.push('raw motion time');
    }
    if (prop === 'text-transform' && /uppercase/i.test(value)) {
        found.push('ALL CAPS');
    }
    if (/var\(\s*--c-(?!studio-)/.test(value)) {
        found.push('respondent token in Studio CSS');
    }
    for (const m of value.matchAll(/var\(\s*--c-studio-([\w-]+)/g)) {
        if (!defined.has(m[1])) {
            found.push(`undefined --c-studio-${m[1]}`);
        }
    }
    if (
        isCustom &&
        new RegExp(`var\\(\\s*${prop.replace(/[-]/g, '\\-')}\\s*[,)]`).test(
            value
        )
    ) {
        found.push('self-referencing variable');
    }
    return found;
}

function bundleTokens() {
    const map = new Map();
    for (const d of declarations(readCss(BUNDLE))) {
        if (d.prop.startsWith('--c-studio-')) {
            map.set(
                d.prop.slice('--c-studio-'.length),
                d.value.replace(/\s+/g, ' ').trim()
            );
        }
    }
    return map;
}

/** { component: { "selector || rule": count } } for every Studio sheet. */
function currentViolations() {
    const defined = new Set(bundleTokens().keys());
    const result = {};
    for (const name of studioSheets()) {
        const counts = {};
        for (const d of declarations(
            readCss(path.join(LWC_ROOT, name, `${name}.css`))
        )) {
            for (const rule of violations(d, defined)) {
                const key = `${d.selector} || ${rule}`;
                counts[key] = (counts[key] || 0) + 1;
            }
        }
        if (Object.keys(counts).length) {
            result[name] = Object.fromEntries(Object.entries(counts).sort());
        }
    }
    return result;
}

// Bugs, never allowlisted: these must be fixed, not listed.
const NEVER_ALLOWED = /^(undefined --c-studio-|self-referencing variable)/;

describe('Studio stylesheets follow the design system (DESIGN_SYSTEM §10)', () => {
    const current = currentViolations();
    const allowed = fs.existsSync(ALLOWLIST)
        ? JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'))
        : null;

    if (process.env.STUDIO_SCALE_WRITE === '1') {
        test('rewrite the allowlist (shrink only)', () => {
            // The first write (no list yet) records today's state as is.
            const grew = [];
            for (const [name, counts] of Object.entries(
                allowed ? current : {}
            )) {
                for (const [key, n] of Object.entries(counts)) {
                    const before = (allowed[name] || {})[key] || 0;
                    if (n > before) {
                        grew.push(`${name}: ${key} (${before} -> ${n})`);
                    }
                }
            }
            expect(grew).toEqual([]);
            fs.writeFileSync(
                ALLOWLIST,
                JSON.stringify(current, null, 2) + '\n'
            );
        });
        return;
    }

    test('the allowlist exists', () => {
        expect(allowed).not.toBeNull();
    });

    test('no bugs: every --c-studio-* reference exists and no variable names itself', () => {
        const bugs = [];
        for (const [name, counts] of Object.entries(current)) {
            for (const key of Object.keys(counts)) {
                if (NEVER_ALLOWED.test(key.split(' || ')[1])) {
                    bugs.push(`${name}: ${key}`);
                }
            }
        }
        expect(bugs).toEqual([]);
    });

    test('no new violations (use a token, a pattern, or sentence case)', () => {
        const added = [];
        for (const [name, counts] of Object.entries(current)) {
            for (const [key, n] of Object.entries(counts)) {
                const limit = ((allowed || {})[name] || {})[key] || 0;
                if (n > limit) {
                    added.push(`${name}: ${key} (${n}, allowed ${limit})`);
                }
            }
        }
        expect(added).toEqual([]);
    });

    test('fixed violations are removed from the allowlist (it may only shrink)', () => {
        const stale = [];
        for (const [name, counts] of Object.entries(allowed || {})) {
            for (const [key, limit] of Object.entries(counts)) {
                const n = (current[name] || {})[key] || 0;
                if (n < limit) {
                    stale.push(`${name}: ${key} (allowed ${limit}, now ${n})`);
                }
            }
        }
        expect(stale).toEqual([]);
    });
});

describe('the bundle holds the DESIGN_SYSTEM §4 values', () => {
    const tokens = bundleTokens();
    const EXPECTED = {
        'fs-caption': '11px',
        'fs-small': '12px',
        'fs-body': '13px',
        'fs-subhead': '14px',
        'fs-title': '16px',
        'fs-display': '20px',
        'fw-regular': '400',
        'fw-strong': '600',
        'lh-tight': '1.25',
        'lh-body': '1.45',
        'space-1': '2px',
        'space-2': '4px',
        'space-3': '8px',
        'space-4': '12px',
        'space-5': '16px',
        'space-6': '24px',
        'space-7': '32px',
        'space-8': '48px',
        'space-lg': '24px',
        'control-h': '32px',
        'bar-h': '56px',
        'radius-sm': '4px',
        'radius-md': '8px',
        'radius-lg': '12px',
        'radius-pill': '999px',
        'shadow-2': '0 10px 24px rgb(15 23 42 / 12%)',
        'shadow-3': '0 20px 48px rgb(0 0 0 / 28%)',
        'selected-ring': '0 0 0 1px var(--c-studio-accent)',
        'selected-bar': 'inset 3px 0 0 var(--c-studio-accent)',
        'dialog-shadow': 'var(--c-studio-shadow-3)',
        'z-raised': '2',
        'z-dropdown': '20',
        'z-menu': '30',
        'z-drawer': '1000',
        'z-action-dialog': '1100',
        'z-backdrop': '9000',
        'z-modal': '9001',
        'z-popover': '9500',
        duration: '150ms',
        ease: 'ease',
        accent: '#0f766e',
        text: '#1f2937',
        'text-weak': '#526071',
        'border-strong': '#7c8999',
        border: '#dce2e9',
        'border-subtle': '#e8edf2',
        workspace: '#f1f5f9'
    };

    test.each(Object.entries(EXPECTED))(
        '--c-studio-%s is %s',
        (name, value) => {
            expect(tokens.get(name)).toBe(value);
        }
    );

    test('the Studio fonts are the system stacks', () => {
        expect(tokens.get('font')).toMatch(
            /^-apple-system, BlinkMacSystemFont, 'Segoe UI'/
        );
        expect(tokens.get('font-mono')).toMatch(/^ui-monospace,/);
    });
});
