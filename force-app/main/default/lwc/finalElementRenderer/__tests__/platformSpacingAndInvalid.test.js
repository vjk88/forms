/**
 * Cross-host audit, stage 2 (docs/FinalDesign/IMPL_PLAN_CROSS_HOST_STAGES_1_2.md, section 7):
 * field spacing on the platform's widgets (B1, B2) and the invalid state of every
 * choice-style control (B4).
 *
 * B1/B2. The public site gives the platform's widget wrapper `margin-bottom: 16px`
 * (Lightning and the Studio give 0), so every platform-widget field was 16 px
 * taller there and the error message sat 22 px under its own box. A BARE tag
 * selector does not beat that rule on the public site (measured 2026-10-11:
 * `lightning-input { margin-bottom: 0 }` still left 16 px); a class-qualified one
 * does, with no !important. Lightning and the Studio already measure 0, so the
 * override changes nothing there and the field pitch becomes identical.
 *
 * B4. A failed validation turned the border red on text boxes only. The text
 * area, the dropdown and the radio and checkbox groups showed just the message.
 */
const fs = require('fs');
const path = require('path');

const css = fs
    .readFileSync(
        path.join(__dirname, '..', 'finalElementRenderer.css'),
        'utf8'
    )
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat rule list [{ selectors, body }]; at-rule wrappers fall away. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
    body: m[2]
}));

/** Every declaration body of the rules whose selector list contains `selector`. */
const bodiesFor = (selector) =>
    rules
        .filter((r) => r.selectors.includes(selector))
        .map((r) => r.body)
        .join('\n');

const WIDGETS = [
    'lightning-input',
    'lightning-textarea',
    'lightning-combobox',
    'lightning-radio-group',
    'lightning-checkbox-group'
];

describe('field spacing on platform widgets (B1, B2)', () => {
    it('zeroes the platform wrapper margin on every widget, class-qualified', () => {
        for (const widget of WIDGETS) {
            expect(bodiesFor(`.field ${widget}`)).toMatch(
                /margin-bottom\s*:\s*0\s*;/
            );
        }
    });

    it('also zeroes it on the consent checkbox, which sits outside .field (measured 43px tall vs 27 on public)', () => {
        expect(bodiesFor('.block-consent lightning-input')).toMatch(
            /margin-bottom\s*:\s*0\s*;/
        );
    });

    it('never relies on a bare tag selector (it loses to the platform on the public site)', () => {
        for (const widget of WIDGETS) {
            expect(bodiesFor(widget)).not.toMatch(/margin-bottom/);
        }
    });
});

describe('invalid border on the text area and the dropdown (B4)', () => {
    const takes = (name) => new RegExp(`${name}\\s*:\\s*var\\(--c-field-error`);

    it('the text area sets ITS OWN border hook (it never read the text box one)', () => {
        // The old rule set only the input hooks on lightning-textarea, which
        // reads --slds-c-textarea-color-border, so the border stayed grey.
        const body = bodiesFor('.has-errors lightning-textarea');
        expect(body).toMatch(takes('--slds-c-textarea-color-border'));
        expect(body).toMatch(takes('--sds-c-textarea-color-border'));
    });

    it('the dropdown shares the text box hook (measured on Lightning)', () => {
        const body = bodiesFor('.has-errors lightning-combobox');
        expect(body).toMatch(takes('--slds-c-input-color-border'));
        expect(body).toMatch(takes('--sds-c-input-color-border'));
    });

    it('the text box keeps working', () => {
        const body = bodiesFor('.has-errors lightning-input');
        expect(body).toMatch(takes('--slds-c-input-color-border'));
        expect(body).toMatch(takes('--sds-c-input-color-border'));
    });
});

describe('invalid state of radio and checkbox groups (B4)', () => {
    const CHOICE_GROUPS = ['lightning-radio-group', 'lightning-checkbox-group'];
    const GROUPS = CHOICE_GROUPS.map((w) => `.has-errors ${w}`);
    // Labels stacked above the group: the only case where something sits over it.
    const STACKED = CHOICE_GROUPS.map(
        (w) => `.has-errors:not(.label-left) ${w}`
    );

    /** A px value of one declaration, or null. */
    const px = (body, prop) => {
        const m = new RegExp(`(?:^|[\\s;])${prop}\\s*:\\s*(-?[\\d.]+)px`).exec(
            body
        );
        return m ? Number(m[1]) : null;
    };
    /** How far the line reaches past the options: its offset plus its stroke. */
    const reach = (body) =>
        px(body, 'outline-offset') +
        Number(/outline\s*:\s*([\d.]+)px/.exec(body)[1]);

    // Space between a label's box and the field below it is --c-space-1: 2px at
    // compact density, 4px at comfortable (measured 2026-10-11). Take the tighter.
    const MIN_LABEL_GAP = 2;
    // Air wanted between the line and the label's box (the lettering's
    // descenders sit inside that box, so a line touching it cuts the text).
    const CLEARANCE = 3;

    it('gets an outline in the error colour, drawn as a block so it wraps the options', () => {
        for (const selector of GROUPS) {
            const body = bodiesFor(selector);
            expect(body).toMatch(
                /outline\s*:\s*[\d.]+px solid var\(--c-field-error/
            );
            expect(body).toMatch(/display\s*:\s*block\s*;/);
        }
    });

    it('keeps the line off the label above it (it ran through the lettering at first)', () => {
        for (const selector of STACKED) {
            const body = bodiesFor(selector);
            const step = px(body, 'margin-top');
            expect(step).not.toBeNull();
            const lineReach = reach(
                bodiesFor(selector.replace(':not(.label-left)', ''))
            );
            expect(MIN_LABEL_GAP + step - lineReach).toBeGreaterThanOrEqual(
                CLEARANCE
            );
        }
    });

    it('puts the message as far under the line as under a text box', () => {
        // Under a text box the message sits at the base margin from the border.
        // The line reaches `reach` below the options, so the message steps down
        // by that much more.
        const base = px(bodiesFor('.field-errors'), 'margin-top');
        for (const widget of CHOICE_GROUPS) {
            const lineReach = reach(bodiesFor(`.has-errors ${widget}`));
            const step = px(
                bodiesFor(
                    `.has-errors:not(.label-left) ${widget} + .field-errors`
                ),
                'margin-top'
            );
            expect(step).toBeGreaterThanOrEqual(base + lineReach);
        }
    });

    it('adds no vertical step beside a side label (nothing is above the group)', () => {
        // The step lives only in the :not(.label-left) rules above; the base
        // rule, which a side-label field also matches, carries none.
        for (const selector of GROUPS) {
            expect(bodiesFor(selector)).not.toMatch(/margin-top/);
        }
        for (const widget of CHOICE_GROUPS) {
            expect(
                bodiesFor(`.has-errors ${widget} + .field-errors`)
            ).not.toMatch(/margin-top/);
        }
    });
});
