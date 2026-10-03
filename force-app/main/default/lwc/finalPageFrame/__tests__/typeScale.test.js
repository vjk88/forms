/**
 * Respondent type scale guard (docs/FinalDesign/specs/RESPONDENT_TYPE_SCALE_RECOMMENDATIONS.md).
 *
 * Two jobs, both reading the real stylesheets:
 *   1. NO respondent stylesheet may hard-code a font size. Every size is a role
 *      token (--c-fs-*) declared once, in finalPageFrame.css (plus the Single
 *      question restatement in finalSectionRenderer.css). A new px/rem size
 *      anywhere else fails here, which is how the 30-sizes drift is kept dead.
 *   2. The token VALUES match the spec's tables (every size set x device), so a
 *      casual edit to a number cannot slip through.
 *
 * Studio's own screens are a separate typography pass and are deliberately not
 * listed.
 */
const fs = require('fs');
const path = require('path');

const LWC_ROOT = path.join(__dirname, '..', '..');

// Every stylesheet a respondent can see. finalPageFrame is the one place the
// numbers live, so it is checked separately (table test + base size below).
const RESPONDENT = [
    'finalElementRenderer',
    'finalSectionRenderer',
    'finalFormHeader',
    'finalFormViewer',
    'finalSubmitBar',
    'finalAfterSubmit',
    'finalGuestHost',
    'finalLookup',
    'finalFormHighlight',
    'finalNavOneAtATime',
    'finalNavSplitHero',
    'finalNavStepper',
    'finalNavRail',
    'finalNavTabs',
    'finalNavScroll',
    'finalNavAccordion'
];

