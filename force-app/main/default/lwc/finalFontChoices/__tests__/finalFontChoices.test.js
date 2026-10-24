import {
    currentChoice,
    pairingOptions,
    familyOptions,
    pairingPatch,
    sidePatch,
    applyFontPatch,
    refFromValue,
    refValue,
    refsLabel
} from 'c/finalFontChoices';
import { resolveTokens, resolveFontRefs } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';
import { BUNDLED_FONTS } from 'c/finalFontFamilies';

const BRAND_X = {
    key: 'Brand_X',
    family: 'Brand X',
    fallback: 'serif',
    resource: 'brand_x',
    regularPath: 'r.woff2',
    boldPath: 'b.woff2'
};
const UPLOADED = [BRAND_X];
const nordic = () => JSON.parse(JSON.stringify(getBuiltinTheme('nordic')));

// Apply a picker patch to a copy of the overrides, like the panel does.
function afterPatch(overrides, patch) {
    return applyFontPatch(JSON.parse(JSON.stringify(overrides)), patch);
}

describe('currentChoice', () => {
    it.each([
        [{}, 'inherit'],
        [{ fonts: { pairing: 'modern' } }, 'pairing:modern'],
        [{ typography: 'system' }, 'pairing:system'],
        [{ typography: 'geometric' }, 'legacy:geometric'],
        [{ customFont: BRAND_X }, 'uploaded:Brand_X'],
        [
            {
                fonts: {
                    display: { ...BRAND_X, source: 'uploaded' },
                    body: { ...BRAND_X, source: 'uploaded' }
                }
            },
            'uploaded:Brand_X'
        ],
        [{ fonts: { display: { source: 'bundled', key: 'oswald' } } }, 'custom']
    ])('%j → %s', (level, want) => {
        expect(currentChoice(level)).toBe(want);
    });

    it('a theme has nothing to inherit from: empty means Device default', () => {
        expect(currentChoice({}, { allowInherit: false })).toBe(
            'pairing:system'
        );
    });
});

describe('pairingOptions', () => {
    it('lists From theme (with the theme fonts), the 12 pairings, then uploads', () => {
        const { groups, flat } = pairingOptions({
            level: {},
            uploadedFonts: UPLOADED,
            allowInherit: true,
            inheritLabel: 'Georgia'
        });
        expect(groups.map((g) => g.key)).toEqual([
            'theme',
            'pairings',
            'uploaded'
        ]);
        expect(flat[0]).toMatchObject({ value: 'inherit', selected: true });
        expect(flat[0].label).toBe('From theme · Georgia');
        expect(groups[1].options).toHaveLength(12);
        expect(groups[1].options.map((o) => o.label)).toContain(
            'Editorial · Playfair Display + Lora'
        );
        expect(flat.at(-1)).toMatchObject({
            value: 'uploaded:Brand_X',
            label: 'Brand X · uploaded'
        });
    });

    it('a legacy stack shows only on a level that uses it, marked older', () => {
        const plain = pairingOptions({ level: {} });
        expect(plain.flat.some((o) => o.value.startsWith('legacy:'))).toBe(
            false
        );
        const legacy = pairingOptions({ level: { typography: 'humanist' } });
        expect(legacy.groups[0].key).toBe('current');
        expect(legacy.flat[0]).toMatchObject({
            value: 'legacy:humanist',
            label: 'Humanist · older option',
            selected: true
        });
    });

    it('a custom split shows as one "Custom" entry', () => {
        const { flat } = pairingOptions({
            level: { fonts: { display: { source: 'bundled', key: 'oswald' } } }
        });
        expect(flat.find((o) => o.selected)).toMatchObject({
            value: 'custom',
            label: 'Custom'
        });
    });

    it('the theme editor has no From theme entry', () => {
        const { flat } = pairingOptions({ level: {}, allowInherit: false });
        expect(flat.some((o) => o.value === 'inherit')).toBe(false);
        expect(flat.find((o) => o.selected).value).toBe('pairing:system');
    });
});

describe('familyOptions', () => {
    const values = (groups) =>
        groups.flatMap((g) => g.options.map((o) => o.value));

    it('Heading lists every bundled family plus Device default and uploads', () => {
        const v = values(familyOptions('display', { uploadedFonts: UPLOADED }));
        expect(v).toHaveLength(Object.keys(BUNDLED_FONTS).length + 2);
        expect(v).toContain('bundled:bebasNeue');
    });

    it('Body leaves out the 13 display-only faces', () => {
        const v = values(familyOptions('body'));
        expect(v).toHaveLength(33 + 1);
        ['bebasNeue', 'caveat', 'playfairDisplay', 'oswald'].forEach((k) =>
            expect(v).not.toContain(`bundled:${k}`)
        );
    });

    it('groups follow the owner’s seven, in order', () => {
        const keys = familyOptions('display').map((g) => g.key);
        expect(keys).toEqual([
            'device',
            'everyday',
            'modern',
            'friendly',
            'editorial',
            'bold',
            'mono',
            'handwritten'
        ]);
    });

    it('a current value the lists do not offer stays visible', () => {
        const groups = familyOptions('display', {
            selected: 'stack:geometric'
        });
        expect(groups[0].key).toBe('current');
        expect(groups[0].options[0].selected).toBe(true);
    });
});

