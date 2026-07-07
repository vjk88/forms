import { resolveSpecForPublish, getBuiltinTheme } from 'c/finalThemeCatalog';
import { resolveTokens, ENGINE_VERSION } from 'c/finalThemeEngine';

const draft = (theme) => ({
    specVersion: 1,
    layout: { type: 'scroll' },
    theme,
    pages: []
});

describe('resolveSpecForPublish', () => {
    it('snapshots the FULL token map (theme + overrides) into resolved', () => {
        const spec = draft({
            source: 'builtin',
            name: 'editorialIvory',
            overrides: { palette: { accent: '#7c2d9c' } }
        });
        const out = resolveSpecForPublish(spec);
        expect(out.resolved.tokens).toEqual(
            resolveTokens(getBuiltinTheme('editorialIvory'), {
                palette: { accent: '#7c2d9c' }
            })
        );
        expect(out.resolved.tokens['--c-accent']).toBe('#7c2d9c');
        expect(out.resolved.engineVersion).toBe(ENGINE_VERSION);
        expect(new Date(out.resolved.resolvedAt).getTime()).not.toBeNaN();
    });

    it('does not mutate the draft', () => {
        const spec = draft({ source: 'builtin', name: 'nordic' });
        resolveSpecForPublish(spec);
        expect(spec.resolved).toBeUndefined();
    });

    it('overrides-only spec (no builtin theme) still resolves', () => {
        const out = resolveSpecForPublish(
            draft({ source: 'builtin', name: 'nope-not-real', overrides: {} })
        );
        // unknown theme → engine defaults; snapshot still complete
        expect(out.resolved.tokens['--c-accent']).toBeDefined();
    });

    it('rejects non-v1 specs', () => {
        expect(() => resolveSpecForPublish({ specVersion: 2 })).toThrow();
        expect(() => resolveSpecForPublish(null)).toThrow();
    });

    it('custom theme: resolves from the provided record props, refuses without them', () => {
        const spec = draft({ source: 'custom', name: 'a0AXX0000001' });
        const out = resolveSpecForPublish(spec, {
            palette: { accent: '#7c2d9c' }
        });
        expect(out.resolved.tokens['--c-accent']).toBe('#7c2d9c');
        expect(() => resolveSpecForPublish(spec)).toThrow(
            /custom theme properties required/
        );
    });
});
