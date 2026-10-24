/**
 * --c-focus-ring is a whole box-shadow (`0 0 0 3px rgba(...)`), not a colour.
 * Inside `outline: 2px solid var(--c-focus-ring, ...)` it makes the outline
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

describe('--c-focus-ring is only ever a box-shadow', () => {
    it.each(listBuiltinThemes().map((t) => t.key))(
        '%s: the ring is a shadow, --c-field-focus a solid colour',
        (key) => {
            const t = resolveTokens(getBuiltinTheme(key), null);
            expect(t['--c-focus-ring']).toMatch(/^0 0 0 3px rgba\(/);
            expect(t['--c-field-focus']).toMatch(/^#[0-9a-f]{3,8}$/i);
        }
    );

    it('no stylesheet uses --c-focus-ring outside box-shadow or a hook', () => {
        const misuse = finalStylesheets()
            .flatMap(declarations)
            .filter(
                (d) =>
                    d.value.includes('var(--c-focus-ring') &&
                    d.property !== 'box-shadow' &&
                    !d.property.startsWith('--')
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
