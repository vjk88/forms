import {
    BUNDLED_FONTS,
    FONT_PAIRINGS,
    bundledFont,
    headingWeight
} from 'c/finalFontFamilies';

// Keys are saved in font references and published manifests; aliases are
// baked into published `--c-font-*` tokens. Renaming either silently breaks
// published forms, so this list may only GROW (A2 adds families).
const SAVED_NAMES = {
    inter: 'FormsBundledInter',
    roboto: 'FormsBundledRoboto',
    openSans: 'FormsBundledOpenSans',
    lato: 'FormsBundledLato',
    sourceSans3: 'FormsBundledSourceSans3',
    notoSans: 'FormsBundledNotoSans',
    publicSans: 'FormsBundledPublicSans',
    poppins: 'FormsBundledPoppins',
    montserrat: 'FormsBundledMontserrat',
    dmSans: 'FormsBundledDMSans',
    manrope: 'FormsBundledManrope',
    plusJakartaSans: 'FormsBundledPlusJakartaSans',
    outfit: 'FormsBundledOutfit',
    figtree: 'FormsBundledFigtree',
    spaceGrotesk: 'FormsBundledSpaceGrotesk',
    nunito: 'FormsBundledNunito',
    nunitoSans: 'FormsBundledNunitoSans',
    quicksand: 'FormsBundledQuicksand',
    rubik: 'FormsBundledRubik',
    comfortaa: 'FormsBundledComfortaa',
    playfairDisplay: 'FormsBundledPlayfairDisplay',
    lora: 'FormsBundledLora',
    merriweather: 'FormsBundledMerriweather',
    libreBaskerville: 'FormsBundledLibreBaskerville',
    sourceSerif4: 'FormsBundledSourceSerif4',
    notoSerif: 'FormsBundledNotoSerif',
    cormorantGaramond: 'FormsBundledCormorantGaramond',
    ebGaramond: 'FormsBundledEBGaramond',
    fraunces: 'FormsBundledFraunces',
    oswald: 'FormsBundledOswald',
    barlowCondensed: 'FormsBundledBarlowCondensed',
    robotoCondensed: 'FormsBundledRobotoCondensed',
    archivoBlack: 'FormsBundledArchivoBlack',
    anton: 'FormsBundledAnton',
    bebasNeue: 'FormsBundledBebasNeue',
    jetbrainsMono: 'FormsBundledJetBrainsMono',
    ibmPlexMono: 'FormsBundledIBMPlexMono',
    robotoMono: 'FormsBundledRobotoMono',
    sourceCodePro: 'FormsBundledSourceCodePro',
    spaceMono: 'FormsBundledSpaceMono',
    firaCode: 'FormsBundledFiraCode',
    caveat: 'FormsBundledCaveat',
    dancingScript: 'FormsBundledDancingScript',
    pacifico: 'FormsBundledPacifico',
    patrickHand: 'FormsBundledPatrickHand',
    satisfy: 'FormsBundledSatisfy'
};

// Pairing keys are saved in `fonts.pairing`: these may only grow too.
const SAVED_PAIRINGS = {
    system: ['stack:system', 'stack:system'],
    modern: ['bundled:inter', 'bundled:inter'],
    geometricSans: ['bundled:poppins', 'bundled:inter'],
    startup: ['bundled:plusJakartaSans', 'bundled:plusJakartaSans'],
    friendly: ['bundled:nunito', 'bundled:nunito'],
    classic: ['bundled:fraunces', 'bundled:sourceSans3'],
    editorialSerif: ['bundled:playfairDisplay', 'bundled:lora'],
    bold: ['bundled:oswald', 'bundled:sourceSans3'],
    poster: ['bundled:bebasNeue', 'bundled:inter'],
    tech: ['bundled:spaceGrotesk', 'bundled:inter'],
    code: ['bundled:jetbrainsMono', 'bundled:jetbrainsMono'],
    handwritten: ['bundled:caveat', 'bundled:nunito']
};

// Plan §A.1: display-only faces (13), never offered as body text.
const HEADINGS_ONLY = [
    'anton',
    'archivoBlack',
    'barlowCondensed',
    'bebasNeue',
    'caveat',
    'cormorantGaramond',
    'dancingScript',
    'oswald',
    'pacifico',
    'patrickHand',
    'playfairDisplay',
    'robotoCondensed',
    'satisfy'
];

