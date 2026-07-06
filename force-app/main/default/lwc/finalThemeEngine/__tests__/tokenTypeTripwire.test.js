/**
 * Token TYPE tripwire (review F1).
 *
 * The bug class this kills: a token emitted as one CSS type but consumed as
 * another substitutes into an invalid declaration, which the browser silently
 * drops — invisible hairlines, no error anywhere.
 *
 * Contract enforced here, both directions:
 * - SHORTHAND tokens (`--c-content-border`) may ONLY appear as the ENTIRE
 *   value of a `border*` property.
 * - COLOR tokens (`--c-field-border`) may NEVER be the entire value of a
 *   border shorthand — consumers own the width/style (`1px solid var(...)`).
 *
 * Scans every final* component's .css (the rebuild's contract surface —
 * legacy shells play by old rules and are slated for deletion). Add tokens
 * to the lists as the contract grows.
 */
const fs = require('fs');
const path = require('path');

const LWC_ROOT = path.join(__dirname, '..', '..');

const SHORTHAND_TOKENS = ['--c-content-border'];
const COLOR_TOKENS = ['--c-field-border'];

const BORDER_PROP = /^border(-(top|right|bottom|left))?$/;
const wholeVar = (token) =>
    new RegExp(`^var\\(${token}(\\s*,[^)]*)?\\)$`);

function cssFiles() {
    return fs
        .readdirSync(LWC_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('final'))
        .flatMap((d) =>
            fs
                .readdirSync(path.join(LWC_ROOT, d.name))
                .filter((f) => f.endsWith('.css'))
                .map((f) => path.join(LWC_ROOT, d.name, f))
        );
}

/** `prop: value` pairs, comments stripped, custom-property definitions skipped. */
function declarations(css) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const decls = [];
    const re = /([-a-zA-Z]+)\s*:\s*([^;{}]+)/g;
    let m;
    while ((m = re.exec(clean)) !== null) {
        if (!m[1].startsWith('--')) {
            decls.push({ prop: m[1].trim(), value: m[2].trim() });
        }
    }
    return decls;
}

describe('token type tripwire (F1 bug class)', () => {
    const perFile = cssFiles().map((file) => ({
        file: path.relative(LWC_ROOT, file),
        decls: declarations(fs.readFileSync(file, 'utf8'))
    }));

    it('shorthand tokens are only ever the ENTIRE value of a border* property', () => {
        const violations = [];
        for (const { file, decls } of perFile) {
            for (const { prop, value } of decls) {
                for (const token of SHORTHAND_TOKENS) {
                    if (!value.includes(`var(${token}`)) {
                        continue;
                    }
                    if (!BORDER_PROP.test(prop) || !wholeVar(token).test(value)) {
                        violations.push(`${file} → ${prop}: ${value}`);
                    }
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it('color tokens are never consumed as a whole border shorthand', () => {
        const violations = [];
        for (const { file, decls } of perFile) {
            for (const { prop, value } of decls) {
                for (const token of COLOR_TOKENS) {
                    if (!value.includes(`var(${token}`)) {
                        continue;
                    }
                    if (BORDER_PROP.test(prop) && wholeVar(token).test(value)) {
                        violations.push(`${file} → ${prop}: ${value}`);
                    }
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