const read = (name) =>
    fs
        .readFileSync(path.join(LWC_ROOT, name, `${name}.css`), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

/** Replace every var(--c-fs-…, fallback) with a placeholder (paren-aware). */
function stripRoleVars(value) {
    let out = '';
    let i = 0;
    while (i < value.length) {
        if (value.startsWith('var(--c-fs-', i)) {
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
            out += '#';
            i = j;
        } else {
            out += value[i];
            i++;
        }
    }
    return out;
}

const HARD_CODED = /[\d.]+\s*(px|rem|pt|vw|vh|%)(?![\w-])/;
const SIZE_KEYWORD =
    /\b(xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)\b/;

describe('respondent stylesheets use role tokens, never their own size', () => {
    it.each(RESPONDENT)('%s has no hard-coded font size', (name) => {
        const css = read(name);
        const violations = [];
        const sizes = /font-size\s*:\s*([^;{}]+)/g;
        let m;
        while ((m = sizes.exec(css)) !== null) {
            const rest = stripRoleVars(m[1]);
            if (HARD_CODED.test(rest) || SIZE_KEYWORD.test(rest)) {
                violations.push(`font-size: ${m[1].trim()}`);
            }
        }
        // a `font:` shorthand may only inherit — it must not carry a size
        const shorthand = /(?<![-\w])font\s*:\s*([^;{}]+)/g;
        while ((m = shorthand.exec(css)) !== null) {
            if (m[1].trim() !== 'inherit') {
                violations.push(`font: ${m[1].trim()}`);
            }
        }
        expect(violations).toEqual([]);
    });

    it('the retired fluid ladder is gone', () => {
        const all = RESPONDENT.map(read).join('\n');
        expect(all).not.toMatch(/--convo-base/);
        expect(all).not.toMatch(/--c-q-title-size/);
        expect(all).not.toMatch(/--c-q-caption-size/);
        expect(all).not.toMatch(/--c-q-answer-size/);
        expect(all).not.toMatch(/--c-label-size/); // legacy token, unread
    });

    it('every role a stylesheet reads is declared', () => {
        const declared = new Set();
        for (const name of ['finalPageFrame', 'finalSectionRenderer']) {
            for (const m of read(name).matchAll(/(--c-fs-[a-z-]+)\s*:/g)) {
                declared.add(m[1]);
            }
        }
        const missing = new Set();
        for (const name of RESPONDENT) {
            for (const m of read(name).matchAll(/var\((--c-fs-[a-z-]+)/g)) {
                if (!declared.has(m[1])) {
                    missing.add(`${name}: ${m[1]}`);
                }
            }
        }
        expect([...missing]).toEqual([]);
    });

    it('the form declares its own base size once, in rem', () => {
        const sizes = [
            ...read('finalPageFrame').matchAll(/font-size\s*:\s*([^;]+)/g)
        ].map((m) => m[1].trim());
        expect(sizes).toEqual(['1rem']);
    });

    it('typed text follows the answer size on both hosts (.field)', () => {
        const css = read('finalElementRenderer');
        const field = /\n\.field\s*\{([^}]*)\}/.exec(css)[1];
        expect(field).toMatch(/font-size:\s*var\(--c-fs-answer\)/);
        expect(field).toMatch(
            /--dxp-s-form-element-text-font-size:\s*var\(--c-fs-answer\)/
        );
    });
});

// ---------------------------------------------------------------------------
// The numbers. A mini cascade over the two stylesheets that declare the tokens.
// ---------------------------------------------------------------------------

const MOBILE_QUERY =
    /^@container\s+final-form-viewport\s*\(\s*max-width:\s*540px\s*\)$/;

/** Style rules in source order; `mobile` marks the 540px form-width query. */
function parseRules(css) {
    const rules = [];
    const walk = (text, mobile) => {
        let i = 0;
        while (i < text.length) {
            const open = text.indexOf('{', i);
            if (open === -1) {
                break;
            }
            let depth = 0;
            let close = open;
            for (; close < text.length; close++) {
                if (text[close] === '{') {
                    depth++;
                } else if (text[close] === '}') {
                    depth--;
                    if (depth === 0) {
                        break;
                    }
                }
            }
            const header = text.slice(i, open).trim();
            const body = text.slice(open + 1, close);
            if (header.startsWith('@')) {
                if (MOBILE_QUERY.test(header)) {
                    walk(body, true);
                }
            } else {
                const decls = {};
                for (const d of body.matchAll(/([-\w]+)\s*:\s*([^;]+);?/g)) {
                    decls[d[1]] = d[2].trim().replace(/\s+/g, ' ');
                }
                rules.push({
                    selector: header.replace(/\s+/g, ' '),
                    mobile,
                    decls
                });
            }
            i = close + 1;
        }
    };
    walk(css, false);
    return rules;
}

const frameRules = parseRules(read('finalPageFrame'));
const sectionRules = parseRules(read('finalSectionRenderer'));

function roleTokens({
    sizeSet = 'standard',
    single = false,
    convo = false,
    mobile = false
}) {
    const frameMatch = (sel) =>
        sel === '.page' ||
        (sel === ".page[data-size-set='section']" && sizeSet === 'section') ||
        (sel === '.page[data-single]' && single);
    const specificity = (sel) => (sel === '.page' ? 1 : 2);
    const layers = [
        frameRules
            .filter((r) => frameMatch(r.selector) && (!r.mobile || mobile))
            .map((r, order) => ({ ...r, order, spec: specificity(r.selector) }))
            .sort((a, b) => a.spec - b.spec || a.order - b.order)
    ];
    // .sec-convo styles a DESCENDANT of .page, so it wins regardless of specificity
    if (convo) {
        layers.push(
            sectionRules.filter(
                (r) => r.selector === '.sec-convo' && (!r.mobile || mobile)
            )
        );
    }
    const tokens = {};
    for (const rule of layers.flat()) {
        for (const [prop, value] of Object.entries(rule.decls)) {
            if (prop.startsWith('--c-fs-')) {
                tokens[prop.replace('--c-fs-', '')] = value;
            }
        }
    }
    return tokens;
}

// rem -> px at the browser's 16px base, rounded so 1.15rem reads as 18.4
const px = (value) => {
    const m = /^([\d.]+)rem$/.exec(value);
    return m ? Math.round(parseFloat(m[1]) * 16 * 100) / 100 : value;
};

const STANDARD = {
    title: 28,
    'title-compact': 20,
    thanks: 28,
    section: 20,
    label: 16,
    answer: 16,
    desc: 16,
    help: 14,
    error: 16,
    secondary: 14,
    button: 16,
    nav: 16,
    brand: 18,
    'hero-compact': 18.4,
    'readout-min': 20
};
const STANDARD_M = { ...STANDARD, title: 20, thanks: 20, section: 18 };
const SECTION = { ...STANDARD, section: 26, label: 18, answer: 18 };
const SECTION_M = { ...STANDARD_M, section: 20, label: 16, answer: 16 };
const SINGLE = { ...STANDARD, title: 24, section: 14, label: 32, answer: 18 };
const SINGLE_M = {
    ...STANDARD_M,
    title: 20,
    section: 14,
    label: 24,
    answer: 16
};

describe('type scale values match the spec tables (px)', () => {
    const cases = [
        ['Standard, desktop and tablet', {}, STANDARD],
        ['Standard, phone', { mobile: true }, STANDARD_M],
        [
            'Section at a time, desktop and tablet',
            { sizeSet: 'section' },
            SECTION
        ],
        [
            'Section at a time, phone',
            { sizeSet: 'section', mobile: true },
            SECTION_M
        ],
        [
            'Single question, desktop and tablet (standard layout)',
            { single: true, convo: true },
            SINGLE
        ],
        [
            'Single question, phone (standard layout)',
            { single: true, convo: true, mobile: true },
            SINGLE_M
        ],
        [
            'Single question, desktop and tablet (One at a time)',
            { sizeSet: 'section', single: true, convo: true },
            SINGLE
        ],
        [
            'Single question, phone (One at a time)',
            { sizeSet: 'section', single: true, convo: true, mobile: true },
            SINGLE_M
        ]
    ];

    it.each(cases)('%s', (label, ctx, expected) => {
        const tokens = roleTokens(ctx);
        const actual = {};
        for (const key of Object.keys(expected)) {
            actual[key] = px(tokens[key]);
        }
        expect(actual).toEqual(expected);
    });

    it('the hero title stays the smooth 25.6 to 38.4px recipe', () => {
        expect(roleTokens({}).hero).toBe('clamp(1.6rem, 4cqw, 2.4rem)');
    });

    it('Single question keeps help, descriptions, errors and buttons at the standard size', () => {
        const single = roleTokens({ single: true, convo: true });
        for (const key of ['help', 'desc', 'error', 'secondary', 'button']) {
            expect(px(single[key])).toBe(STANDARD[key]);
        }
    });

    it('reading floor: nothing a respondent reads is under 14px, typed text 16px or more', () => {
        for (const [, ctx] of cases) {
            const tokens = roleTokens(ctx);
            for (const key of [
                'help',
                'secondary',
                'section',
                'desc',
                'error',
                'button',
                'nav'
            ]) {
                expect(px(tokens[key])).toBeGreaterThanOrEqual(14);
            }
            expect(px(tokens.answer)).toBeGreaterThanOrEqual(16);
            expect(px(tokens.label)).toBeGreaterThanOrEqual(16);
        }
    });
});
