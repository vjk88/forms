#!/usr/bin/env node
/**
 * build-font-bundle — builds the `formFonts` static resource and the font data
 * the app reads (IMPL_PLAN_FONTS_AND_BRAND_THEME §A.3 step 2).
 *
 * A developer tool, run by hand, never at runtime:
 *
 *     node scripts/fonts/build-font-bundle.mjs           # build everything
 *     node scripts/fonts/build-font-bundle.mjs --check   # writes nothing; exits 1
 *                                                       # if anything differs from
 *                                                       # the committed fonts.json
 *
 * For each family in FAMILIES (the owner's list, 2026-10-24) it downloads the
 * Latin woff2 file(s) from Google Fonts and the family's licence file from the
 * google/fonts repository, then writes:
 *   force-app/main/default/staticresources/formFonts/<dir>/…   (fonts + licence)
 *   force-app/main/default/staticresources/formFonts/fonts.json (sha256 per file)
 *   force-app/main/default/staticresources/formFonts/THIRD-PARTY-NOTICES.txt
 *   force-app/main/default/lwc/finalFontFamilies/bundledFontData.js (GENERATED)
 *
 * File shapes, decided per family by what Google serves:
 *   variable  — one file covering 400–700, declared as weight '400 700'
 *   static    — separate 400 and 700 files
 *   single    — one 400 file (the family has no bold)
 *
 * Keys and aliases are SAVED data (font references, published manifests,
 * published tokens): never rename an existing one. finalFontFamilies.test.js
 * pins them.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..'
);
const RESOURCE_DIR = path.join(
    ROOT,
    'force-app/main/default/staticresources/formFonts'
);
const DATA_FILE = path.join(
    ROOT,
    'force-app/main/default/lwc/finalFontFamilies/bundledFontData.js'
);
const CHECK_ONLY = process.argv.includes('--check');

if (Number(process.versions.node.split('.')[0]) < 18) {
    throw new Error('Node 18 or newer is needed (global fetch).');
}

// A desktop Chrome user agent: Google Fonts serves woff2 with per-subset blocks.
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// group: picker group (7). kind: fallback stack the engine appends.
// bodySafe: false keeps display-only faces (condensed, all-caps, script, fine
// hairlines) out of the Body list.
const FAMILIES = [
    ['Inter', 'everyday', 'sans', true],
    ['Roboto', 'everyday', 'sans', true],
    ['Open Sans', 'everyday', 'sans', true],
    ['Lato', 'everyday', 'sans', true],
    ['Source Sans 3', 'everyday', 'sans', true],
    ['Noto Sans', 'everyday', 'sans', true],
    ['Public Sans', 'everyday', 'sans', true],
    ['Poppins', 'modern', 'sans', true],
    ['Montserrat', 'modern', 'sans', true],
    ['DM Sans', 'modern', 'sans', true],
    ['Manrope', 'modern', 'sans', true],
    ['Plus Jakarta Sans', 'modern', 'sans', true],
    ['Outfit', 'modern', 'sans', true],
    ['Figtree', 'modern', 'sans', true],
    ['Space Grotesk', 'modern', 'sans', true],
    ['Nunito', 'friendly', 'sans', true],
    ['Nunito Sans', 'friendly', 'sans', true],
    ['Quicksand', 'friendly', 'sans', true],
    ['Rubik', 'friendly', 'sans', true],
    ['Comfortaa', 'friendly', 'sans', true],
    ['Playfair Display', 'editorial', 'serif', false],
    ['Lora', 'editorial', 'serif', true],
    ['Merriweather', 'editorial', 'serif', true],
    ['Libre Baskerville', 'editorial', 'serif', true],
    ['Source Serif 4', 'editorial', 'serif', true],
    ['Noto Serif', 'editorial', 'serif', true],
    ['Cormorant Garamond', 'editorial', 'serif', false],
    ['EB Garamond', 'editorial', 'serif', true],
    ['Fraunces', 'editorial', 'serif', true],
    ['Oswald', 'bold', 'condensed', false],
    ['Barlow Condensed', 'bold', 'condensed', false],
    ['Roboto Condensed', 'bold', 'condensed', false],
    ['Archivo Black', 'bold', 'sans', false],
    ['Anton', 'bold', 'condensed', false],
    ['Bebas Neue', 'bold', 'condensed', false],
    ['JetBrains Mono', 'mono', 'mono', true],
    ['IBM Plex Mono', 'mono', 'mono', true],
    ['Roboto Mono', 'mono', 'mono', true],
    ['Source Code Pro', 'mono', 'mono', true],
    ['Space Mono', 'mono', 'mono', true],
    ['Fira Code', 'mono', 'mono', true],
    ['Caveat', 'handwritten', 'cursive', false],
    ['Dancing Script', 'handwritten', 'cursive', false],
    ['Pacifico', 'handwritten', 'cursive', false],
    ['Patrick Hand', 'handwritten', 'cursive', false],
    ['Satisfy', 'handwritten', 'cursive', false]
];

// 'Source Sans 3' → key 'sourceSans3', alias 'FormsBundledSourceSans3',
// folder 'sourcesans3' (the google/fonts folder name), file stem 'SourceSans3'.
const words = (name) => name.split(' ');
const keyOf = (name) =>
    words(name)
        .map((w, i) =>
            i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)
        )
        .join('');
const stemOf = (name) => words(name).join('');
const dirOf = (name) => stemOf(name).toLowerCase();

// HTTP errors are never mistaken for "this shape does not exist": only the
// statuses in `missing` mean that (Google answers 400 to a weight range a
// family does not have; GitHub answers 404 for a missing licence folder).
// Anything else — a 429, a 5xx, a dropped connection — stops the build, so a
// flaky network can never quietly save a family without its bold.
async function get(url, { as = 'text', missing = [] } = {}) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (missing.includes(res.status)) {
        return null;
    }
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
}

// The Latin-subset url(s) in a Google Fonts css2 response, with their weights.
function latinFaces(css) {
    const out = [];
    for (const block of css.split('/* ').slice(1)) {
        if (!block.startsWith('latin */')) {
            continue;
        }
        const url = (block.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
        const weight = (block.match(/font-weight:\s*([\d ]+);/) || [])[1];
        if (url && weight) {
            out.push({ url, weight: weight.trim() });
        }
    }
    return out;
}

