/**
 * T20: the fixture matrix is itself verified against the JS validator —
 * every valid fixture passes, every invalid fixture fails with the exact
 * expected code. The owed Apex tests assert FormLayoutSpecValidator against
 * this same matrix (serialize the specs 1:1).
 */
import { validateSpec, normalize, rebaseOps, materialize, PRESETS } from 'c/layoutModel';
import {
    SEEDS, baseSpec, deepSpec, INVALID_SPECS, ORPHAN_CASES, CONFLICT_OPS
} from 'c/layoutFixtures';

describe('valid fixtures', () => {
    it('baseSpec and deepSpec pass validateSpec', () => {
        expect(validateSpec(baseSpec()).errors).toEqual([]);
        expect(validateSpec(deepSpec()).errors).toEqual([]);
    });

    it('every seed materializes valid for every preset', () => {
        Object.keys(SEEDS).forEach((seedName) => {
            const seed = SEEDS[seedName];
            Object.keys(PRESETS).forEach((presetId) => {
                const spec = materialize(presetId, seed.pages, seed.sections);
                const { ok, errors } = validateSpec(spec);
                expect({ seedName, presetId, errors }).toEqual({ seedName, presetId, errors: [] });
                expect(ok).toBe(true);
            });
        });
    });
});

describe('invalid fixtures', () => {
    INVALID_SPECS.forEach(({ name, spec, expectCode }) => {
        it(`${name} → ${expectCode}`, () => {
            const { ok, errors } = validateSpec(spec);
            expect(ok).toBe(false);
            expect(errors.map((e) => e.code)).toContain(expectCode);
        });
    });
});

describe('orphan fixtures', () => {
    ORPHAN_CASES.forEach((c) => {
        it(`${c.name}`, () => {
            const { spec, warnings } = normalize(c.spec, c.pages, c.sections);
            const placed = [];
            spec.pages.forEach((p) =>
                p.zones.forEach((z) =>
                    z.children.forEach((ch) => {
                        if (ch.type === 'stack') placed.push(...ch.sections);
                        else ch.tracks.forEach((t) => placed.push(...t));
                    })
                )
            );
            c.expectAppended.forEach((k) => expect(placed).toContain(k));
            c.expectDropped.forEach((k) => expect(placed).not.toContain(k));
            const expectsWarning = c.expectAppended.length + c.expectDropped.length > 0;
            expect(warnings.length > 0).toBe(expectsWarning);
        });
    });
});

describe('conflict fixtures', () => {
    it('every CONFLICT_OP conflicts when rebased onto baseSpec', () => {
        const { conflicts } = rebaseOps(CONFLICT_OPS, baseSpec(), baseSpec());
        expect(conflicts.length).toBe(CONFLICT_OPS.length);
    });
});
