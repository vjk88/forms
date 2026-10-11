/**
 * The red "invalid" line on every control that has no border of its own
 * (docs/FinalDesign/IMPL_PLAN_INVALID_INDICATOR_OTHER_FIELDS.md).
 *
 * Stage 2 gave the text box, text area, dropdown and the radio and checkbox
 * groups a red line when validation fails. Every other question type showed
 * only the message. They now get the same 1px line, drawn around the control.
 *
 * One mechanism for all of them: the question container already carries
 * `has-errors` while it has an error, and each control below is a direct child
 * of it, so one rule list keyed on `.has-errors > <wrapper>` does the drawing.
 * These tests pin the list, the geometry (the line must never touch the label
 * above or the message below) and, against the real component, that every type
 * really renders the wrapper the CSS names.
 */
import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

const fs = require('fs');
const path = require('path');

const css = fs
    .readFileSync(
        path.join(__dirname, '..', 'finalElementRenderer.css'),
        'utf8'
    )
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

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

/** A px value of one declaration, or null. */
const px = (body, prop) => {
    const m = new RegExp(`(?:^|[\\s;])${prop}\\s*:\\s*(-?[\\d.]+)px`).exec(
        body
    );
    return m ? Number(m[1]) : null;
};

// ---- the targets, stated once ------------------------------------------------

/** Every selector that draws the line. */
const OUTLINE = [
    '.has-errors lightning-radio-group',
    '.has-errors lightning-checkbox-group',
    '.has-errors > .choice-row',
    '.has-errors > .scale-group',
    '.has-errors > .yn-row',
    '.has-errors > .ic-grid',
    '.has-errors > .slider-wrap',
    '.has-errors > .mx-table',
    '.has-errors > .block-file-frame',
    '.has-errors.field-checkbox > lightning-input',
    '.block-consent.has-errors'
];

/** The consent row has no label above it, so it never steps down. */
const HAS_LABEL_ABOVE = OUTLINE.filter((s) => !s.startsWith('.block-consent'));

/** Same target, only when the label is stacked above the control. */
const stacked = (selector) =>
    selector.replace('.has-errors', '.has-errors:not(.label-left)');

/** The message under each target. Groups sit directly before it (`+`); the
 *  others use `~` so an optional element between them (the chips' "Other"
 *  input, the file block's hidden input) does not break the rule. */
const MESSAGE = [
    ...[
        '.has-errors lightning-radio-group',
        '.has-errors lightning-checkbox-group'
    ].map((s) => `${stacked(s)} + .field-errors`),
    ...HAS_LABEL_ABOVE.filter(
        (s) => !/lightning-(radio|checkbox)-group/.test(s)
    ).map((s) => `${stacked(s)} ~ .field-errors`),
    '.block-consent.has-errors + .field-errors'
];

// Space between a label's box and the control below it is --c-space-1: 2px at
// compact density, 4px at comfortable. Take the tighter. The lettering's
// descenders sit inside the label's box, so keep 3px of air from it.
const MIN_LABEL_GAP = 2;
/** Targets whose label sits in a plain block, so margins collapse. */
const COLLAPSING = ['.has-errors > .block-file-frame'];
const CLEARANCE = 3;

