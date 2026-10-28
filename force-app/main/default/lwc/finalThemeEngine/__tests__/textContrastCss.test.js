/**
 * IMPL_PLAN_TEXT_CONTRAST v7, PR A: the CSS side.
 *
 * 1. Every changed declaration reads the new token WITH today's value as its
 *    fallback, so a form published before (frozen tokens, no marker) paints
 *    exactly as it did.
 * 2. The reader guard: every declaration in a final* stylesheet that reads
 *    --c-text-weak, --c-accent, --c-content-bg, --c-label-color or --c-text
 *    is in the checked-in inventory (plan §T3). A new reader fails here until
 *    it is classified in the plan and added to the inventory.
 */
import fs from 'fs';
import path from 'path';
import INVENTORY from './__fixtures__/textContrastCssInventory.json';

const LWC = path.resolve(__dirname, '../..');
const TOKENS = [
    '--c-text-weak',
    '--c-accent',
    '--c-content-bg',
    '--c-label-color',
    '--c-text'
];

/** Every declaration of a stylesheet: { selector, prop, value }. Nested
 *  at-rules are joined into the selector as "outer » inner". */
function declarations(css) {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    const stack = [];
    let buf = '';
    const flush = () => {
        const decl = buf.trim();
        buf = '';
        const i = decl.indexOf(':');
        if (!stack.length || i < 0) {
            return;
        }
        out.push({
            selector: stack.join(' » '),
            prop: decl.slice(0, i).trim(),
            value: decl
                .slice(i + 1)
                .replace(/\s+/g, ' ')
                .replace(/\( /g, '(')
                .replace(/ \)/g, ')')
                .trim()
        });
    };
    for (const ch of src) {
        if (ch === '{') {
            stack.push(buf.replace(/\s+/g, ' ').trim());
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

function sheet(component) {
    return declarations(
        fs.readFileSync(path.join(LWC, component, `${component}.css`), 'utf8')
    );
}

function valueOf(component, selector, prop) {
    const hits = sheet(component).filter(
        (d) => d.selector === selector && d.prop === prop
    );
    expect(hits).toHaveLength(1);
    return hits[0].value;
}

// [component, selector, property, value now] — the fallback (the last
// argument of the outer var()) is exactly what the declaration said before.
const SWAPS = [
    [
        'finalElementRenderer',
        '.scale-icon',
        'color',
        'var(--c-mark-idle-fill, var(--c-text-weak))'
    ],
    [
        'finalElementRenderer',
        '.scale-icon',
        '-webkit-text-stroke',
        'var(--c-mark-idle-stroke, 0 transparent)'
    ],
    [
        'finalElementRenderer',
        '.scale-icon',
        'opacity',
        'var(--c-mark-idle-opacity, 0.4)'
    ],
    [
        'finalElementRenderer',
        '.scale-row .scale-icon:hover ~ .scale-icon',
        'color',
        'var(--c-mark-idle-fill, var(--c-text-weak))'
    ],
    [
        'finalElementRenderer',
        '.scale-row .scale-icon:hover ~ .scale-icon',
        '-webkit-text-stroke',
        'var(--c-mark-idle-stroke, 0 transparent)'
    ],
    [
        'finalElementRenderer',
        '.scale-row .scale-icon:hover ~ .scale-icon',
        'opacity',
        'var(--c-mark-idle-opacity, 0.4)'
    ],
    [
        'finalElementRenderer',
        '.scale-icon.emoji-glyph',
        'filter',
        'var(--c-mark-idle-filter, none)'
    ],
    [
        'finalElementRenderer',
        '.scale-row .scale-icon.emoji-glyph:hover ~ .scale-icon.emoji-glyph',
        'filter',
        'var(--c-mark-idle-filter, none)'
    ],
    [
        'finalElementRenderer',
        '.scale-icon.filled',
        'color',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalElementRenderer',
        '.scale-row:hover .scale-icon',
        'color',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalElementRenderer',
        '.ic-tile.selected .ic-label::after',
        'color',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalElementRenderer',
        '.slider-val',
        'color',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalElementRenderer',
        '.slider-val.idle',
        'font-style',
        'var(--c-idle-value-style, normal)'
    ],
    // placeholders keep the theme's own muted colour (owner 2026-10-26)
    [
        'finalElementRenderer',
        ':host',
        '--slds-c-input-placeholder-color',
        'var(--c-text-weak-src, var(--c-text-weak))'
    ],
    [
        'finalElementRenderer',
        ':host',
        '--slds-c-textarea-placeholder-color',
        'var(--c-text-weak-src, var(--c-text-weak))'
    ],
    [
        'finalLookup',
        '.fl-input::placeholder',
        'color',
        'var(--c-text-weak-src, var(--c-text-weak, #5c5c5c))'
    ],
    [
        'finalSectionRenderer',
        '.rep-add',
        'color',
        'var(--c-accent-text, var(--c-accent, var(--c-text)))'
    ],
    [
        'finalSectionRenderer',
        '.sec-icon',
        '--slds-c-icon-color-foreground-default',
        'var(--c-accent-mark, var(--c-accent, var(--c-text)))'
    ],
    [
        'finalNavAccordion',
        '.trigger.open',
        'color',
        'var(--c-accent-text, var(--c-accent, var(--c-text)))'
    ],
    [
        'finalNavAccordion',
        '.chevron.open',
        '--sds-c-icon-color-foreground-default',
        'var(--c-accent-mark, var(--c-accent, var(--c-text)))'
    ],
    [
        'finalNavStepper',
        '.step-btn.done .step-marker',
        'color',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalNavStepper',
        '.mode-dots .step-btn.active .step-marker, .mode-dots .step-btn.done .step-marker',
        'background',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalNavStepper',
        '.fit-collapse.narrow-dots .step-btn.active .step-marker, .fit-collapse.narrow-dots .step-btn.done .step-marker',
        'background',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalNavStepper',
        '@container stepper (max-width: 540px) » .narrow-dots .step-btn.active .step-marker, .narrow-dots .step-btn.done .step-marker',
        'background',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalAfterSubmit',
        '.toast',
        'color',
        'var(--c-toast-ink, var(--c-content-bg))'
    ],
    [
        'finalAfterSubmit',
        '.check svg',
        'fill',
        'var(--c-accent-mark, var(--c-accent))'
    ],
    [
        'finalElementRenderer',
        '.scale-row:not(:hover) .scale-icon.emoji-glyph:not(.filled):focus-visible',
        'filter',
        'var(--c-focus-idle-filter, none)'
    ],
    // PR B: every card painter reads the card backing (old forms: the card)
    [
        'finalPageFrame',
        '.panel',
        'background-color',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    [
        'finalPageFrame',
        '.panel',
        'background-image',
        'var(--c-card-backing-image, var(--c-content-bg-gradient, none))'
    ],
    [
        'finalAfterSubmit',
        '.wrap--card',
        'background-color',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    [
        'finalAfterSubmit',
        '.wrap--card',
        'background-image',
        'var(--c-card-backing-image, var(--c-content-bg-gradient, none))'
    ],
    [
        'finalFormViewer',
        '.viewer-busy-text',
        'background',
        'var(--c-card-backing, var(--c-content-bg, #fff))'
    ],
    [
        'finalNavSplitHero',
        '.mode-bleed .form-card',
        'background',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    [
        'finalNavStepper',
        '.steps.is-stuck',
        'background',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    [
        'finalNavTabs',
        '.tab-strip.is-stuck',
        'background',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    [
        'finalNavTabs',
        '.style-enclosed .tab.active',
        'background',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    [
        'finalNavRail',
        '@container railnav (max-width: 540px) » .narrow-drawer .rail.drawer-open',
        'background',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    [
        'finalNavRail',
        '@container railnav (max-width: 540px) » .narrow-topbar.sticky-rail .rail.is-stuck',
        'background',
        'var(--c-card-backing, var(--c-content-bg))'
    ],
    // PR B: the One at a time question column and the counter pill, and
    // the viewer's error banner on the open page (old forms: nothing new)
    [
        'finalNavOneAtATime',
        '.oaat-column',
        'background',
        'var(--c-page-backing, transparent)'
    ],
    [
        'finalNavOneAtATime',
        '.oaat-column',
        'border-radius',
        'var(--c-page-backing-radius, 0)'
    ],
    [
        'finalNavOneAtATime',
        '.oaat-column',
        'padding',
        'var(--c-page-backing-pad, 0)'
    ],
    [
        'finalNavOneAtATime',
        '.counter',
        'background',
        'var(--c-page-backing, transparent)'
    ],
    [
        'finalNavOneAtATime',
        '.counter',
        'padding',
        'var(--c-page-backing-chip-pad, 0)'
    ],
    [
        'finalFormViewer',
        '.viewer-submit-error',
        'background-color',
        'var(--c-banner-backing, transparent)'
    ],
    [
        'finalThemeCard',
        '.tc-card',
        'background',
        'var(--c-card-backing, var(--c-content-bg, #ffffff))'
    ],
    [
        'finalLayoutCard',
        '.lt-card',
        'background',
        'var(--c-card-backing, var(--c-content-bg, #ffffff))'
    ],
    // header follow-up: the header's colours and plate, set once as --hdr-*
    // (a banner picks its own set) and read by the header, the Split pane and
    // the highlight row; old forms and every other header: nothing new
    ['finalFormHeader', '.hdr', '--hdr-text', 'var(--c-header-text)'],
    ['finalFormHeader', '.hdr', '--hdr-text-weak', 'var(--c-header-text-weak)'],
    [
        'finalFormHeader',
        '.hdr',
        '--hdr-plate',
        'var(--c-header-plate, transparent)'
    ],
    [
        'finalFormHeader',
        '.hdr',
        '--hdr-plate-pad',
        'var(--c-header-plate-pad, 0)'
    ],
    [
        'finalFormHeader',
        '.hdr',
        '--hdr-plate-outset',
        'var(--c-header-plate-outset, 0)'
    ],
    [
        'finalFormHeader',
        '.hdr.has-banner',
        '--hdr-plate',
        'var(--c-header-plate-banner, var(--c-header-plate, transparent))'
    ],
    [
        'finalFormHeader',
        '.hdr-title',
        'color',
        'var(--c-header-title-fill, var(--hdr-text))'
    ],
    ['finalFormHeader', '.hdr-desc', 'color', 'var(--hdr-text-weak)'],
    [
        'finalFormHighlight',
        '.hl-inline',
        'background',
        'var(--hdr-plate, transparent)'
    ],
    [
        'finalFormHighlight',
        '.hl-inline',
        'color',
        'var(--hdr-text-weak, var(--c-header-text-weak, var(--c-text-weak)))'
    ],
    [
        'finalNavSplitHero',
        '.pane-subtitle',
        'opacity',
        'var(--c-pane-text-fade, 0.85)'
    ],
    [
        'finalNavSplitHero',
        '.progress-text',
        'opacity',
        'var(--c-pane-text-fade, 0.8)'
    ],
    [
        'finalNavSplitHero',
        '.pane-title, .pane-subtitle, .pane .progress-text, .pane .brand-wordmark',
        'background',
        'var(--hdr-plate, transparent)'
    ]
];

describe('text contrast PR A: CSS', () => {
    it.each(SWAPS)(
        '%s %s { %s } falls back to today',
        (component, selector, prop, value) => {
            expect(valueOf(component, selector, prop)).toBe(value);
        }
    );

    // PR B: a respondent surface painted in the card colour must read the
    // card backing first, or a backed look's text sits on the wrong surface.
    // Studio previews (theme and layout cards) are mock cards, not forms.
    it('every card painter reads the card backing (plan §4.4)', () => {
        const STUDIO = ['finalThemeCard', 'finalLayoutCard'];
        const painters = fs
            .readdirSync(LWC)
            .filter((d) => d.startsWith('final') && !STUDIO.includes(d))
            .filter((d) => fs.existsSync(path.join(LWC, d, `${d}.css`)))
            .flatMap((component) =>
                sheet(component)
                    .filter(
                        (d) =>
                            d.prop.startsWith('background') &&
                            /--c-content-bg(?![\w-])/.test(d.value)
                    )
                    .map((d) => ({ component, ...d }))
            );
        expect(painters.length).toBe(9);
        const wrong = painters.filter(
            (d) => !d.value.startsWith('var(--c-card-backing')
        );
        expect(wrong).toEqual([]);
    });

    it('every reader of the changed colours is in the inventory (plan §T3)', () => {
        const now = fs
            .readdirSync(LWC)
            .filter((d) => d.startsWith('final'))
            .filter((d) => fs.existsSync(path.join(LWC, d, `${d}.css`)))
            .sort()
            .flatMap((component) =>
                sheet(component)
                    .filter((d) =>
                        TOKENS.some((t) =>
                            new RegExp(`${t}(?![\\w-])`).test(d.value)
                        )
                    )
                    .map(
                        (d) =>
                            `${component} | ${d.selector} | ${d.prop}: ${d.value}`
                    )
            );
        const unlisted = now.filter((row) => !INVENTORY.rows.includes(row));
        const gone = INVENTORY.rows.filter((row) => !now.includes(row));
        expect({ unlisted, gone }).toEqual({ unlisted: [], gone: [] });
    });
});
