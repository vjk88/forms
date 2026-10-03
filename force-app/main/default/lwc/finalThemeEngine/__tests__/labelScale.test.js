import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';

// Respondent type scale (spec rule 6): label looks are STYLE only. The size
// comes from the layout's question size; a look contributes a ratio of it.
describe('label look ratio', () => {
    const theme = () => getBuiltinTheme('editorialIvory');

    it.each([
        ['default', '1'],
        ['mutedSm', '1'],
        ['monoCaps', '0.875'],
        ['caps', '0.875']
    ])('%s look sits at %s of the question size', (labelStyle, scale) => {
        const tokens = resolveTokens(theme(), { labelStyle });
        expect(tokens['--c-label-scale']).toBe(scale);
    });

    it('an unknown look falls back to the default ratio', () => {
        const tokens = resolveTokens(theme(), { labelStyle: 'nope' });
        expect(tokens['--c-label-scale']).toBe('1');
    });

    it('the legacy size token is still emitted (contract v1) even though nothing reads it', () => {
        const tokens = resolveTokens(theme(), { labelStyle: 'monoCaps' });
        expect(tokens['--c-label-size']).toBe('0.6875rem');
    });
});
