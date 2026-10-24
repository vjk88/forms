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

describe('resolveSpecForPublish: font manifest (fonts A1)', () => {
    const BRAND_X = {
        key: 'Brand_X',
        family: 'Brand X',
        resource: 'brand_x',
        regularPath: 'r.woff2',
        boldPath: 'b.woff2'
    };
    const BRAND_Y = { key: 'Brand_Y', family: 'Brand Y', resource: 'brand_y' };

    it('a form on installed fonts gets no fonts entry (snapshot shape unchanged)', () => {
        const out = resolveSpecForPublish(
            draft({ source: 'builtin', name: 'nordic' })
        );
        expect('fonts' in out.resolved).toBe(false);
    });

    it('an org theme with two uploaded fonts freezes both, with file info', () => {
        const custom = {
            ...getBuiltinTheme('nordic'),
            fonts: {
                display: { ...BRAND_X, source: 'uploaded' },
                body: { ...BRAND_Y, source: 'uploaded' }
            }
        };
        const out = resolveSpecForPublish(
            draft({ source: 'custom', name: 'a0X000000000001' }),
            custom
        );
        expect(out.resolved.fonts).toEqual([
            { ...BRAND_X, source: 'uploaded' },
            { ...BRAND_Y, source: 'uploaded' }
        ]);
    });

    it('a theme-level legacy customFont is frozen too (fixed by a republish)', () => {
        const custom = { ...getBuiltinTheme('nordic'), customFont: BRAND_X };
        const out = resolveSpecForPublish(
            draft({ source: 'custom', name: 'a0X000000000002' }),
            custom
        );
        expect(out.resolved.fonts).toEqual([
            { ...BRAND_X, source: 'uploaded' }
        ]);
    });

    it('a bundled pairing is frozen by key, not by address', () => {
        const out = resolveSpecForPublish(
            draft({
                source: 'builtin',
                name: 'nordic',
                overrides: { fonts: { pairing: 'poster' } }
            })
        );
        expect(out.resolved.fonts).toEqual([
            { source: 'bundled', key: 'bebasNeue' },
            { source: 'bundled', key: 'inter' }
        ]);
    });
});
