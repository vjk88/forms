/**
 * Navigation controls of the other layouts are at least 44px on a phone
 * (docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md, slice 2c).
 *
 * Found by measuring every layout in the Lightning viewer at a 390px phone after
 * slice 2 had lifted the form's own controls: the wizard's step dots were 12 x 12px
 * (and tappable), tab headers 100 x 42px, side-rail links 46 x 38px. Each layout
 * decides its own narrow behavior in its own container query, so the rule lives
 * there and wide forms keep exactly what they have.
 */
const fs = require('fs');
const path = require('path');

const LWC_ROOT = path.join(__dirname, '..', '..');

const read = (name) =>
    fs
        .readFileSync(path.join(LWC_ROOT, name, `${name}.css`), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

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

const flat = (text) => text.replace(/\s+/g, ' ').trim();

/** Declarations of every rule whose selector list contains `selector`. */
function bodiesFor(css, selector) {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) =>
            m[1]
                .split(',')
                .map((s) => flat(s))
                .includes(selector)
        )
        .map((m) => flat(m[2]))
        .join(' ');
}

const without = (css, header) =>
    blocksOf(css, header).reduce((rest, body) => rest.replace(body, ''), css);

describe('tab headers', () => {
    const HEADER = '@container tabs (max-width: 540px)';
    const css = read('finalNavTabs');

    it('are 44px tall on a narrow form', () => {
        expect(bodiesFor(blocksOf(css, HEADER).join('\n'), '.tab')).toMatch(
            /min-height:\s*44px;/
        );
    });

    it('are unchanged on a wide one', () => {
        expect(bodiesFor(without(css, HEADER), '.tab')).not.toMatch(
            /min-height/
        );
    });
});

describe('side-rail links and the pages toggle', () => {
    const HEADER = '@container railnav (max-width: 540px)';
    const css = read('finalNavRail');
    const narrow = blocksOf(css, HEADER).join('\n');

    it('are 44px tall on a narrow form (the chip row and the drawer)', () => {
        expect(bodiesFor(narrow, '.rail-link')).toMatch(/min-height:\s*44px;/);
        expect(bodiesFor(narrow, '.narrow-drawer .drawer-toggle')).toMatch(
            /min-height:\s*44px;/
        );
    });

    it('are unchanged on a wide one', () => {
        const wide = without(css, HEADER);
        expect(bodiesFor(wide, '.rail-link')).not.toMatch(/min-height/);
        expect(bodiesFor(wide, '.drawer-toggle')).not.toMatch(/min-height/);
    });
});

describe('wizard steps', () => {
    const HEADER = '@container stepper (max-width: 540px)';
    const css = read('finalNavStepper');
    const narrow = blocksOf(css, HEADER).join('\n');
    const DOTS = [
        '.mode-dots .step-btn',
        '.narrow-dots .step-btn',
        '.fit-collapse.narrow-dots .step-btn'
    ];
    const marker = (selector) =>
        Number(/width:\s*(\d+)px;/.exec(bodiesFor(css, selector))[1]);

    it('a numbered step is 44px tall, its marker keeps its size, a negative margin gives the room back so the strip does not grow', () => {
        const step = bodiesFor(narrow, '.step-btn');
        expect(step).toMatch(/min-height:\s*44px;/);
        const margin = Number(/margin-block:\s*-(\d+)px;/.exec(step)[1]);
        expect(marker('.step-marker') + 2 * margin).toBe(44);
    });

    it.each(DOTS)(
        'a dot (%s) keeps its 12px look and gets a 44px hit area, the room given back by a negative margin',
        (selector) => {
            const dot = bodiesFor(narrow, selector);
            expect(dot).toMatch(/min-width:\s*44px;/);
            const margin = Number(/margin:\s*-(\d+)px;/.exec(dot)[1]);
            expect(marker('.mode-dots .step-marker') + 2 * margin).toBe(44);
        }
    );

    it('the dot rules cover every way the strip becomes dots (chosen, measured, narrow)', () => {
        const dotMarkers = [
            '.mode-dots .step-marker',
            '.fit-collapse.narrow-dots .step-marker'
        ];
        dotMarkers.forEach((selector) => {
            expect(bodiesFor(css, selector)).toMatch(/width:\s*12px;/);
        });
        expect(bodiesFor(narrow, '.narrow-dots .step-marker')).toMatch(
            /width:\s*12px;/
        );
    });

    it('a wide form keeps the buttons exactly as they are', () => {
        const wide = without(css, HEADER);
        expect(bodiesFor(wide, '.step-btn')).not.toMatch(/min-height|margin/);
        DOTS.forEach((selector) => {
            expect(bodiesFor(wide, selector)).not.toMatch(
                /min-width|min-height|margin/
            );
        });
    });
});