// The picker groups by these (A3).
const GROUPS = {
    everyday: [
        'inter',
        'roboto',
        'openSans',
        'lato',
        'sourceSans3',
        'notoSans',
        'publicSans'
    ],
    modern: [
        'poppins',
        'montserrat',
        'dmSans',
        'manrope',
        'plusJakartaSans',
        'outfit',
        'figtree',
        'spaceGrotesk'
    ],
    friendly: ['nunito', 'nunitoSans', 'quicksand', 'rubik', 'comfortaa'],
    editorial: [
        'playfairDisplay',
        'lora',
        'merriweather',
        'libreBaskerville',
        'sourceSerif4',
        'notoSerif',
        'cormorantGaramond',
        'ebGaramond',
        'fraunces'
    ],
    bold: [
        'oswald',
        'barlowCondensed',
        'robotoCondensed',
        'archivoBlack',
        'anton',
        'bebasNeue'
    ],
    mono: [
        'jetbrainsMono',
        'ibmPlexMono',
        'robotoMono',
        'sourceCodePro',
        'spaceMono',
        'firaCode'
    ],
    handwritten: [
        'caveat',
        'dancingScript',
        'pacifico',
        'patrickHand',
        'satisfy'
    ]
};

// File shapes: a family that silently lost its bold (a flaky build) would
// show up here and in NO_BOLD.
const TWO_FILES = [
    'lato',
    'poppins',
    'barlowCondensed',
    'ibmPlexMono',
    'spaceMono'
];
const NO_BOLD = [
    'anton',
    'archivoBlack',
    'bebasNeue',
    'pacifico',
    'patrickHand',
    'satisfy'
];

const LEGACY_TYPOGRAPHY = ['editorial', 'mono', 'geometric', 'humanist'];

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const RESOURCE = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'staticresources',
    'formFonts'
);
const JSON_FILE = JSON.parse(
    fs.readFileSync(path.join(RESOURCE, 'fonts.json'), 'utf8')
);

const KINDS = ['sans', 'serif', 'mono', 'condensed', 'cursive'];

