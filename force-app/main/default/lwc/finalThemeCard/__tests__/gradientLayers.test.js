// IMPL_PLAN_THEME_GRADIENTS (finding 1 + review round 2): the preview card
// paints page and panel gradients the way the form does (finalPageFrame).
// Jest can't paint a background, so this pins the two rules; the look itself
// is checked in the org.
const fs = require('fs');
const path = require('path');

const css = (...parts) =>
    fs
        .readFileSync(path.join(__dirname, ...parts), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ');

const card = css('..', 'finalThemeCard.css');
const form = css('..', '..', 'finalPageFrame', 'finalPageFrame.css');

describe('preview card gradient layers', () => {
    it('the page paints the page gradient under the page image', () => {
        expect(card).toMatch(
            /\.tc-stage \{[^}]*background-image: var\(--c-page-bg-image, none\), var\(--c-page-bg-gradient, none\)/
        );
    });

    it('the panel gradient is a FALLBACK under the readability backing, exactly as on the form', () => {
        const fallback =
            'background-image: var( --c-card-backing-image, var(--c-content-bg-gradient, none) )';
        expect(card).toContain(fallback);
        expect(form).toContain(fallback);
        // never a second layer that would bring the gradient back
        expect(card).not.toMatch(
            /--c-card-backing-image[^;]*\),\s*var\(--c-content-bg-gradient/
        );
    });
});
