/**
 * Some tokens hold a whole box-shadow (`0 0 0 3px rgba(...)`), not a colour.
 * Inside `outline: 2px solid var(--c-focus-ring, ...)` that makes the outline
 * invalid when the page computes it, so the browser draws NO outline and the
 * keyboard focus disappears (file drop zone and file "x", fixed 2026-10-24).
 * The fallback never helps: the engine always emits the token. A colour for
 * an outline comes from --c-field-focus instead.
 */
import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';

const fs = require('fs');
const path = require('path');

const LWC = path.join(__dirname, '..', '..');

// Tokens whose value is a box-shadow, never usable as a colour.
const SHADOW_TOKENS = [
    '--c-focus-ring',
    '--c-input-shadow-focus',
    '--c-input-shadow',
    '--c-section-shadow'
];

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(/i;

function finalStylesheets() {
    return fs
        .readdirSync(LWC)
        .filter((dir) => dir.startsWith('final'))
        .map((dir) => path.join(LWC, dir, `${dir}.css`))
        .filter((file) => fs.existsSync(file));
}

function declarations(file) {
    const css = fs
        .readFileSync(file, 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]*)/g)].map((m) => ({
        file: path.basename(file),
        property: m[1],
        value: m[2].replace(/\s+/g, ' ')
    }));
}

// A shadow token may feed a box-shadow, or a hook whose name says shadow.
function shadowSlot(property) {
    return /(^|-)box-shadow$/.test(property) || /^--.*shadow/.test(property);
}

describe('shadow tokens are only ever used as shadows', () => {
    it.each(listBuiltinThemes().map((t) => t.key))(
        '%s: the focus ring is a shadow, --c-field-focus a solid colour',
        (key) => {
            const t = resolveTokens(getBuiltinTheme(key), null);
            // a shadow starts with a length (or inset), never with a colour
            expect(t['--c-focus-ring']).toMatch(/^(inset\s+)?-?\d/);
            const focus = t['--c-field-focus'];
            expect(HEX.test(focus) || RGB.test(focus)).toBe(true);
        }
    );

    it('no stylesheet puts a shadow token anywhere but a shadow', () => {
        const misuse = finalStylesheets()
            .flatMap(declarations)
            .filter(
                (d) =>
                    SHADOW_TOKENS.some((tok) =>
                        d.value.includes(`var(${tok}`)
                    ) && !shadowSlot(d.property)
            )
            .map((d) => `${d.file}: ${d.property}: ${d.value}`);
        expect(misuse).toEqual([]);
    });

    it('the scan really reads the renderer stylesheet', () => {
        const files = finalStylesheets().map((f) => path.basename(f));
        expect(files).toContain('finalElementRenderer.css');
        expect(files.length).toBeGreaterThan(20);
    });
});

/**
 * Windows High Contrast (forced colours) drops every box-shadow, so a focus
 * rule that removes the outline and draws only a shadow ring leaves keyboard
 * users with NO focus mark there (IMPL_PLAN_FOCUS_CONTRAST §2). Such rules
 * keep a transparent outline instead: invisible normally, repainted in a
 * system colour in High Contrast.
 */
describe('focus stays visible in Windows High Contrast', () => {
    // The stylesheets a respondent sees (Studio-only screens are out of scope).
    const RESPONDENT = [
        'finalAfterSubmit',
        'finalElementRenderer',
        'finalFormViewer',
        'finalLookup',
        'finalNavAccordion',
        'finalNavOneAtATime',
        'finalNavRail',
        'finalNavSplitHero',
        'finalNavStepper',
        'finalNavTabs',
        'finalPageFrame',
        'finalSectionRenderer',
        'finalSubmitBar'
    ];
    // Allowed, with the reason: the slider draws a real outline on its thumb
    // (::-webkit-slider-thumb / ::-moz-range-thumb), which forced colours keep.
    const ALLOWED = ['.slider-input:focus-visible'];

    function focusRules(name) {
        const css = fs
            .readFileSync(path.join(LWC, name, `${name}.css`), 'utf8')
            .replace(/\r\n/g, '\n')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .map((m) => ({
                file: name,
                selector: m[1].replace(/\s+/g, ' ').trim(),
                body: m[2]
            }))
            .filter((r) => r.selector.includes(':focus'));
    }

    it('no respondent focus rule removes the outline', () => {
        const bad = RESPONDENT.flatMap(focusRules)
            .filter((r) => /\boutline:\s*(none|0)\s*(;|$)/.test(r.body))
            .filter((r) => !ALLOWED.includes(r.selector))
            .map((r) => `${r.file}.css: ${r.selector}`);
        expect(bad).toEqual([]);
    });

    it('the scan finds the focus rules it is meant to guard', () => {
        const rules = RESPONDENT.flatMap(focusRules);
        const transparent = rules.filter((r) =>
            /outline:\s*2px solid transparent/.test(r.body)
        );
        // 17 rules switched in PR A, plus the lookup's two
        expect(transparent.length).toBeGreaterThanOrEqual(19);
        expect(rules.map((r) => r.selector)).toContain(
            '.scale-chip:focus-visible, .scale-icon:focus-visible'
        );
    });
});