async function facesFor(name) {
    const q = name.replace(/ /g, '+');
    const css2 = 'https://fonts.googleapis.com/css2?family=';
    const variable = await get(`${css2}${q}:wght@400..700`, { missing: [400] });
    if (variable) {
        const f = latinFaces(variable);
        if (f.length !== 1 || f[0].weight !== '400 700') {
            throw new Error(`${name}: unexpected weight-range response`);
        }
        return { shape: 'variable', faces: [{ ...f[0], suffix: 'wght' }] };
    }
    const both = await get(`${css2}${q}:wght@400;700`, { missing: [400] });
    if (both) {
        const f = latinFaces(both);
        if (f.length === 1 && f[0].weight === '400') {
            // a one-weight family answers 400;700 with just its 400 face
            return { shape: 'single', faces: [{ ...f[0], suffix: '400' }] };
        }
        if (f.length !== 2 || new Set(f.map((x) => x.url)).size !== 2) {
            // one url listed twice = a variable file; the range request
            // above should have found it, so something is off — stop.
            throw new Error(`${name}: unexpected 400;700 response`);
        }
        return {
            shape: 'static',
            faces: f.map((x) => ({ ...x, suffix: x.weight }))
        };
    }
    const f = latinFaces(await get(`${css2}${q}`));
    if (f.length !== 1 || f[0].weight !== '400') {
        throw new Error(`${name}: no usable Latin face from Google Fonts`);
    }
    return { shape: 'single', faces: [{ ...f[0], suffix: f[0].weight }] };
}

const GH = 'https://raw.githubusercontent.com/google/fonts/main';

async function licenceFor(name) {
    for (const [folder, file, licence] of [
        ['ofl', 'OFL.txt', 'OFL-1.1'],
        ['apache', 'LICENSE.txt', 'Apache-2.0']
    ]) {
        const text = await get(`${GH}/${folder}/${dirOf(name)}/${file}`, {
            missing: [404]
        });
        if (text) {
            const meta = await get(
                `${GH}/${folder}/${dirOf(name)}/METADATA.pb`
            );
            const copyright = (meta.match(/copyright:\s*"([^"]+)"/) || [])[1];
            if (!copyright) {
                throw new Error(`${name}: no copyright line in METADATA.pb`);
            }
            return {
                licence,
                file,
                text,
                copyright,
                source: `google/fonts ${folder}/${dirOf(name)}`
            };
        }
    }
    // Only OFL and Apache are reviewed for the managed package (plan §A.1).
    throw new Error(
        `${name}: not OFL or Apache in google/fonts — review before bundling`
    );
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const committed = fs.existsSync(path.join(RESOURCE_DIR, 'fonts.json'))
    ? JSON.parse(fs.readFileSync(path.join(RESOURCE_DIR, 'fonts.json'), 'utf8'))
    : { families: [] };

const families = [];
const downloads = new Map();
let total = 0;
for (const [name, group, kind, bodySafe] of FAMILIES) {
    const { shape, faces } = await facesFor(name);
    const lic = await licenceFor(name);
    const dir = dirOf(name);
    const outFaces = [];
    let bytes = 0;
    for (const face of faces) {
        const buf = await get(face.url, { as: 'buffer' });
        if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
            throw new Error(`${name}: download is not a woff2 file`);
        }
        const file = `${dir}/${stemOf(name)}-latin-${face.suffix}.woff2`;
        bytes += buf.length;
        outFaces.push({
            file,
            weight: face.weight,
            bytes: buf.length,
            sha256: sha256(buf)
        });
        downloads.set(file, buf);
    }
    total += bytes;
    families.push({
        key: keyOf(name),
        name,
        alias: `FormsBundled${stemOf(name)}`,
        kind,
        group,
        bodySafe,
        shape,
        licence: lic.licence,
        licenceFile: `${dir}/${lic.file}`,
        copyright: lic.copyright,
        source: lic.source,
        faces: outFaces
    });
    downloads.set(`${dir}/${lic.file}`, lic.text);
    console.log(
        `${name.padEnd(20)} ${group.padEnd(12)} ${shape.padEnd(9)} ${outFaces.length} file(s) ${(bytes / 1024).toFixed(1).padStart(6)} KB  ${lic.licence}`
    );
}
console.log(
    `TOTAL ${families.length} families, ${families.reduce((n, f) => n + f.faces.length, 0)} files, ${(total / 1024).toFixed(0)} KB`
);

