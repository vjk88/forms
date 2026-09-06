/* Run from any directory: node scripts/qa/studio-colors.cjs
 * Checks authoring palette contrast and stylesheet compilation. This does not
 * replace browser checks of Salesforce base controls or respondent themes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* postcss and @lwc/compiler arrive transitively (via sfdx-lwc-jest / @lwc/*),
   not as declared dependencies. That holds today and survives `npm ci`, but a
   future dependency bump could drop them — fail with a readable message rather
   than a bare MODULE_NOT_FOUND if that ever happens. */
let postcss, transformSync;
try {
    postcss = require('postcss');
    ({ transformSync } = require('@lwc/compiler'));
} catch (error) {
    console.error(
        'Missing a transitive dependency this script relies on ' +
            '(postcss / @lwc/compiler).\n' +
            'Install it explicitly:  npm i -D postcss @lwc/compiler\n' +
            `Original error: ${error.message}`
    );
    process.exit(2);
}

const root = path.resolve(__dirname, '../../force-app/main/default/lwc');
const read = (name) =>
    fs.readFileSync(path.join(root, name, `${name}.css`), 'utf8');
const shared = read('finalStudioStyles');
const tokens = new Map();
postcss.parse(shared).walkDecls(/^--c-studio-/, (declaration) => {
    tokens.set(declaration.prop.replace('--c-studio-', ''), declaration.value);
});

function luminance(hex) {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const rgb = hex.match(/[0-9a-f]{2}/gi).map((value) => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

let pairs = 0;
function check(foreground, background, minimum) {
    assert(tokens.has(foreground), `Missing ${foreground}`);
    assert(tokens.has(background), `Missing ${background}`);
    const a = luminance(tokens.get(foreground));
    const b = luminance(tokens.get(background));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert(
        ratio >= minimum,
        `${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`
    );
    pairs += 1;
    console.log(`${foreground} / ${background}: ${ratio.toFixed(2)}:1`);
}

for (const background of [
    'surface',
    'surface-subtle',
    'workspace',
    'hover',
    'accent-surface',
    'info-surface'
]) {
    for (const foreground of ['text', 'text-weak', 'accent-text']) {
        check(foreground, background, 4.5);
    }
    check('focus', background, 3);
    check('border-strong', background, 3);
}
check('on-accent', 'accent', 4.5);
check('on-accent', 'accent-hover', 4.5);
for (const semantic of ['error', 'warning', 'success', 'info']) {
    check(`${semantic}-text`, `${semantic}-surface`, 4.5);
    check(`${semantic}-text`, 'surface', 4.5);
}
check('error', 'error-surface', 4.5);
check('on-accent', 'warning-text', 4.5);
for (const background of ['canvas', 'canvas-surface', 'canvas-card']) {
    for (const foreground of [
        'canvas-text',
        'canvas-text-weak',
        'canvas-accent',
        'canvas-accent-text',
        'canvas-error'
    ]) {
        check(foreground, background, 4.5);
    }
    check('canvas-border', background, 3);
}

const allowed = new Set([
    'finalFormStudio',
    'finalPreviewStage',
    'finalBuilderCanvas',
    'finalFieldPalette',
    'finalDesignPanel',
    'finalPropertyPanel',
    'finalFormsLibrary',
    'finalCreationGallery',
    'finalThemeGallery',
    'finalLayoutCard',
    'finalThemeCard',
    'finalThemeEditor',
    'finalColorControl',
    'finalGradientControl',
    'finalRuleEditor',
    'finalValidationEditor',
    'finalRelationshipPicker',
    'finalStudioActionDialog',
    'finalStudioSettingsPanel',
    'finalConnectedObjectCard',
    'finalRecordLinkPanel',
    'finalGalleryPicker',
    'finalImageUploader'
]);

let compiled = 0;
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const filename = path.join(root, name, `${name}.css`);
    if (!fs.existsSync(filename)) continue;
    const source = read(name);
    const imports = /@import ['"]c\/finalStudioStyles['"]/.test(source);
    assert.equal(
        imports,
        allowed.has(name),
        `Unexpected import scope: ${name}`
    );
    if (!imports && name !== 'finalStudioStyles') continue;
    const result = transformSync(source, filename, { name, namespace: 'c' });
    if (imports) assert(result.code.includes('c/finalStudioStyles'));
    compiled += 1;
    const defined = new Set(
        [...tokens.keys()].map((key) => `--c-studio-${key}`)
    );
    const ast = postcss.parse(source);
    ast.walkDecls(/^--c-studio-/, (declaration) =>
        defined.add(declaration.prop)
    );
    ast.walkDecls((declaration) => {
        for (const [reference] of declaration.value.matchAll(
            /--c-studio-[\w-]+/g
        )) {
            assert(defined.has(reference), `Undefined ${reference} in ${name}`);
        }
    });
    // Customer preview declarations must never consume chrome colors.
    if (name === 'finalLayoutCard' || name === 'finalThemeCard') {
        postcss.parse(source).walkRules((rule) => {
            const preview =
                name === 'finalLayoutCard'
                    ? rule.selector.includes('.lt-')
                    : !/^\.tc(?:$|:|\.is-on)|^\.tc-(?:name|check|desc)(?:$|\s)/.test(
                          rule.selector
                      );
            if (!preview) return;
            rule.walkDecls((declaration) => {
                assert(
                    !declaration.value.includes('--c-studio-'),
                    `Chrome color leaked into ${name} ${rule.selector}`
                );
            });
        });
    }
}
console.log(`PASS: ${pairs} contrast pairs; ${compiled} stylesheets compiled.`);
