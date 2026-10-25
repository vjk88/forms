import {
    contrast,
    exact,
    over,
    stackRange,
    passes,
    focusTreatment,
    focusTokens,
    sectionFocusStyle,
    openPageTokens,
    neutralFocusTokens,
    rangeFromToken,
    FULL_RANGE,
    FOCUS_DARK,
    FOCUS_LIGHT
} from 'c/finalFocusTreatment';
import PUBLISHED from './__fixtures__/publishedBeforePartB.json';

// IMPL_PLAN_FOCUS_CONTRAST v5 Part B (§4–§7, §11).

describe('ranges', () => {
    it('a translucent layer over anything unknown lands between over-black and over-white', () => {
        // Ocean Breeze's card: white at 72%
        expect(over('rgba(255, 255, 255, 0.72)', FULL_RANGE)).toEqual([
            '#b8b8b8',
            '#ffffff'
        ]);
    });

    it('an opaque layer collapses the range to one colour', () => {
        expect(stackRange([{ unknown: true }, { color: '#fafafa' }])).toEqual([
            '#fafafa',
            '#fafafa'
        ]);
    });

    it('anything unknown above resets to black-to-white', () => {
        expect(stackRange([{ color: '#ffffff' }, { unknown: true }])).toEqual([
            ...FULL_RANGE
        ]);
    });

    it('a colour INSIDE a range fails even when it passes both ends', () => {
        const grey = '#767676';
        expect(contrast(grey, '#000000')).toBeGreaterThanOrEqual(3);
        expect(contrast(grey, '#ffffff')).toBeGreaterThanOrEqual(3);
        expect(passes(grey, [...FULL_RANGE])).toBe(false);
    });

    it('a colour outside the range passes only at 3:1 against the nearer end', () => {
        expect(passes('#0f5d76', ['#b8b8b8', '#ffffff'])).toBe(true);
        expect(passes('#06b6d4', ['#b8b8b8', '#ffffff'])).toBe(false);
    });
});

describe('focusTreatment', () => {
    const card = exact('#ffffff');

    it('a colour that already passes comes back exactly as given', () => {
        const t = focusTreatment({
            base: '#1E3A8A',
            toward: '#1f2937',
            outside: [card]
        });
        expect(t.fallback).toBe(false);
        expect(t.focus).toBe('#1E3A8A');
        expect(t.partner).toBe(FOCUS_LIGHT);
        expect(t.ring).toBe('0 0 0 2px #ffffff, 0 0 0 4px #1E3A8A');
    });

    it('a pale colour moves toward the text colour until it passes', () => {
        const t = focusTreatment({
            base: '#06b6d4',
            toward: '#0e7490',
            outside: [['#b8b8b8', '#ffffff']]
        });
        expect(t.fallback).toBe(false);
        expect(passes(t.focus, ['#b8b8b8', '#ffffff'])).toBe(true);
    });

    it('white, black and #777777 together: the fallback, never a failing colour', () => {
        const t = focusTreatment({
            base: '#1e3a8a',
            toward: '#1f2937',
            outside: [exact('#ffffff'), exact('#000000'), exact('#777777')]
        });
        expect(t.fallback).toBe(true);
        expect(t.focus).toBe(FOCUS_DARK);
        expect(t.partner).toBe(FOCUS_LIGHT);
        expect(contrast(FOCUS_DARK, FOCUS_LIGHT)).toBeGreaterThanOrEqual(9);
    });

    it('a range too wide for any colour (glass over glow): the fallback', () => {
        const t = focusTreatment({
            base: '#ff2e93',
            toward: '#f3f0ff',
            outside: [over('rgba(255, 255, 255, 0.08)', FULL_RANGE)]
        });
        expect(t.fallback).toBe(true);
    });

    it('an unjudgeable surface (a card gradient) or colour: the fallback', () => {
        expect(
            focusTreatment({ base: '#1e3a8a', fallback: true }).fallback
        ).toBe(true);
        expect(
            focusTreatment({ base: 'var(--x)', outside: [card] }).fallback
        ).toBe(true);
    });

    it('the indicator must also read against the button fill it touches', () => {
        // #595959 passes the white card, but neither it nor its white partner
        // reaches 3:1 on a #9a9a9a button: the colour has to move
        const button = exact('#9a9a9a');
        expect(passes('#595959', card)).toBe(true);
        expect(passes('#595959', button) || passes('#ffffff', button)).toBe(
            false
        );
        const t = focusTreatment({
            base: '#595959',
            toward: '#595959',
            outside: [card],
            inside: [button]
        });
        expect(t.focus).not.toBe('#595959');
        expect(passes(t.focus, button) || passes(t.partner, button)).toBe(true);
        expect(passes(t.focus, card)).toBe(true);
    });

    it('underline fields keep an underline; the fallback underline has two colours', () => {
        const ok = focusTreatment({ base: '#1e3a8a', outside: [card] });
        expect(focusTokens(ok, 'underline')['--c-input-shadow-focus']).toBe(
            'inset 0 -2px 0 0 #1e3a8a'
        );
        const fb = focusTreatment({ base: '#1e3a8a', fallback: true });
        expect(focusTokens(fb, 'underline')['--c-input-shadow-focus']).toBe(
            'inset 0 -2px 0 0 #111827, inset 0 -4px 0 0 #ffffff'
        );
        expect(focusTokens(fb, 'outline')['--c-input-shadow-focus']).toBe(
            '0 0 0 2px #ffffff, 0 0 0 4px #111827'
        );
    });
});

