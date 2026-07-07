import { resolveTokens } from 'c/finalThemeEngine';

describe('texture + mesh intensity (owner QA: effects were invisible)', () => {
    it('texture defaults stay at the original subtle ink (back-compat)', () => {
        const t = resolveTokens({ effects: { texture: 'dots' } });
        expect(t['--c-fx-texture']).toContain("fill-opacity='0.05'");
    });

    it('texture intensity raises the ink opacity', () => {
        const medium = resolveTokens({
            effects: { texture: 'dots', textureIntensity: 'medium' }
        });
        const strong = resolveTokens({
            effects: { texture: 'grid', textureIntensity: 'strong' }
        });
        expect(medium['--c-fx-texture']).toContain("fill-opacity='0.12'");
        expect(strong['--c-fx-texture']).toContain("stroke-opacity='0.22'");
    });

    it('mesh defaults are unchanged (snapshot back-compat)', () => {
        const t = resolveTokens({ effects: { mesh: 'aurora' } });
        expect(t['--c-fx-mesh-1']).toContain('rgba(45, 212, 191, 0.2)');
    });

    it('mesh intensity scales every layer alpha, capped at 0.6', () => {
        const medium = resolveTokens({
            effects: { mesh: 'aurora', meshIntensity: 'medium' }
        });
        expect(medium['--c-fx-mesh-1']).toContain('rgba(45, 212, 191, 0.400)');
        const strong = resolveTokens({
            effects: { mesh: 'aurora', meshIntensity: 'strong' }
        });
        expect(strong['--c-fx-mesh-1']).toContain('rgba(45, 212, 191, 0.600)');
        expect(strong['--c-fx-mesh-3']).toContain('rgba(251, 191, 36, 0.384)');
    });

    it('intensity without an active effect emits none', () => {
        const t = resolveTokens({
            effects: { textureIntensity: 'strong', meshIntensity: 'strong' }
        });
        expect(t['--c-fx-texture']).toBe('none');
        expect(t['--c-fx-mesh-1']).toBe('none');
    });
});
