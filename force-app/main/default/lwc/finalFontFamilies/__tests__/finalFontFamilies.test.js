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
    bebasNeue: 'FormsBundledBebasNeue'
};

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

    it('a single-weight family gives its one weight', () => {
        expect(headingWeight('bebasNeue')).toBe('400');
    });

    it('junk keys give nothing', () => {
        expect(headingWeight('constructor')).toBeNull();
        expect(headingWeight('missing')).toBeNull();
    });
});