describe('one rule list draws the invalid line on every target', () => {
    it.each(OUTLINE)(
        '%s gets a 1px line in the theme error colour',
        (selector) => {
            const body = bodiesFor(selector);
            expect(body).toMatch(
                /outline\s*:\s*1px solid var\(--c-field-error/
            );
            expect(px(body, 'outline-offset')).toBe(4);
        }
    );

    it('with a stacked label, every control steps down far enough to clear the label', () => {
        for (const selector of HAS_LABEL_ABOVE) {
            const reach =
                px(bodiesFor(selector), 'outline-offset') +
                1; /* the 1px stroke, asserted above */
            const step = px(bodiesFor(stacked(selector)), 'margin-top');
            expect(step).not.toBeNull();
            // Inside a flex column (.field) the label row's bottom margin and
            // the control's top margin ADD UP. The file block is a plain block,
            // where they COLLAPSE into the larger of the two (measured 2026-10-11:
            // 1px of clearance with a 6px step), so it gets no label-gap credit.
            const credit = COLLAPSING.includes(selector) ? 0 : MIN_LABEL_GAP;
            expect(credit + step - reach).toBeGreaterThanOrEqual(CLEARANCE);
        }
    });

    it('every message sits as far under the line as under a text box', () => {
        const base = px(bodiesFor('.field-errors'), 'margin-top');
        const reach = 4 + 1;
        for (const selector of MESSAGE) {
            const step = px(bodiesFor(selector), 'margin-top');
            expect(step).toBeGreaterThanOrEqual(base + reach);
        }
    });

    it('the file drop button keeps its focus ring while invalid (the line would take its outline over)', () => {
        const focus = bodiesFor(
            '.has-errors > .block-file-frame:focus-visible'
        );
        expect(focus).toMatch(/outline\s*:\s*2px solid/);
        expect(px(focus, 'outline-offset')).toBe(2);
    });

    it('the consent row has no label above it, so no step above', () => {
        expect(bodiesFor('.block-consent.has-errors')).not.toMatch(
            /margin-top/
        );
    });

    it('a single checkbox and a toggle hug their control instead of spanning the field', () => {
        expect(
            bodiesFor(
                '.has-errors:not(.label-left).field-checkbox > lightning-input'
            )
        ).toMatch(/align-self\s*:\s*flex-start\s*;/);
    });
});

// ---- against the real component ---------------------------------------------

const CHOICES = [
    { value: 'a', label: 'First' },
    { value: 'b', label: 'Second' }
];
const FIELD = (config) => ({
    id: 'e1',
    type: 'field',
    label: 'Question',
    required: true,
    labelPosition: 'top',
    config
});
const BLOCK = (type, config = {}) => ({
    id: 'e1',
    type,
    label: 'Question',
    required: true,
    config
});

/** [name, element] — every type the line must reach. */
const TYPES = [
    ['single checkbox', FIELD({ inputType: 'checkbox' })],
    ['toggle', FIELD({ inputType: 'checkbox', renderAs: 'Toggle' })],
    ['consent', BLOCK('consent', { html: '<p>I agree</p>' })],
    [
        'chip choice',
        FIELD({
            inputType: 'picklist',
            renderAs: 'Radio_Buttons',
            options: CHOICES,
            optionStyle: 'chips'
        })
    ],
    [
        'card choice',
        FIELD({
            inputType: 'picklist',
            renderAs: 'Radio_Buttons',
            options: CHOICES,
            optionStyle: 'cards'
        })
    ],
    ['likert', BLOCK('likert')],
    ['rating', BLOCK('rating')],
    ['0-10 scale', BLOCK('nps')],
    ['opinion scale', BLOCK('scale')],
    ['emoji scale', BLOCK('emojiScale')],
    ['yes / no', BLOCK('yesNo')],
    ['image choice', BLOCK('imageChoice', { options: CHOICES })],
    [
        'slider',
        FIELD({
            inputType: 'number',
            renderAs: 'Slider',
            slider: { min: 0, max: 10, step: 1 }
        })
    ],
    ['matrix', BLOCK('matrix', { rows: CHOICES })],
    ['file upload', BLOCK('file')],
    // stage 2 types: the shared list must still reach them
    [
        'radio group',
        FIELD({
            inputType: 'picklist',
            renderAs: 'Radio_Buttons',
            options: CHOICES
        })
    ],
    [
        'checkbox group',
        FIELD({
            inputType: 'multipicklist',
            renderAs: 'Checkbox_Group',
            options: CHOICES
        })
    ]
];

function mount(element) {
    const cmp = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    cmp.element = element;
    document.body.appendChild(cmp);
    return cmp;
}

/** Which of the line's selectors find something in this rendering. */
const hits = (cmp) => OUTLINE.filter((s) => cmp.shadowRoot.querySelector(s));

describe('every type renders the wrapper the CSS names', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it.each(TYPES)(
        '%s: a failed validation gives the line a target',
        async (_name, element) => {
            const cmp = mount({
                ...element,
                errors: ['This field is required.']
            });
            await Promise.resolve();
            expect(hits(cmp).length).toBeGreaterThan(0);
        }
    );

    it.each(TYPES)(
        '%s: a valid answer draws no line',
        async (_name, element) => {
            const cmp = mount(element);
            await Promise.resolve();
            expect(hits(cmp)).toEqual([]);
        }
    );

    it.each([
        ['text box', FIELD({ inputType: 'text' })],
        ['text area', FIELD({ inputType: 'textarea' })],
        [
            'dropdown',
            FIELD({
                inputType: 'picklist',
                renderAs: 'Dropdown',
                options: CHOICES
            })
        ]
    ])(
        '%s keeps its own red border and gets no outline',
        async (_name, element) => {
            const cmp = mount({
                ...element,
                errors: ['This field is required.']
            });
            await Promise.resolve();
            expect(hits(cmp)).toEqual([]);
        }
    );

    it.each(TYPES)(
        '%s: marked field-checkbox only if it is a single checkbox or a toggle',
        async (name, element) => {
            const cmp = mount(element);
            await Promise.resolve();
            expect(
                Boolean(cmp.shadowRoot.querySelector('.field-checkbox'))
            ).toBe(name === 'single checkbox' || name === 'toggle');
        }
    );
});
