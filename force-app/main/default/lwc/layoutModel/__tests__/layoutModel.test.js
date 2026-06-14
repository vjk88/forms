/* eslint jest/expect-expect: ["warn", { "assertFunctionNames": ["expect", "expectError"] }] */
import {
    validateSpec,
    normalize,
    materialize,
    applyOps,
    rebaseOps,
    PRESETS,
    REGISTRY,
    CORE_ARCHETYPES,
    LIMITS
} from 'c/layoutModel';

// ------------------------------------------------- fixtures (c/layoutFixtures, T20)
import { PAGES_BASIC as PAGES, SECTIONS_BASIC as SECTIONS } from 'c/layoutFixtures';

const validSpec = () => materialize('classic', PAGES, SECTIONS);

const mosaicSections = [
    { key: 's1', pageKey: 'p_main', order: 1 },
    { key: 's2', pageKey: 'p_main', order: 2 },
    { key: 's3', pageKey: 'p_main', order: 3 },
    { key: 's4', pageKey: 'p_main', order: 4 }
];

// -------------------------------------------------------------- materialize
describe('materialize', () => {
    it('builds a valid spec for every preset (core + fast-follow)', () => {
        Object.keys(PRESETS).forEach((id) => {
            const spec = materialize(id, PAGES, SECTIONS);
            const { ok, errors } = validateSpec(spec);
            expect({ id, errors }).toEqual({ id, errors: [] });
            expect(ok).toBe(true);
            expect(spec.archetype).toBe(id);
        });
    });

    it('stackPerPage places each page’s sections in one stack, in order', () => {
        const spec = materialize('classic', PAGES, SECTIONS);
        expect(spec.pages).toHaveLength(2);
        expect(spec.pages[0].zones[0].children[0].sections).toEqual(['sec_contact', 'sec_address']);
        expect(spec.pages[1].zones[0].children[0].sections).toEqual(['sec_details', 'sec_consent']);
    });

    it('mosaic fill: first two → columns, middle → stack, last → sticky span-4', () => {
        const spec = materialize('bento', [PAGES[0]], mosaicSections);
        const [main, side] = spec.pages[0].zones;
        expect(main.span).toBe(8);
        expect(main.children[0]).toEqual({ type: 'columns', ratio: [1, 1], tracks: [['s1'], ['s2']] });
        expect(main.children[1].sections).toEqual(['s3']);
        expect(side).toMatchObject({ span: 4, sticky: true });
        expect(side.children[0].sections).toEqual(['s4']);
    });

    it('mosaic degrades gracefully below 3 sections', () => {
        const two = materialize('bento', [PAGES[0]], mosaicSections.slice(0, 2));
        expect(two.pages[0].zones).toHaveLength(1);
        expect(two.pages[0].zones[0].children[0].type).toBe('columns');
        const one = materialize('bento', [PAGES[0]], mosaicSections.slice(0, 1));
        expect(one.pages[0].zones[0].children[0]).toEqual({ type: 'stack', sections: ['s1'] });
    });

    it('throws on unknown preset', () => {
        expect(() => materialize('nope', PAGES, SECTIONS)).toThrow(/Unknown preset/);
    });

    it('resolves legacy archetype aliases to canonical layouts', () => {
        // pre-Phase-3 ids still materialize, writing the canonical archetype.
        expect(materialize('classic', PAGES, SECTIONS).archetype).toBe('stacked');
        expect(materialize('mosaicGrid', [PAGES[0]], mosaicSections).archetype).toBe('bento');
        expect(materialize('wizardStepper', PAGES, SECTIONS).archetype).toBe('stepper');
        expect(materialize('conversational', PAGES, SECTIONS).archetype).toBe('oneAtATime');
    });

    it('registry covers all core archetypes', () => {
        CORE_ARCHETYPES.forEach((id) => expect(REGISTRY[id]).toMatch(/^c\//));
        expect(REGISTRY.timeline).toBeUndefined(); // fast-follow not registered
    });
});

// -------------------------------------------------------------- validateSpec
describe('validateSpec', () => {
    const expectError = (mutate, code) => {
        const spec = validSpec();
        mutate(spec);
        const { ok, errors } = validateSpec(spec);
        expect(ok).toBe(false);
        expect(errors.map((e) => e.code)).toContain(code);
    };

    it('accepts a materialized spec', () => {
        expect(validateSpec(validSpec()).ok).toBe(true);
    });

    it('rejects non-objects and wrong version', () => {
        expect(validateSpec(null).ok).toBe(false);
        expectError((s) => { s.version = 2; }, 'bad-version');
    });

    it('rejects unknown keys everywhere (additionalProperties: false)', () => {
        expectError((s) => { s.extra = 1; }, 'unknown-key');
        expectError((s) => { s.shell.evil = 1; }, 'unknown-key');
        expectError((s) => { s.pages[0].zones[0].html = '<x>'; }, 'unknown-key');
    });

    it('rejects missing/invalid nav and incompatible stepperPlacement', () => {
        expectError((s) => { delete s.shell.nav; }, 'invalid-enum');
        expectError((s) => { s.shell.stepperPlacement = 'rail'; }, 'incompatible'); // classic = scroll
    });

    it('rejects duplicate pageKeys and duplicate section placement', () => {
        expectError((s) => { s.pages[1].pageKey = 'p_main'; }, 'duplicate-key');
        expectError((s) => { s.pages[1].zones[0].children[0].sections.push('sec_contact'); }, 'duplicate-section');
    });

    it('rejects bad spans, ratio/tracks mismatch and nested columns', () => {
        expectError((s) => { s.pages[0].zones[0].span = 13; }, 'bad-span');
        expectError((s) => {
            s.pages[0].zones[0].children[0] = { type: 'columns', ratio: [1, 1, 1], tracks: [['a'], ['b']] };
        }, 'ratio-tracks-mismatch');
        expectError((s) => {
            s.pages[0].zones[0].children[0] = { type: 'columns', ratio: [1, 1], tracks: [['a'], ['b']], nested: true };
        }, 'unknown-key');
        expectError((s) => { s.pages[0].zones[0].children[0].type = 'columns2'; }, 'bad-node-type');
    });

    it('enforces brand panel constraints', () => {
        expectError((s) => { s.shell.brandPanel = { side: 'middle' }; }, 'invalid-enum');
        expectError((s) => { s.shell.brandPanel = { side: 'left', width: '60%' }; }, 'bad-width');
        expectError((s) => { s.shell.brandPanel = { side: 'left', content: ['logo', 'video'] }; }, 'invalid-enum');
    });

    it('enforces size limits', () => {
        expectError((s) => {
            s.pages = Array.from({ length: LIMITS.maxPages + 1 }, (_, i) => ({
                pageKey: `p${i}`, zones: [{ type: 'zone', span: 12, children: [{ type: 'stack', sections: [] }] }]
            }));
        }, 'bad-pages');
    });
});

// ----------------------------------------------------------------- normalize
describe('normalize (orphan rule)', () => {
    it('returns clean spec with no warnings when spec matches data', () => {
        const { spec, warnings } = normalize(validSpec(), PAGES, SECTIONS);
        expect(warnings).toEqual([]);
        expect(validateSpec(spec).ok).toBe(true);
    });

    it('does not mutate its input', () => {
        const input = validSpec();
        const snapshot = JSON.stringify(input);
        normalize(input, PAGES, [SECTIONS[0]]);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('drops spec pages/sections missing from data, with warnings', () => {
        const { spec, warnings } = normalize(validSpec(), [PAGES[0]], SECTIONS.slice(0, 1));
        expect(spec.pages.map((p) => p.pageKey)).toEqual(['p_main']);
        expect(spec.pages[0].zones[0].children[0].sections).toEqual(['sec_contact']);
        const codes = warnings.map((w) => w.code);
        expect(codes).toContain('page-unknown');
        expect(codes).toContain('section-unknown');
    });

    it('appends data pages missing from the spec', () => {
        const spec = validSpec();
        spec.pages.pop();
        const { spec: out, warnings } = normalize(spec, PAGES, SECTIONS);
        expect(out.pages.map((p) => p.pageKey)).toEqual(['p_main', 'p_extra']);
        expect(warnings.map((w) => w.code)).toContain('page-added');
        // orphaned sections of the re-added page land in its stack
        expect(out.pages[1].zones[0].children[0].sections).toEqual(['sec_details', 'sec_consent']);
    });

    it('appends unplaced sections to their page’s last stack (nothing disappears)', () => {
        const spec = validSpec();
        spec.pages[0].zones[0].children[0].sections = ['sec_contact']; // sec_address unplaced
        const { spec: out, warnings } = normalize(spec, PAGES, SECTIONS);
        expect(out.pages[0].zones[0].children[0].sections).toEqual(['sec_contact', 'sec_address']);
        expect(warnings.map((w) => w.code)).toContain('section-orphan-appended');
    });

    it('creates a stack when the page’s last child is columns', () => {
        const spec = materialize('bento', [PAGES[0]], mosaicSections.slice(0, 2));
        const extra = [...mosaicSections.slice(0, 2), { key: 's_new', pageKey: 'p_main', order: 9 }];
        const { spec: out } = normalize(spec, [PAGES[0]], extra);
        const children = out.pages[0].zones[0].children;
        expect(children[children.length - 1]).toEqual({ type: 'stack', sections: ['s_new'] });
        expect(validateSpec(out).ok).toBe(true);
    });
});

// ------------------------------------------------------------------ applyOps
describe('applyOps', () => {
    it('setDensity / setShell merge', () => {
        const { spec, errors } = applyOps(validSpec(), [
            { op: 'setDensity', density: 'compact' },
            { op: 'setShell', patch: { maxWidth: 'wide', progress: 'bar' } }
        ]);
        expect(errors).toEqual([]);
        expect(spec.density).toBe('compact');
        expect(spec.shell).toMatchObject({ maxWidth: 'wide', progress: 'bar', nav: 'scroll' });
    });

    it('moveSection into a columns track', () => {
        const base = validSpec();
        const split = applyOps(base, [
            { op: 'splitColumns', pageKey: 'p_main', zoneIndex: 0, childIndex: 0, ratio: [1, 1] }
        ]);
        expect(split.errors).toEqual([]);
        const { spec, errors } = applyOps(split.spec, [
            { op: 'moveSection', sectionKey: 'sec_details', target: { pageKey: 'p_main', zoneIndex: 0, childIndex: 0, trackIndex: 1 } }
        ]);
        expect(errors).toEqual([]);
        expect(spec.pages[0].zones[0].children[0].tracks[1]).toContain('sec_details');
        // removed from original page
        expect(JSON.stringify(spec.pages[1])).not.toContain('sec_details');
    });

    it('splitColumns honors distribute order, mergeToStack restores', () => {
        const base = validSpec();
        const { spec, errors } = applyOps(base, [
            { op: 'splitColumns', pageKey: 'p_main', zoneIndex: 0, childIndex: 0, ratio: [2, 1], distribute: ['sec_address', 'sec_contact'] }
        ]);
        expect(errors).toEqual([]);
        expect(spec.pages[0].zones[0].children[0].tracks).toEqual([['sec_address'], ['sec_contact']]);

        const merged = applyOps(spec, [{ op: 'mergeToStack', pageKey: 'p_main', zoneIndex: 0, childIndex: 0 }]);
        expect(merged.errors).toEqual([]);
        expect(merged.spec.pages[0].zones[0].children[0]).toEqual({ type: 'stack', sections: ['sec_address', 'sec_contact'] });
    });

    it('setZones redistributes children and marks stickyLast', () => {
        const { spec, errors } = applyOps(validSpec(), [
            { op: 'setZones', pageKey: 'p_main', spans: [8, 4], stickyLast: true }
        ]);
        expect(errors).toEqual([]);
        const zones = spec.pages[0].zones;
        expect(zones.map((z) => z.span)).toEqual([8, 4]);
        expect(zones[1].sticky).toBe(true);
        expect(validateSpec(spec).ok).toBe(true);
    });

    it('setArchetype re-places all sections losslessly', () => {
        const { spec, errors } = applyOps(validSpec(), [{ op: 'setArchetype', archetype: 'bento' }]);
        expect(errors).toEqual([]);
        expect(spec.archetype).toBe('bento');
        const all = JSON.stringify(spec);
        SECTIONS.forEach((s) => expect(all).toContain(s.key));
    });

    it('routes setTheme to themeOps without touching the spec', () => {
        const base = validSpec();
        const { spec, themeOps, errors } = applyOps(base, [{ op: 'setTheme', patch: { accent: '#0b5d3b' } }]);
        expect(errors).toEqual([]);
        expect(themeOps).toHaveLength(1);
        expect(spec).toEqual(base);
    });

    it('rejects the whole patch on any invalid op (all-or-nothing)', () => {
        const base = validSpec();
        const { spec, errors } = applyOps(base, [
            { op: 'setDensity', density: 'compact' },              // valid
            { op: 'moveSection', sectionKey: 'ghost', target: { pageKey: 'p_main', zoneIndex: 0, childIndex: 0 } } // invalid
        ]);
        expect(errors.length).toBeGreaterThan(0);
        expect(spec).toEqual(base); // untouched
    });

    it('rejects when the resulting spec is invalid (post-validate)', () => {
        const base = validSpec();
        const { spec, errors } = applyOps(base, [{ op: 'setShell', patch: { nav: 'teleport' } }]);
        expect(errors.some((e) => e.code === 'invalid-enum')).toBe(true);
        expect(spec).toEqual(base);
    });

    it('rejects unknown ops, empty patches and > 15 ops', () => {
        expect(applyOps(validSpec(), [{ op: 'dropTable' }]).errors[0].code).toBe('unknown-op');
        expect(applyOps(validSpec(), []).errors[0].code).toBe('no-ops');
        const many = Array.from({ length: 16 }, () => ({ op: 'setDensity', density: 'compact' }));
        expect(applyOps(validSpec(), many).errors[0].code).toBe('too-many-ops');
    });

    it('requires childIndex for splitColumns/mergeToStack (no silent no-op)', () => {
        const r1 = applyOps(validSpec(), [{ op: 'splitColumns', pageKey: 'p_main', zoneIndex: 0, ratio: [1, 1] }]);
        expect(r1.errors[0].message).toMatch(/childIndex/);
        const r2 = applyOps(validSpec(), [{ op: 'mergeToStack', pageKey: 'p_main', zoneIndex: 0 }]);
        expect(r2.errors[0].message).toMatch(/childIndex/);
    });
});

// ----------------------------------------------------------------- rebaseOps
describe('rebaseOps', () => {
    it('keeps global ops unconditionally', () => {
        const ops = [{ op: 'setDensity', density: 'compact' }, { op: 'setTheme', patch: {} }];
        const { ops: kept, conflicts } = rebaseOps(ops, validSpec(), validSpec());
        expect(kept).toHaveLength(2);
        expect(conflicts).toEqual([]);
    });

    it('conflicts when a moved section no longer exists', () => {
        const newSpec = validSpec();
        newSpec.pages[0].zones[0].children[0].sections = ['sec_contact']; // sec_address gone
        const ops = [{ op: 'moveSection', sectionKey: 'sec_address', target: { pageKey: 'p_main', zoneIndex: 0, childIndex: 0 } }];
        const { ops: kept, conflicts } = rebaseOps(ops, validSpec(), newSpec);
        expect(kept).toEqual([]);
        expect(conflicts[0].reason).toMatch(/no longer exists/);
    });

    it('conflicts when the target container type changed', () => {
        const newSpec = applyOps(validSpec(), [
            { op: 'splitColumns', pageKey: 'p_main', zoneIndex: 0, childIndex: 0, ratio: [1, 1] }
        ]).spec;
        const ops = [{ op: 'splitColumns', pageKey: 'p_main', zoneIndex: 0, childIndex: 0, ratio: [1, 1] }];
        const { ops: kept, conflicts } = rebaseOps(ops, validSpec(), newSpec);
        expect(kept).toEqual([]); // already columns now
        expect(conflicts).toHaveLength(1);
    });

    it('keeps ops whose targets still resolve after unrelated edits', () => {
        const newSpec = applyOps(validSpec(), [{ op: 'setDensity', density: 'compact' }]).spec;
        const ops = [{ op: 'splitColumns', pageKey: 'p_main', zoneIndex: 0, childIndex: 0, ratio: [1, 1] }];
        const { ops: kept, conflicts } = rebaseOps(ops, validSpec(), newSpec);
        expect(kept).toHaveLength(1);
        expect(conflicts).toEqual([]);
    });
});
