import { designArt, PICTURE_KEYS, SWITCH_KEYS } from 'c/finalDesignArt';
import { flattenControls } from 'c/finalDesignRegistry';
import { MESH_SEEDS } from 'c/finalThemeEngine';

const control = (key) =>
    flattenControls().find((e) => e.control.key === key)?.control;

describe('c/finalDesignArt', () => {
    it.each(PICTURE_KEYS)(
        '%s is a dropdown in the registry with a drawing for every option',
        (key) => {
            const c = control(key);
            expect(c).toBeDefined();
            expect(c.type).toBe('select');
            for (const o of c.options) {
                const art = designArt(key, o.value, { meshSeeds: MESH_SEEDS });
                expect(art).not.toBeNull();
                expect(art.viewBox).toBe('0 0 56 36');
                expect(art.shapes.length).toBeGreaterThan(0);
                // every shape is one the tiles can draw, with its own key
                for (const s of art.shapes) {
                    expect(['rect', 'circle', 'path']).toContain(s.t);
                    expect(s.key).toMatch(/^s\d+$/);
                }
            }
        }
    );

    it('options that look different draw differently', () => {
        for (const key of PICTURE_KEYS) {
            const drawn = control(key).options.map((o) =>
                JSON.stringify(
                    designArt(key, o.value, { meshSeeds: MESH_SEEDS }).shapes
                )
            );
            expect(new Set(drawn).size).toBe(drawn.length);
        }
    });

    it('a mesh draws its own colors; Custom draws the form’s blobs', () => {
        const neon = designArt('mesh', 'neon', { meshSeeds: MESH_SEEDS });
        expect(neon.shapes.map((s) => s.fill).filter(Boolean)).toEqual(
            MESH_SEEDS.neon
        );
        const custom = designArt('mesh', 'custom', {
            meshSeeds: MESH_SEEDS,
            customMesh: ['#111111', '#222222']
        });
        expect(custom.shapes.map((s) => s.fill).filter(Boolean)).toEqual([
            '#111111',
            '#222222'
        ]);
    });

    it('strengths stay a switch and have no drawing', () => {
        for (const key of SWITCH_KEYS) {
            expect(control(key).type).toBe('select');
            expect(designArt(key, 'medium')).toBeNull();
        }
    });
});
