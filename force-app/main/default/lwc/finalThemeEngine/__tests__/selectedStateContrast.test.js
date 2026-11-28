/**
 * DEFERRED 44: chosen answers and the active step read on every look.
 *
 * A chosen chip, yes/no button, scale number, rank badge, active step or
 * Pills tab is a FILL with words on it: it paints `--c-accent-fill` with
 * `--c-on-accent-fill`, a pair the engine always writes together, so a
 * snapshot published before (neither token) keeps today's fill AND ink.
 * A chosen card's border, a matrix dot, the Underline bar, the slider and
 * the progress bars carry no words: they paint `--c-accent-mark`.
 * WCAG 1.4.11 asks 3 : 1 for the fill against what's around it; the words
 * on it are text (4.5 : 1).
 */
import fs from 'fs';
import path from 'path';
import { resolveTokens } from 'c/finalThemeEngine';
import {
    listThemeFamilies,
    listBuiltinThemes,
    getBuiltinTheme
} from 'c/finalThemeCatalog';
import {
    ratio,
    textScope,
    worstOn,
    sectionTextStyle,
    openPageTextTokens,
    TEXT,
    MARK
} from 'c/finalReadableText';
import { rangeFromToken } from 'c/finalFocusTreatment';

const GALLERY = listThemeFamilies().flatMap((f) => f.members.map((m) => m.key));
const ALL = listBuiltinThemes().map((t) => t.key);
const resolve = (key) => resolveTokens(getBuiltinTheme(key), null);

/** Every surface of one container, rebuilt from the resolved tokens. */
function scopeOf(t, underKey) {
    return textScope({
        container: rangeFromToken(t[underKey]),
        text: t['--c-text'],
        accent: t['--c-accent'],
        sectionFill: null,
        fieldFills: [t['--c-input-bg'], t['--c-field-bg']]
    });
}

// The 8 gallery looks whose raw accent fell short of 3 : 1 on the card
// before this change (measured with the engine, 2026-11-28).
const FAILED_BEFORE = [
    'marbleSplit',
    'oceanBreeze',
    'desertOasis',
    'sunsetDunes',
    'silkLuxury',
    'cosmicVortex',
    'neonNights',
    'neoBrutalism'
];