// What changed against the committed fonts.json (shape, files, content).
const before = new Map(committed.families.map((f) => [f.key, f]));
const changes = [];
for (const f of families) {
    const old = before.get(f.key);
    if (!old) {
        changes.push(`+ ${f.key} (new family)`);
        continue;
    }
    if (old.shape !== f.shape) {
        changes.push(`~ ${f.key}: shape ${old.shape} -> ${f.shape}`);
    }
    const oldFiles = (old.faces || [])
        .map((x) => `${x.file}@${x.weight}#${x.sha256 || x.bytes}`)
        .join(' ');
    const newFiles = f.faces
        .map(
            (x) =>
                `${x.file}@${x.weight}#${old.faces?.[0]?.sha256 ? x.sha256 : x.bytes}`
        )
        .join(' ');
    if (oldFiles !== newFiles) {
        changes.push(`~ ${f.key}: files changed`);
    }
    before.delete(f.key);
}
for (const key of before.keys()) {
    changes.push(
        `- ${key} (removed — a SAVED key: published forms may use it)`
    );
}
console.log(
    changes.length
        ? `CHANGES vs committed fonts.json:\n  ${changes.join('\n  ')}`
        : 'No changes vs committed fonts.json.'
);

if (CHECK_ONLY) {
    process.exit(changes.length ? 1 : 0);
}

// Write: replace the folder's contents so no stale file (an old shape, a
// dropped family) can stay in the package.
fs.rmSync(RESOURCE_DIR, { recursive: true, force: true });
for (const [file, content] of downloads) {
    fs.mkdirSync(path.dirname(path.join(RESOURCE_DIR, file)), {
        recursive: true
    });
    fs.writeFileSync(path.join(RESOURCE_DIR, file), content);
}
fs.writeFileSync(
    path.join(RESOURCE_DIR, 'fonts.json'),
    JSON.stringify(
        {
            generatedBy: 'scripts/fonts/build-font-bundle.mjs',
            source: 'Google Fonts (css2 API, Latin subset) + google/fonts licence and METADATA files',
            families
        },
        null,
        4
    ) + '\n'
);
fs.writeFileSync(
    path.join(RESOURCE_DIR, 'THIRD-PARTY-NOTICES.txt'),
    [
        'Third-party fonts bundled in the formFonts static resource',
        '',
        'Each font below is redistributed unmodified (Latin subset as served by',
        'Google Fonts) under its own licence. The full licence text sits next to',
        'each font, in the folder named below.',
        '',
        ...families.flatMap((f) => [
            `${f.name}`,
            `  ${f.copyright}`,
            `  Licence: ${f.licence} (${f.licenceFile})`,
            `  Source: ${f.source}`,
            ''
        ])
    ].join('\n')
);

const data = Object.fromEntries(
    families.map((f) => [
        f.key,
        {
            name: f.name,
            alias: f.alias,
            kind: f.kind,
            group: f.group,
            bodySafe: f.bodySafe,
            faces: f.faces.map(({ file, weight }) => ({ file, weight }))
        }
    ])
);
// Formatted with the repo's own Prettier settings, so a re-run produces the
// committed file byte for byte and only real changes show in the diff.
const prettier = await import('prettier');
const options = {
    ...(await prettier.resolveConfig(DATA_FILE)),
    filepath: DATA_FILE
};
fs.writeFileSync(
    DATA_FILE,
    await prettier.format(
        '// GENERATED by scripts/fonts/build-font-bundle.mjs — do not edit by hand.\n' +
            '// The fonts in the formFonts static resource; finalFontFamilies.js freezes\n' +
            '// and exports this. Keys and aliases are saved data: never rename one.\n' +
            `export default ${JSON.stringify(data, null, 4)};\n`,
        options
    )
);
console.log(
    'wrote',
    path.relative(ROOT, RESOURCE_DIR),
    'and',
    path.relative(ROOT, DATA_FILE)
);
