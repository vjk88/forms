import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';

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
        expect(t['--c-input-bg']).toBe('rgba(255, 255, 255, 0.06)'); // dark-aware outline
        expect(t['--c-input-radius']).toBe('14px');
        expect(t['--c-radius']).toBe('24px');
        expect(t['--c-header-title-fill']).toBe('transparent');
        expect(t['--c-submit-text']).toBe('#0a0612');
        expect(t['--c-content-shadow']).toContain('0 30px 80px');
    });
});