describe('finalFontFamilies data', () => {
    it.each(Object.entries(SAVED_NAMES))(
        'family %s still exists under alias %s',
        (key, alias) => {
            expect(BUNDLED_FONTS[key].alias).toBe(alias);
        }
    );

    it.each(Object.entries(BUNDLED_FONTS))('%s is well formed', (key, f) => {
        // quoted inside CSS: letters and digits only
        expect(f.alias).toMatch(/^FormsBundled[A-Za-z0-9]+$/);
        expect(f.alias).not.toBe(f.name);
        expect(KINDS).toContain(f.kind);
        expect(typeof f.bodySafe).toBe('boolean');
        expect(f.faces.length).toBeGreaterThan(0);
        f.faces.forEach((face) => {
            expect(face.file).toMatch(/^[a-z0-9]+\/[A-Za-z0-9.-]+\.woff2$/);
            expect(String(face.weight)).toMatch(/^\d{3}( \d{3})?$/);
        });
    });

    it('every pairing points at real families', () => {
        Object.values(FONT_PAIRINGS).forEach((p) => {
            [p.display, p.body].forEach((ref) => {
                if (ref.source === 'bundled') {
                    expect(bundledFont(ref.key)).toBeDefined();
                }
            });
            if (p.body.source === 'bundled') {
                expect(bundledFont(p.body.key).bodySafe).toBe(true);
            }
        });
    });

    it('the owner list: 46 families in 7 groups, 33 usable as body text', () => {
        const all = Object.values(BUNDLED_FONTS);
        expect(all).toHaveLength(46);
        expect(Object.keys(BUNDLED_FONTS).sort()).toEqual(
            Object.keys(SAVED_NAMES).sort()
        );
        expect(new Set(all.map((f) => f.group)).size).toBe(7);
        expect(all.filter((f) => f.bodySafe)).toHaveLength(33);
    });

    it.each(Object.entries(SAVED_PAIRINGS))(
        'pairing %s is unchanged',
        (key, [display, body]) => {
            const p = FONT_PAIRINGS[key];
            expect(`${p.display.source}:${p.display.key}`).toBe(display);
            expect(`${p.body.source}:${p.body.key}`).toBe(body);
        }
    );

    it('fonts.json and the generated data describe the same fonts', () => {
        const fromJson = Object.fromEntries(
            JSON_FILE.families.map((f) => [
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
        expect(JSON.parse(JSON.stringify(BUNDLED_FONTS))).toEqual(fromJson);
    });

    it.each(JSON_FILE.families.map((f) => [f.key, f]))(
        '%s: every file is in the resource, with its licence',
        (key, f) => {
            f.faces.forEach((face) => {
                const buf = fs.readFileSync(path.join(RESOURCE, face.file));
                expect(buf.subarray(0, 4).toString('latin1')).toBe('wOF2');
                expect(buf.length).toBe(face.bytes);
                expect(
                    crypto.createHash('sha256').update(buf).digest('hex')
                ).toBe(face.sha256);
            });
            const licence = fs.readFileSync(
                path.join(RESOURCE, f.licenceFile),
                'utf8'
            );
            expect(licence).toMatch(
                f.licence === 'Apache-2.0'
                    ? /Apache License/
                    : /SIL OPEN FONT LICENSE/i
            );
        }
    );

    it('the 13 headings-only families, by name', () => {
        const notBody = Object.keys(BUNDLED_FONTS)
            .filter((k) => !BUNDLED_FONTS[k].bodySafe)
            .sort();
        expect(notBody).toEqual([...HEADINGS_ONLY].sort());
    });

    it.each(Object.entries(GROUPS))(
        'group %s holds exactly its families',
        (group, keys) => {
            const inGroup = Object.keys(BUNDLED_FONTS)
                .filter((k) => BUNDLED_FONTS[k].group === group)
                .sort();
            expect(inGroup).toEqual([...keys].sort());
        }
    );

    it('file shapes: only the expected families are split or have no bold', () => {
        const shapes = Object.fromEntries(
            JSON_FILE.families.map((f) => [f.key, f.shape])
        );
        Object.entries(shapes).forEach(([key, shape]) => {
            let want = 'variable';
            if (TWO_FILES.includes(key)) {
                want = 'static';
            } else if (NO_BOLD.includes(key)) {
                want = 'single';
            }
            expect(`${key}:${shape}`).toBe(`${key}:${want}`);
        });
        const noBold = Object.keys(BUNDLED_FONTS)
            .filter((k) => headingWeight(k))
            .sort();
        expect(noBold).toEqual([...NO_BOLD].sort());
    });

    it('pairing keys never reuse a legacy typography value', () => {
        LEGACY_TYPOGRAPHY.forEach((k) => {
            expect(Object.keys(FONT_PAIRINGS)).not.toContain(k);
        });
    });

    it('the resource holds exactly the listed files: no stale extras', () => {
        const onDisk = [];
        const walk = (dir, rel = '') => {
            fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
                const r = rel ? `${rel}/${d.name}` : d.name;
                if (d.isDirectory()) {
                    walk(path.join(dir, d.name), r);
                } else {
                    onDisk.push(r);
                }
            });
        };
        walk(RESOURCE);
        const expected = [
            'fonts.json',
            'THIRD-PARTY-NOTICES.txt',
            ...JSON_FILE.families.flatMap((f) => [
                f.licenceFile,
                ...f.faces.map((x) => x.file)
            ])
        ];
        expect(onDisk.sort()).toEqual(expected.sort());
    });

    it('the notices name every family with its copyright and licence', () => {
        const notices = fs.readFileSync(
            path.join(RESOURCE, 'THIRD-PARTY-NOTICES.txt'),
            'utf8'
        );
        JSON_FILE.families.forEach((f) => {
            expect(f.copyright).toMatch(/copyright|©/i);
            expect(notices).toContain(`${f.name}\n  ${f.copyright}`);
            expect(notices).toContain(
                `Licence: ${f.licence} (${f.licenceFile})`
            );
        });
    });

    it('the data is frozen, all the way down', () => {
        expect(Object.isFrozen(BUNDLED_FONTS)).toBe(true);
        expect(Object.isFrozen(BUNDLED_FONTS.inter.faces[0])).toBe(true);
        expect(Object.isFrozen(FONT_PAIRINGS.modern.display)).toBe(true);
    });

    it('lookups use own keys only', () => {
        [
            'constructor',
            'toString',
            '__proto__',
            'hasOwnProperty',
            42,
            null
        ].forEach((k) => expect(bundledFont(k)).toBeUndefined());
    });
});

describe('headingWeight', () => {
    it('a family that reaches bold keeps the headings’ own weight', () => {
        expect(headingWeight('inter')).toBeNull();
    });

    it.each([
        'archivoBlack',
        'anton',
        'bebasNeue',
        'pacifico',
        'patrickHand',
        'satisfy'
    ])('single-weight %s gives its one weight', (key) => {
        expect(headingWeight(key)).toBe('400');
    });

    it.each(['lato', 'poppins', 'barlowCondensed', 'ibmPlexMono', 'spaceMono'])(
        'separate regular + bold files (%s) keep the headings own weight',
        (key) => {
            expect(BUNDLED_FONTS[key].faces.map((f) => f.weight)).toEqual([
                '400',
                '700'
            ]);
            expect(headingWeight(key)).toBeNull();
        }
    );

    it('junk keys give nothing', () => {
        expect(headingWeight('constructor')).toBeNull();
        expect(headingWeight('missing')).toBeNull();
    });
});
