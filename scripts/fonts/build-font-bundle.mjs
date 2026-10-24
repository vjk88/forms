#!/usr/bin/env node
/**
 * build-font-bundle — builds the `formFonts` static resource and the font data
 * the app reads (IMPL_PLAN_FONTS_AND_BRAND_THEME §A.3 step 2).
 *
 * A developer tool, run by hand, never at runtime:
 *
 *     node scripts/fonts/build-font-bundle.mjs           # build everything
 *     node scripts/fonts/build-font-bundle.mjs --check   # sizes only, writes nothing
 *
 * For each family in FAMILIES (the owner's list, 2026-10-24) it downloads the
 * Latin woff2 file(s) from Google Fonts and the family's licence file from the
 * google/fonts repository, then writes:
 *   force-app/main/default/staticresources/formFonts/<dir>/…   (fonts + licence)
 *   force-app/main/default/staticresources/formFonts/fonts.json
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
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESOURCE_DIR = path.join(ROOT, 'force-app/main/default/staticresources/formFonts');
const DATA_FILE = path.join(ROOT, 'force-app/main/default/lwc/finalFontFamilies/bundledFontData.js');
const CHECK_ONLY = process.argv.includes('--check');

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
        .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)))
        .join('');
const stemOf = (name) => words(name).join('');
const dirOf = (name) => stemOf(name).toLowerCase();

async function get(url, as = 'text') {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
        return null;
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
    const variable = await get(`https://fonts.googleapis.com/css2?family=${q}:wght@400..700`);
    if (variable) {
        const f = latinFaces(variable);
        if (f.length === 1 && f[0].weight === '400 700') {
            return { shape: 'variable', faces: [{ ...f[0], suffix: 'wght' }] };
        }
    }
    const both = await get(`https://fonts.googleapis.com/css2?family=${q}:wght@400;700`);
    if (both) {
        const f = latinFaces(both);
        const urls = new Set(f.map((x) => x.url));
        if (f.length === 2 && urls.size === 2) {
            return { shape: 'static', faces: f.map((x) => ({ ...x, suffix: x.weight })) };
        }
    }
    const one = await get(`https://fonts.googleapis.com/css2?family=${q}`);
    const f = one ? latinFaces(one) : [];
    if (f.length !== 1) {
        throw new Error(`${name}: no usable Latin face from Google Fonts`);
    }
    return { shape: 'single', faces: [{ ...f[0], suffix: f[0].weight }] };
}

async function licenceFor(name) {
    for (const [folder, file] of [
        ['ofl', 'OFL.txt'],
        ['apache', 'LICENSE.txt'],
        ['ufl', 'UFL.txt']
    ]) {
        const text = await get(
            `https://raw.githubusercontent.com/google/fonts/main/${folder}/${dirOf(name)}/${file}`
        );
        if (text) {
            return { licence: folder === 'ofl' ? 'OFL-1.1' : folder === 'apache' ? 'Apache-2.0' : 'UFL', file, text };
        }
    }
    throw new Error(`${name}: no licence file found in google/fonts`);
}

const families = [];
let total = 0;
for (const [name, group, kind, bodySafe] of FAMILIES) {
    const { shape, faces } = await facesFor(name);
    const lic = await licenceFor(name);
    const dir = dirOf(name);
    const outFaces = [];
    let bytes = 0;
    for (const face of faces) {
        const buf = await get(face.url, 'buffer');
        if (!buf || buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
            throw new Error(`${name}: download is not a woff2 file`);
        }
        const file = `${dir}/${stemOf(name)}-latin-${face.suffix}.woff2`;
        bytes += buf.length;
        outFaces.push({ file, weight: face.weight, bytes: buf.length });
        if (!CHECK_ONLY) {
            fs.mkdirSync(path.join(RESOURCE_DIR, dir), { recursive: true });
            fs.writeFileSync(path.join(RESOURCE_DIR, file), buf);
        }
    }
    if (!CHECK_ONLY) {
        fs.writeFileSync(path.join(RESOURCE_DIR, dir, lic.file), lic.text);
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
        faces: outFaces
    });
    console.log(
        `${name.padEnd(20)} ${group.padEnd(12)} ${shape.padEnd(9)} ${String(outFaces.length).padStart(1)} file(s) ${(bytes / 1024).toFixed(1).padStart(6)} KB  ${lic.licence}`
    );
}
console.log(`TOTAL ${families.length} families, ${families.reduce((n, f) => n + f.faces.length, 0)} files, ${(total / 1024).toFixed(0)} KB`);

if (!CHECK_ONLY) {
    const json = {
        generatedBy: 'scripts/fonts/build-font-bundle.mjs',
        source: 'Google Fonts (css2 API, Latin subset) + google/fonts licence files',
        families
    };
    fs.writeFileSync(path.join(RESOURCE_DIR, 'fonts.json'), JSON.stringify(json, null, 4) + '\n');

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
    fs.writeFileSync(
        DATA_FILE,
        '// GENERATED by scripts/fonts/build-font-bundle.mjs — do not edit by hand.\n' +
            '// The fonts in the formFonts static resource; finalFontFamilies.js freezes\n' +
            '// and exports this. Keys and aliases are saved data: never rename one.\n' +
            `export default ${JSON.stringify(data, null, 4)};\n`
    );
    console.log('wrote', path.relative(ROOT, RESOURCE_DIR), 'and', path.relative(ROOT, DATA_FILE));
}
