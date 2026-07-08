import { resolveTokens, MESH_SEEDS } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';

// hex → "r, g, b" as it appears inside the preset's rgba() strings
const rgb = (hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

// Immersive pass (Neon Nights, owner 2026-07-08): 4-slot mesh + drift/blend,
// grain texture, numeric glass depth, gradient title ink, gradient+glow CTA,
// caps labels, fieldRadius. Contract event — CONTRACT_V1 updated alongside.
describe('immersive capabilities', () => {
    it('neon mesh fills all four slots; three-layer presets leave slot 4 as none', () => {
        const neon = resolveTokens(null, { effects: { mesh: 'neon' } });
        expect(neon['--c-fx-mesh-1']).toContain('rgba(122, 92, 255');
        expect(neon['--c-fx-mesh-4']).toContain('rgba(255, 177, 61');
        const aurora = resolveTokens(null, { effects: { mesh: 'aurora' } });
        expect(aurora['--c-fx-mesh-4']).toBe('none');
    });

    it('drift + blend are presentation tokens with safe defaults', () => {
        const off = resolveTokens(null, { effects: { mesh: 'neon' } });
        expect(off['--c-mesh-anim']).toBe('paused');
        expect(off['--c-mesh-blend']).toBe('normal');
        const on = resolveTokens(null, {
            effects: { mesh: 'neon', meshAnimate: true, meshBlend: 'screen' }
        });
        expect(on['--c-mesh-anim']).toBe('running');
        expect(on['--c-mesh-blend']).toBe('screen');
    });

    it('grain texture is a turbulence tile with intensity-driven opacity', () => {
        const t = resolveTokens(null, {
            effects: { texture: 'grain', textureIntensity: 'medium' }
        });
        expect(t['--c-fx-texture']).toContain('feTurbulence');
        expect(t['--c-fx-texture']).toContain("opacity='0.12'");
    });

    it('glass accepts a numeric blur depth; booleans keep the legacy 14px', () => {
        expect(
            resolveTokens(null, { effects: { glass: 26 } })['--c-glass-blur']
        ).toBe('26px');
        expect(
            resolveTokens(null, { effects: { glass: true } })['--c-glass-blur']
        ).toBe('14px');
        expect(resolveTokens(null, {})['--c-glass-blur']).toBe('0px');
    });

    it('title gradient emits as a PAIR; absent config emits neither token', () => {
        const on = resolveTokens(null, {
            palette: {
                headerTitleGradient: {
                    angle: 100,
                    stops: ['#ffffff', '#d9ccff 60%', '#16e0c4']
                }
            }
        });
        expect(on['--c-header-title-gradient']).toBe(
            'linear-gradient(100deg, #ffffff, #d9ccff 60%, #16e0c4)'
        );
        expect(on['--c-header-title-fill']).toBe('transparent');
        const off = resolveTokens(null, {});
        expect(off['--c-header-title-gradient']).toBeUndefined();
        expect(off['--c-header-title-fill']).toBeUndefined();
        // one stop = not a gradient — degrade to absent, never invalid CSS
        const bad = resolveTokens(null, {
            palette: { headerTitleGradient: { stops: ['#fff'] } }
        });
        expect(bad['--c-header-title-gradient']).toBeUndefined();
    });

    it('submit gradient + glow; glow derives from the gradient start', () => {
        const t = resolveTokens(null, {
            palette: {
                submitBg: '#16e0c4',
                submitBgGradient: {
                    type: 'linear',
                    angle: 100,
                    start: '#16e0c4',
                    end: '#7af6e0'
                },
                submitGlow: true
            }
        });
        expect(t['--c-submit-bg-gradient']).toBe(
            'linear-gradient(100deg, #16e0c4, #7af6e0)'
        );
        expect(t['--c-submit-glow']).toBe(
            '0 16px 40px -12px rgba(22, 224, 196, 0.6)'
        );
        const plain = resolveTokens(null, {});
        expect(plain['--c-submit-bg-gradient']).toBe('none');
        expect(plain['--c-submit-glow']).toBe('none');
    });

    it('meshBlur drives filter AND bleed together; 0 keeps legacy geometry', () => {
        const soft = resolveTokens(null, {
            effects: { mesh: 'neon', meshBlur: 60 }
        });
        expect(soft['--c-mesh-filter']).toBe('blur(60px)');
        expect(soft['--c-mesh-bleed']).toBe('-15%');
        const legacy = resolveTokens(null, { effects: { mesh: 'aurora' } });
        expect(legacy['--c-mesh-filter']).toBe('none');
        expect(legacy['--c-mesh-bleed']).toBe('0');
    });

    it('pageRadius is a conditional token keyed to the radius scale', () => {
        expect(
            resolveTokens(null, { pageRadius: 'xl' })['--c-page-radius']
        ).toBe('20px');
        expect(resolveTokens(null, {})['--c-page-radius']).toBeUndefined();
    });

    it('MESH_SEEDS mirror each preset exactly — count and colors (the panel shows these as live picker values)', () => {
        for (const key of ['aurora', 'dusk', 'neon']) {
            const t = resolveTokens(null, { effects: { mesh: key } });
            MESH_SEEDS[key].forEach((hex, i) => {
                expect(t[`--c-fx-mesh-${i + 1}`]).toContain(`rgba(${rgb(hex)}`);
            });
            const past = MESH_SEEDS[key].length + 1;
            if (past <= 4) {
                expect(t[`--c-fx-mesh-${past}`]).toBe('none');
            }
        }
    });

    it('custom mesh builds blobs from user colors; empty slots stay POSITIONAL', () => {
        const t = resolveTokens(null, {
            effects: { mesh: 'custom', meshColors: ['#ff0000', '#00ff00'] }
        });
        expect(t['--c-fx-mesh-1']).toContain('rgba(255, 0, 0, 0.55)');
        expect(t['--c-fx-mesh-2']).toContain('rgba(0, 255, 0, 0.5)');
        expect(t['--c-fx-mesh-3']).toBe('none'); // slot 3 empty, slot 2 did NOT shift
        expect(t['--c-fx-mesh-4']).toBe('none');
    });

    it('custom mesh accepts the {0:..} object form and goes hot when blurred', () => {
        const t = resolveTokens(null, {
            effects: {
                mesh: 'custom',
                meshColors: { 0: '#ff0000' },
                meshBlur: 60
            }
        });
        expect(t['--c-fx-mesh-1']).toContain('rgba(255, 0, 0, 0.85)');
        expect(t['--c-mesh-filter']).toBe('blur(60px)');
    });

    it('glass coerces numeric strings (panel depth select) and caps sane', () => {
        expect(
            resolveTokens(null, { effects: { glass: '26' } })['--c-glass-blur']
        ).toBe('26px');
        expect(
            resolveTokens(null, { effects: { glass: 999 } })['--c-glass-blur']
        ).toBe('60px');
        expect(
            resolveTokens(null, { effects: { glass: false } })['--c-glass-blur']
        ).toBe('0px');
    });

    it('caps label look: uppercase tracked sans in the muted ink', () => {
        const t = resolveTokens(null, { labelStyle: 'caps' });
        expect(t['--c-label-transform']).toBe('uppercase');
        expect(t['--c-label-tracking']).toBe('0.1em');
        expect(t['--c-label-font']).toBeUndefined(); // body font, not mono
    });

    it('fieldRadius keys --c-input-radius; the underline shell still pins 0', () => {
        const t = resolveTokens(null, { fieldRadius: 'round' });
        expect(t['--c-input-radius']).toBe('14px');
        const u = resolveTokens(null, {
            fieldRadius: 'round',
            fieldStyle: 'underline'
        });
        expect(u['--c-input-radius']).toBe('0px');
    });

    it('neonNights resolves end-to-end with the exploration values', () => {
        const t = resolveTokens(getBuiltinTheme('neonNights'), null);
        expect(t['--c-page-bg']).toBe('#08060f');
        expect(t['--c-content-bg']).toBe('rgba(255, 255, 255, 0.08)');
        expect(t['--c-glass-blur']).toBe('26px');
        expect(t['--c-mesh-anim']).toBe('running');
        expect(t['--c-mesh-blend']).toBe('screen');
        expect(t['--c-mesh-filter']).toBe('blur(60px)');
        expect(t['--c-mesh-bleed']).toBe('-15%');
        expect(t['--c-page-radius']).toBe('20px');
        expect(t['--c-input-bg']).toBe('rgba(255, 255, 255, 0.06)'); // dark-aware outline
        expect(t['--c-input-radius']).toBe('14px');
        expect(t['--c-radius']).toBe('24px');
        expect(t['--c-header-title-fill']).toBe('transparent');
        expect(t['--c-submit-text']).toBe('#0a0612');
        expect(t['--c-content-shadow']).toContain('0 30px 80px');
    });
});