describe('DEFERRED 44: the chosen fill and its words', () => {
    it.each(GALLERY)(
        '%s: the fill reaches 3 : 1 on every card surface',
        (key) => {
            const t = resolve(key);
            const fill = t['--c-accent-fill'];
            expect(fill).toBe(t['--c-accent-mark']);
            expect(
                worstOn(fill, scopeOf(t, '--c-text-under').marks)
            ).toBeGreaterThanOrEqual(MARK);
            expect(ratio(t['--c-on-accent-fill'], fill)).toBeGreaterThanOrEqual(
                TEXT
            );
        }
    );

    it.each(GALLERY)('%s: the same on the One at a time open page', (key) => {
        const t = resolve(key);
        if (!t['--c-text-under-page']) {
            return;
        }
        const page = openPageTextTokens(t);
        const fill = page['--c-accent-fill'];
        expect(
            worstOn(fill, scopeOf(t, '--c-text-under-page').marks)
        ).toBeGreaterThanOrEqual(MARK);
        expect(ratio(page['--c-on-accent-fill'], fill)).toBeGreaterThanOrEqual(
            TEXT
        );
    });

    it('the looks that failed before now pass, and only they change', () => {
        GALLERY.forEach((key) => {
            const t = resolve(key);
            const before = worstOn(
                t['--c-accent'],
                scopeOf(t, '--c-text-under').marks
            );
            expect([key, before < MARK]).toEqual([
                key,
                FAILED_BEFORE.includes(key)
            ]);
        });
        // a look that already read keeps its exact fill and ink
        const kept = GALLERY.filter((k) => !FAILED_BEFORE.includes(k)).map(
            (k) => {
                const t = resolve(k);
                return [
                    k,
                    t['--c-accent-fill'] === t['--c-accent'],
                    t['--c-on-accent-fill'] === t['--c-on-accent']
                ];
            }
        );
        expect(kept).toEqual(kept.map(([k]) => [k, true, true]));
    });

    it('the look keeps its own ink on the fill wherever that ink reads', () => {
        const swapped = GALLERY.map(resolve).filter(
            (t) =>
                ratio(t['--c-on-accent'], t['--c-accent-fill']) >= 4.6 &&
                t['--c-on-accent-fill'] !== t['--c-on-accent']
        );
        expect(swapped).toEqual([]);
    });

    it.each(ALL)('%s writes the pair together or not at all', (key) => {
        const t = resolve(key);
        expect('--c-accent-fill' in t).toBe('--c-on-accent-fill' in t);
        expect('--c-accent-fill-page' in t).toBe(
            '--c-on-accent-fill-page' in t
        );
    });

    it('a section with its own background recalculates the pair', () => {
        // Sunset Dunes recalculates its section colours on a pale fill
        const t = resolve('sunsetDunes');
        const style = sectionTextStyle(t, '#e0f2fe');
        expect(style).toMatch(/--c-accent-fill: #[0-9a-f]{6}/);
        expect(style).toMatch(/--c-on-accent-fill: #[0-9a-f]{6}/);
    });
});

// ------------------------------------------------------------------ CSS

const LWC = path.resolve(__dirname, '../..');
const read = (c) =>
    fs
        .readFileSync(path.join(LWC, c, `${c}.css`), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list includes `selector`. */
function rule(component, selector) {
    const css = read(component);
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        const sels = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
        if (sels.includes(selector)) {
            out.push(m[2]);
        }
    }
    return out.join(';');
}

const FILLED = [
    ['finalElementRenderer', '.scale-chip.selected'],
    ['finalElementRenderer', '.choice-chip.selected'],
    ['finalElementRenderer', '.yn-btn.selected'],
    ['finalElementRenderer', '.rank-num'],
    ['finalNavRail', '.rail-link.active .rail-num'],
    ['finalNavStepper', '.step-btn.active .step-marker'],
    ['finalNavTabs', '.style-pills .tab.active']
];
const MARKED = [
    ['finalElementRenderer', '.choice-card.selected'],
    ['finalElementRenderer', '.ic-tile.selected'],
    ['finalElementRenderer', '.mx-dot.selected::before'],
    ['finalElementRenderer', '.scale-chip.emoji-chip.selected'],
    ['finalNavTabs', '.style-underline .tab.active'],
    ['finalNavStepper', '.step-btn.done .step-marker'],
    ['finalNavStepper', '.progress-fill'],
    ['finalNavRail', '.progress-fill'],
    ['finalNavOneAtATime', '.progress-fill']
];

describe('DEFERRED 44: the CSS reads the readable accent', () => {
    it.each(FILLED)(
        '%s %s paints the fill pair, never half of it',
        (c, sel) => {
            const decls = rule(c, sel);
            expect(decls).toMatch(
                /background:\s*var\(--c-accent-fill, var\(--c-accent\)\)/
            );
            expect(decls).toMatch(
                /color:\s*var\(--c-on-accent-fill, var\(--c-on-accent\)\)/
            );
            expect(decls).not.toMatch(/var\(--c-accent\)(?!\))/);
        }
    );

    it.each(MARKED)('%s %s paints the mark colour', (c, sel) => {
        const decls = rule(c, sel);
        expect(decls).toMatch(/var\(--c-accent-mark, var\(--c-accent\)\)/);
        // what's left may only be a soft tint (the emoji chip's 12% wash):
        // the border is what says "chosen"
        expect(
            decls
                .replace(/var\(--c-accent-mark, var\(--c-accent\)\)/g, '')
                .replace(
                    /color-mix\(in srgb, var\(--c-accent\) 12%, transparent\)/g,
                    ''
                )
        ).not.toMatch(/var\(--c-accent\)/);
    });

    it('an idle stepper dot is a readable ring, a reached one a filled dot', () => {
        const idle = rule('finalNavStepper', '.mode-dots .step-marker');
        expect(idle).toMatch(/background:\s*var\(\s*--c-mark-idle-fill,/);
        expect(idle).toMatch(
            /box-shadow:\s*inset 0 0 0 var\(--c-mark-idle-stroke, 0 transparent\)/
        );
        expect(
            rule('finalNavStepper', '.mode-dots .step-btn.active .step-marker')
        ).toMatch(/box-shadow:\s*none/);
    });

    it('the classic NPS tones read the same: 4.65 : 1 under white and on white', () => {
        const css = read('finalElementRenderer');
        const tone = (cls) =>
            css.match(
                new RegExp(
                    `\\.scale-chip\\.${cls}\\.selected\\s*\\{[^}]*background:\\s*(#[0-9a-f]{6})`
                )
            )[1];
        ['nps-detractor', 'nps-passive', 'nps-promoter'].forEach((cls) => {
            const c = tone(cls);
            expect(ratio('#ffffff', c)).toBeGreaterThanOrEqual(TEXT);
        });
        expect(tone('nps-passive')).toBe('#a96404');
    });
});
