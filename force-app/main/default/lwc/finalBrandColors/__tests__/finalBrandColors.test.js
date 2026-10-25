import { suggestColors } from 'c/finalBrandColors';

// RGBA pixel arrays: `n` pixels of one colour.
function px(hex, n, alpha = 255) {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(v[0], v[1], v[2], alpha);
    }
    return out;
}

describe('suggestColors', () => {
    it('one brand colour on white: that colour, and the white is ignored', () => {
        const pixels = [...px('#ffffff', 600), ...px('#e11d48', 400)];
        const out = suggestColors(pixels);
        expect(out).toHaveLength(1);
        expect(out[0].hex).toBe('#e11d48');
        expect(out[0].share).toBe(1);
    });

    it('two colours are ranked by how much of the logo they cover', () => {
        const pixels = [...px('#1e3a8a', 300), ...px('#fbbf24', 700)];
        expect(suggestColors(pixels).map((c) => c.hex)).toEqual([
            '#fbbf24',
            '#1e3a8a'
        ]);
    });

    it.each([
        ['black only', px('#000000', 500)],
        ['grey only', px('#808080', 500)],
        ['white only', px('#ffffff', 500)],
        ['fully transparent', px('#e11d48', 500, 0)]
    ])('%s: nothing to suggest', (label, pixels) => {
        expect(suggestColors(pixels)).toEqual([]);
    });

    it('near-identical shades collapse into one suggestion', () => {
        const pixels = [...px('#e11d48', 300), ...px('#e3204b', 300)];
        expect(suggestColors(pixels)).toHaveLength(1);
    });

    it('stray anti-aliasing pixels are not suggested', () => {
        const pixels = [...px('#1e3a8a', 1000), ...px('#16a34a', 2)];
        expect(suggestColors(pixels).map((c) => c.hex)).toEqual(['#1e3a8a']);
    });

    it('never more than `max`, and junk input gives nothing', () => {
        const pixels = [
            '#e11d48',
            '#fbbf24',
            '#1e3a8a',
            '#16a34a',
            '#7c3aed',
            '#06b6d4',
            '#ea580c'
        ].flatMap((h) => px(h, 100));
        expect(suggestColors(pixels, { max: 5 })).toHaveLength(5);
        expect(suggestColors(null)).toEqual([]);
        expect(suggestColors('nope')).toEqual([]);
    });
});

describe('suggestColors: anti-aliased edges', () => {
    it('edge blends with white are not suggested (the Studio logo case)', () => {
        // a rose mark and navy text on white, with their soft edges: the
        // exact extras the real Studio run produced before this rule
        const pixels = [
            ...px('#ffffff', 2000),
            ...px('#e1204a', 500),
            ...px('#1f3b8b', 300),
            ...px('#f09eb0', 80),
            ...px('#4a5d9e', 70),
            ...px('#b5cfe9', 60)
        ];
        expect(suggestColors(pixels).map((c) => c.hex)).toEqual([
            '#e1204a',
            '#1f3b8b'
        ]);
    });

    it('a real second colour that is not a blend stays', () => {
        const pixels = [...px('#e11d48', 500), ...px('#fbbf24', 200)];
        expect(suggestColors(pixels).map((c) => c.hex)).toEqual([
            '#e11d48',
            '#fbbf24'
        ]);
    });
});

describe('suggestColors: thin strokes', () => {
    it('edge pixels that outnumber a thin stroke’s core still lose to it', () => {
        // the real Studio run: navy text whose soft edge (#4a5d9e) covered
        // more pixels than its solid core (#1f3b8b)
        const pixels = [
            ...px('#ffffff', 2000),
            ...px('#e1204a', 500),
            ...px('#4a5d9e', 300),
            ...px('#1f3b8b', 200)
        ];
        expect(suggestColors(pixels).map((c) => c.hex)).toEqual([
            '#e1204a',
            '#1f3b8b'
        ]);
    });
});
