/**
 * Side-label layout (labelPosition: left): the label column sits beside the
 * control and the control takes the width that is left.
 *
 * The text box and the text area already did. The dropdown did not, so it
 * collapsed to a small stub next to its label (seen 2026-10-11 on the Studio
 * preview, Lightning and the public site alike: the cause is our own CSS, not a
 * host difference).
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

/** Every declaration body of the rules whose selector list contains `selector`. */
const bodiesFor = (selector) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) =>
            m[1]
                .split(',')
                .map((s) => s.replace(/\s+/g, ' ').trim())
                .includes(selector)
        )
        .map((m) => m[2])
        .join('\n');

describe('side-label layout: the control takes the remaining width', () => {
    it.each(['lightning-input', 'lightning-textarea', 'lightning-combobox'])(
        '%s stretches beside its label',
        (widget) => {
            const body = bodiesFor(`.label-left ${widget}`);
            expect(body).toMatch(/flex\s*:\s*1\s*;/);
            // without min-width: 0 a long value pushes the row wider than the form
            expect(body).toMatch(/min-width\s*:\s*0\s*;/);
        }
    );
});