describe('pairingPatch', () => {
    it('pairing, uploaded and inherit picks', () => {
        expect(pairingPatch('pairing:poster')).toEqual({
            fonts: { pairing: 'poster' }
        });
        const up = pairingPatch('uploaded:Brand_X', {
            uploadedFonts: UPLOADED
        });
        expect(up.fonts.display).toMatchObject({
            source: 'uploaded',
            resource: 'brand_x'
        });
        expect(up.fonts.body).toEqual(up.fonts.display);
        expect(up.fonts.body).not.toBe(up.fonts.display);
        expect(pairingPatch('inherit')).toEqual({ fonts: undefined });
    });

    it.each([
        'custom',
        'legacy:geometric',
        'pairing:constructor',
        'uploaded:gone',
        'junk'
    ])('%s writes nothing', (value) => {
        expect(pairingPatch(value, { uploadedFonts: UPLOADED })).toBeNull();
    });
});

describe('applyFontPatch', () => {
    it('always removes the legacy keys; writes or removes fonts', () => {
        const level = {
            typography: 'mono',
            customFont: null,
            palette: { accent: '#000' }
        };
        applyFontPatch(level, { fonts: { pairing: 'modern' } });
        expect(level).toEqual({
            fonts: { pairing: 'modern' },
            palette: { accent: '#000' }
        });
        applyFontPatch(level, { fonts: undefined });
        expect(level).toEqual({ palette: { accent: '#000' } });
    });
});

describe('sidePatch: a one-side edit keeps the other side (§A.3b)', () => {
    const cases = [
        ['form customFont Brand X', { customFont: BRAND_X }],
        ['form typography geometric', { typography: 'geometric' }],
        ['form customFont: null over a theme font', { customFont: null }],
        [
            'form typography mono + customFont: null',
            { typography: 'mono', customFont: null }
        ],
        ['form pairing modern', { fonts: { pairing: 'modern' } }],
        ['nothing at the form level', {}]
    ];
    const theme = () => ({ ...nordic(), customFont: BRAND_X });

    describe.each(cases)('%s', (label, overrides) => {
        it.each([
            [
                'display',
                { source: 'bundled', key: 'bebasNeue' },
                'body',
                '--c-font-body'
            ],
            [
                'body',
                { source: 'bundled', key: 'lora' },
                'display',
                '--c-font-display'
            ]
        ])(
            'editing %s leaves the other side rendering as before',
            (side, ref, other, token) => {
                const before = resolveTokens(theme(), overrides);
                const effective = resolveFontRefs(theme(), overrides);
                const patch = sidePatch(overrides, side, ref, effective);
                const after = resolveTokens(
                    theme(),
                    afterPatch(overrides, patch)
                );
                expect(after[token]).toBe(before[token]);
                // and the edited side took the pick
                const edited =
                    side === 'display' ? '--c-font-display' : '--c-font-body';
                expect(after[edited]).toContain(BUNDLED_FONTS[ref.key].alias);
            }
        );
    });

    it('a side that came from the theme is left to follow the theme', () => {
        const patch = sidePatch(
            {},
            'display',
            { source: 'bundled', key: 'oswald' },
            resolveFontRefs(theme(), {})
        );
        expect(patch.fonts).toEqual({
            display: { source: 'bundled', key: 'oswald' }
        });
    });

    it('an uploaded side is copied with its file information', () => {
        const overrides = { customFont: BRAND_X };
        const patch = sidePatch(
            overrides,
            'display',
            { source: 'bundled', key: 'oswald' },
            resolveFontRefs(nordic(), overrides)
        );
        expect(patch.fonts.body).toMatchObject({
            source: 'uploaded',
            resource: 'brand_x',
            boldPath: 'b.woff2'
        });
    });

    it('junk refs write nothing', () => {
        expect(sidePatch({}, 'display', null, null)).toBeNull();
    });
});

describe('ref values and labels', () => {
    it('round-trips select values', () => {
        ['stack:system', 'stack:geometric', 'bundled:inter'].forEach((v) =>
            expect(refValue(refFromValue(v))).toBe(v)
        );
        expect(refFromValue('uploaded:Brand_X', UPLOADED)).toMatchObject({
            family: 'Brand X'
        });
        expect(refFromValue('bundled:constructor')).toBeNull();
        expect(refFromValue('stack:toString')).toBeNull();
    });

    it('names a pair, or one name when both sides match', () => {
        expect(
            refsLabel({
                display: { source: 'bundled', key: 'playfairDisplay' },
                body: { source: 'bundled', key: 'lora' }
            })
        ).toBe('Playfair Display + Lora');
        expect(
            refsLabel({
                display: { source: 'stack', key: 'system' },
                body: { source: 'stack', key: 'system' }
            })
        ).toBe('Device default');
    });
});
