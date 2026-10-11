/**
 * Narrow-form padding budget (docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md, slice S1).
 *
 * On a phone the answer column is what is left after every padded layer takes
 * its side: the page, the form's card, the section's card. These tests read the
 * real stylesheets and pin three things:
 *   1. the numbers of each layer inside the narrow-form container query,
 *   2. that the section padding cap (--c-pad-cap) exists ONLY there, so a form
 *      wider than 540px keeps byte-for-byte the padding it has today,
 *   3. that the layers add up to an answer column wide enough for five 44px
 *      buttons on the narrowest phone we support (320px).
 */
const fs = require('fs');
const path = require('path');

const LWC_ROOT = path.join(__dirname, '..', '..');

const read = (name) =>
    fs
        .readFileSync(path.join(LWC_ROOT, name, `${name}.css`), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

const NARROW = '@container final-form-viewport (max-width: 540px)';

/** Brace-matched bodies of every block that starts with `header`. */
function blocksOf(css, header) {
    const bodies = [];
    let from = css.indexOf(header);
    while (from >= 0) {
        const open = css.indexOf('{', from);
        let depth = 0;
        let i = open;
        for (; i < css.length; i++) {
            if (css[i] === '{') {
                depth++;
            } else if (css[i] === '}') {
                depth--;
                if (depth === 0) {
                    break;
                }
            }
        }
        bodies.push(css.slice(open + 1, i));
        from = css.indexOf(header, i);
    }
    return bodies;
}

/** The declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(
        css
    );
    return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

const withoutNarrow = (css) =>
    blocksOf(css, NARROW).reduce((rest, body) => rest.replace(body, ''), css);

describe('narrow form: the padding budget', () => {
    const frame = read('finalPageFrame');
    const narrow = blocksOf(frame, NARROW).join('\n');

    it('the page keeps its top and bottom and gives the sides only 4px', () => {
        expect(ruleBody(narrow, '.page:not(.page--bleed)')).toContain(
            'padding: 16px 4px 24px;'
        );
    });

    it("the form's card takes 8px a side at most (less if the theme asks for less)", () => {
        expect(ruleBody(narrow, '.panel:not(.panel--bleed)')).toBe(
            'padding: min(var(--c-space-6), 8px);'
        );
    });

    it("the page hands every section a 12px padding cap, so no authored padding can eat the phone's width", () => {
        expect(ruleBody(narrow, '.page:not(.page--bleed)')).toContain(
            '--c-pad-cap: 12px;'
        );
    });

    it('bleed layouts own their canvas: no cap, no padding change', () => {
        // the only .page / .panel rules in the narrow block exclude bleed
        const rules = narrow.match(/\.(page|panel)[^{,]*\{/g) || [];
        const padded = rules.filter((r) => !r.includes(':not(.'));
        padded.forEach((r) => {
            expect(ruleBody(narrow, r.replace(/\s*\{$/, ''))).not.toMatch(
                /padding|--c-pad-cap/
            );
        });
    });

    it('a form wider than 540px never meets the cap (it is defined nowhere else)', () => {
        expect(withoutNarrow(frame)).not.toContain('--c-pad-cap');
        ['finalSectionRenderer', 'finalNavOneAtATime'].forEach((name) => {
            // the other stylesheets may only READ it, always with an unreachable fallback
            const reads = read(name).match(/var\(--c-pad-cap[^)]*\)/g) || [];
            expect(reads.length).toBeGreaterThan(0);
            reads.forEach((r) => expect(r).toBe('var(--c-pad-cap, 9999px)'));
            expect(read(name)).not.toMatch(/--c-pad-cap\s*:/);
        });
    });

    it('all three section looks read the cap', () => {
        const css = read('finalSectionRenderer');
        ['.style-plain', '.style-card', '.style-boxed'].forEach((sel) => {
            expect(ruleBody(css, sel)).toContain(
                'padding: min(var(--c-section-pad), var(--c-pad-cap, 9999px));'
            );
        });
    });

    it("One at a time's card-panel inset follows the same cap, so its strip stays on the sections' edge", () => {
        expect(ruleBody(read('finalNavOneAtATime'), '.mode-panel')).toBe(
            'padding-inline: min(var(--c-section-pad), var(--c-pad-cap, 9999px));'
        );
    });

    it('the layers add up: five 44px buttons and four 4px gaps fit at 320px', () => {
        const number = (text, re) => Number(re.exec(text)[1]);
        const pageSide = number(
            ruleBody(narrow, '.page:not(.page--bleed)'),
            /padding: \d+px (\d+)px \d+px;/
        );
        const panelPad = number(
            ruleBody(narrow, '.panel:not(.panel--bleed)'),
            /, (\d+)px\)/
        );
        const cap = number(
            ruleBody(narrow, '.page:not(.page--bleed)'),
            /--c-pad-cap: (\d+)px;/
        );
        const CARD_BORDER = 1; // a form card and a section card may each draw 1px
        const perSide = pageSide + CARD_BORDER + panelPad + CARD_BORDER + cap;
        // The public site keeps its own 15px a side around the form (measured in
        // the audit, 3C), so a 320 / 360 / 390px phone gives the form 290 / 330 / 360px.
        const column = (phone) => phone - 2 * 15 - 2 * perSide;
        expect(perSide).toBe(26);
        expect([320, 360, 390].map(column)).toEqual([238, 278, 308]);
        const FIVE_BUTTONS = 5 * 44 + 4 * 4;
        expect(column(320)).toBeGreaterThanOrEqual(FIVE_BUTTONS);
    });
});

describe('split hero: it owns its padding, so it follows the same budget on a phone', () => {
    // Measured on the Lightning viewer at 390px (334px form): the split hero's
    // answer column was 194px, the only layout under the 236px a five-button scale
    // needs. Its form column, its floating card and its sections each took their
    // own side padding (16 + 25 + 21).
    const SPLIT = '@container split (max-width: 540px)';
    const split = read('finalNavSplitHero');
    const narrow = blocksOf(split, SPLIT).join('\n');
    const wide = blocksOf(split, SPLIT).reduce(
        (text, body) => text.replace(body, ''),
        split
    );

    it('the form column keeps 4px a side', () => {
        expect(ruleBody(narrow, '.mode-bleed .form')).toContain(
            'padding: var(--c-space-5) 4px;'
        );
    });

    it("the form's card takes 8px a side at most and hands its sections the 12px cap", () => {
        const card = ruleBody(narrow, '.mode-bleed .form-card');
        expect(card).toContain('padding: min(var(--c-space-6), 8px);');
        expect(card).toContain('--c-pad-cap: 12px;');
    });

    it('the wide split hero is untouched: no cap, the padding it has today', () => {
        expect(wide).not.toContain('--c-pad-cap');
        expect(ruleBody(wide, '.mode-bleed .form-card')).toContain(
            'padding: var(--c-space-6);'
        );
        expect(ruleBody(wide, '.mode-bleed .form')).toContain(
            'padding: var(--c-space-6) var(--c-space-5);'
        );
    });

    it('the same 26px a side as every other layout: 4 + (1 + 8) + (1 + 12)', () => {
        const side = Number(
            /padding: var\(--c-space-5\) (\d+)px;/.exec(
                ruleBody(narrow, '.mode-bleed .form')
            )[1]
        );
        const card = Number(
            /, (\d+)px\)/.exec(ruleBody(narrow, '.mode-bleed .form-card'))[1]
        );
        const cap = Number(
            /--c-pad-cap: (\d+)px;/.exec(
                ruleBody(narrow, '.mode-bleed .form-card')
            )[1]
        );
        expect(side + 1 + card + 1 + cap).toBe(26);
    });
});
