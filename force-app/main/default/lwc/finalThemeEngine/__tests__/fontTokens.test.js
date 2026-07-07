import { resolveTokens } from 'c/finalThemeEngine';

describe('font tokens', () => {
    it('new built-in pairings resolve', () => {
        expect(
            resolveTokens({ typography: 'geometric' })['--c-font-body']
        ).toContain('Avenir Next');
        expect(
            resolveTokens({ typography: 'humanist' })['--c-font-body']
        ).toContain('Gill Sans');
    });

    it('customFont wins over typography and carries its fallback', () => {
        const tokens = resolveTokens({
            typography: 'editorial',
            customFont: { family: 'Sample Brand', fallback: 'cursive' }
        });
        expect(tokens['--c-font-body']).toBe("'Sample Brand', cursive");
        expect(tokens['--c-font-display']).toBe("'Sample Brand', cursive");
    });

    it('customFont as a form-level override beats the theme pairing', () => {
        const tokens = resolveTokens(
            { typography: 'mono' },
            { customFont: { family: 'Brand X' } }
        );
        expect(tokens['--c-font-body']).toBe("'Brand X', sans-serif");
    });

    it('null customFont (explicit off) restores the pairing', () => {
        const tokens = resolveTokens(
            { typography: 'mono', customFont: { family: 'Brand X' } },
            { customFont: null }
        );
        expect(tokens['--c-font-body']).toContain('Consolas');
    });
});