describe('a section with its own background (§6)', () => {
    const bag = {
        '--c-focus-base': '#1e3a8a',
        '--c-focus-under': '#ffffff #ffffff',
        '--c-input-focus-style': 'ring',
        '--c-text': '#1f2937',
        // a dark section with the lifted field fill dark themes use
        '--c-field-bg': 'rgba(255, 255, 255, 0.06)',
        '--c-submit-bg': '#1e3a8a',
        '--c-accent': '#1e3a8a'
    };
    const vars = (style) =>
        Object.fromEntries(
            style.split('; ').map((d) => {
                const i = d.indexOf(': ');
                return [d.slice(0, i), d.slice(i + 2)];
            })
        );

    it('a solid background sets all four token groups, the input one included', () => {
        const v = vars(sectionFocusStyle(bag, '#0b1020'));
        expect(Object.keys(v)).toEqual(
            expect.arrayContaining([
                '--c-field-focus',
                '--c-focus-partner',
                '--c-focus-ring',
                '--c-focus-shadow',
                '--c-input-shadow-focus'
            ])
        );
        // navy on a near-black section can't read: it moved lighter
        expect(passes(v['--c-field-focus'], exact('#0b1020'))).toBe(true);
    });

    it('an underline form keeps the underline inside the section', () => {
        const v = vars(
            sectionFocusStyle(
                { ...bag, '--c-input-focus-style': 'underline' },
                '#0b1020'
            )
        );
        expect(v['--c-input-shadow-focus']).toMatch(/^inset 0 -2px 0 0 /);
    });

    it('a gradient background gets the fallback (two-colour underline for underline forms)', () => {
        const ring = vars(
            sectionFocusStyle(bag, 'linear-gradient(#000, #fff)')
        );
        expect(ring['--c-field-focus']).toBe(FOCUS_DARK);
        const line = vars(
            sectionFocusStyle(
                { ...bag, '--c-input-focus-style': 'underline' },
                'linear-gradient(#000, #fff)'
            )
        );
        expect(line['--c-input-shadow-focus']).toBe(
            'inset 0 -2px 0 0 #111827, inset 0 -4px 0 0 #ffffff'
        );
    });

    it('an old snapshot (no focus tokens) leaves sections untouched', () => {
        expect(sectionFocusStyle({ '--c-text': '#000' }, '#0b1020')).toBe('');
        expect(sectionFocusStyle(bag, '')).toBe('');
    });
});

describe('placements', () => {
    it('the open page swaps in the page treatment; an old snapshot is unchanged', () => {
        const old = { '--c-focus-ring': 'glow' };
        expect(openPageTokens(old)).toBe(old);
        const t = openPageTokens({
            '--c-focus-ring': 'card',
            '--c-focus-page-ring': 'page',
            '--c-focus-page-field': '#111827',
            '--c-focus-page-partner': '#ffffff',
            '--c-focus-page-input': 'page-input',
            '--c-focus-page-under': '#000000 #ffffff'
        });
        expect(t['--c-focus-ring']).toBe('page');
        expect(t['--c-focus-shadow']).toBe('page');
        expect(t['--c-input-shadow-focus']).toBe('page-input');
        expect(t['--c-field-focus']).toBe('#111827');
        expect(t['--c-focus-under']).toBe('#000000 #ffffff');
    });

    it('no theme (§6b): the neutral grey already passes and is kept', () => {
        const t = neutralFocusTokens();
        expect(t['--c-field-focus']).toBe('#4b5563');
        expect(t['--c-focus-partner']).toBe('#ffffff');
        ['#ffffff', '#f4f7f5'].forEach((bg) =>
            expect(contrast(t['--c-field-focus'], bg)).toBeGreaterThanOrEqual(3)
        );
        expect(t['--c-focus-outline']).toBe('transparent');
        expect(rangeFromToken(t['--c-focus-under'])).toEqual([
            '#ffffff',
            '#ffffff'
        ]);
    });
});

describe('the gate: a real form published before Part B (§3)', () => {
    // Form_Version__c a04hk00000165inAAA, captured from the dev org
    const old = PUBLISHED.tokens;

    it('carries none of the new focus tokens, and still the 55% glow', () => {
        expect(old['--c-focus-base']).toBeUndefined();
        expect(old['--c-focus-outline']).toBeUndefined();
        expect(old['--c-focus-ring']).toMatch(/^0 0 0 3px rgba\(/);
    });

    it('gets no section treatment and no open-page swap', () => {
        expect(sectionFocusStyle(old, '#0b1020')).toBe('');
        expect(openPageTokens(old)).toBe(old);
    });

    it('the gated stylesheets fall back to the old solid outline for it', () => {
        const fs = require('fs');
        const path = require('path');
        const lwc = path.join(__dirname, '..', '..');
        const css = ['finalElementRenderer', 'finalSectionRenderer']
            .map((n) => fs.readFileSync(path.join(lwc, n, `${n}.css`), 'utf8'))
            .join(' ')
            .replace(/\s+/g, ' ');
        // every outline that reads the focus colour goes through the gate
        const outlines = css.match(/outline: 2px solid var\([^;]*;/g) || [];
        expect(outlines.length).toBeGreaterThanOrEqual(6);
        outlines.forEach((o) =>
            expect(o).toContain(
                'var(--c-focus-outline, var(--c-field-focus, var(--c-accent)))'
            )
        );
    });
});
