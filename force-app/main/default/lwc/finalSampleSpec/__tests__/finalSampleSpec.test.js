import { buildSampleSpec } from 'c/finalSampleSpec';

describe('c-final-sample-spec', () => {
    it('builds a valid v1 spec with three demo pages', () => {
        const spec = buildSampleSpec({ layout: 'stepper', themeKey: 'nordic' });
        expect(spec.specVersion).toBe(1);
        expect(spec.layout.type).toBe('stepper');
        expect(spec.theme).toEqual({ source: 'builtin', name: 'nordic' });
        expect(spec.pages).toHaveLength(3);
        // Every page renders at least one section with elements.
        spec.pages.forEach((p) => {
            expect(p.sections.length).toBeGreaterThan(0);
            expect(p.sections[0].elements.length).toBeGreaterThan(0);
        });
        // Ids are unique across the spec (stable-key contract).
        const ids = [];
        spec.pages.forEach((p) => {
            ids.push(p.id);
            p.sections.forEach((s) => {
                ids.push(s.id);
                s.elements.forEach((el) => ids.push(el.id));
            });
        });
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('uses the theme brand copy as the default header lockup', () => {
        const spec = buildSampleSpec({
            layout: 'scroll',
            themeKey: 'terracotta'
        });
        expect(spec.header.title).toBe('Workshop Registry');
        expect(spec.header.description).toBe(
            'Join our pottery classes in Austin.'
        );
    });

    it('a typed title overrides the brand title', () => {
        const spec = buildSampleSpec({
            layout: 'scroll',
            themeKey: 'terracotta',
            title: 'Contact Intake'
        });
        expect(spec.header.title).toBe('Contact Intake');
        expect(spec.form.name).toBe('Contact Intake');
    });

    it('carries paneFlow only for splitHero + oneAtATime', () => {
        const split = buildSampleSpec({
            layout: 'splitHero',
            paneFlow: 'oneAtATime'
        });
        expect(split.layout.options.paneFlow).toBe('oneAtATime');

        const stepper = buildSampleSpec({
            layout: 'stepper',
            paneFlow: 'oneAtATime'
        });
        expect(stepper.layout.options.paneFlow).toBeUndefined();

        const plain = buildSampleSpec({ layout: 'splitHero' });
        expect(plain.layout.options.paneFlow).toBeUndefined();
    });

    it('defaults the layout to scroll and omits theme when unset', () => {
        const spec = buildSampleSpec({});
        expect(spec.layout.type).toBe('scroll');
        expect(spec.theme).toBeUndefined();
        expect(spec.header.title).toBe('Registration');
    });

    it('returns fresh page objects each call (no shared mutable state)', () => {
        const a = buildSampleSpec({ layout: 'scroll' });
        const b = buildSampleSpec({ layout: 'scroll' });
        expect(a.pages).not.toBe(b.pages);
        a.pages[0].name = 'mutated';
        expect(b.pages[0].name).toBe('About you');
    });
});
