import {
    resolveTokens,
    tokensToStyle,
    ENGINE_VERSION
} from 'c/finalThemeEngine';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';
import { LAYOUTS, getLayout } from 'c/finalLayoutRegistry';

// The full contract vocabulary (ARCH §3.2). Append-only: adding here is fine,
// renaming/removing an existing name means you broke the contract — stop.
const CONTRACT_V1 = [
    '--c-page-bg',
    '--c-page-bg-image',
    '--c-page-bg-size',
    '--c-page-bg-position',
    '--c-page-bg-repeat',
    '--c-page-scrim',
    '--c-fx-mesh-1',
    '--c-fx-mesh-2',
    '--c-fx-mesh-3',
    '--c-fx-texture',
    '--c-content-bg',
    '--c-content-border',
    '--c-content-shadow',
    '--c-glass-blur',
    '--c-section-pad',
    '--c-field-bg',
    '--c-field-border',
    '--c-field-focus',
    '--c-field-error',
    '--c-field-required',
    '--c-control-h',
    '--c-text',
    '--c-text-weak',
    '--c-accent',
    '--c-on-accent',
    '--c-focus-ring',
    '--c-header-bg',
    '--c-header-text',
    '--c-header-text-weak',
    '--c-submit-bg',
    '--c-submit-text',
    '--c-radius',
    '--c-space-1',
    '--c-space-2',
    '--c-space-3',
    '--c-space-4',
    '--c-space-5',
    '--c-space-6',
    '--c-font-body',
    '--c-font-display'
];

const theme = () => getBuiltinTheme('editorialIvory');

describe('c-final-theme-engine', () => {
    describe('no-theme path', () => {
        it('returns {} with no inputs — neutral render belongs to pageFrame :host', () => {
            expect(resolveTokens(null, null)).toEqual({});
            expect(resolveTokens(undefined, undefined)).toEqual({});
        });

        it('overrides alone still resolve (defaults + deltas)', () => {
            const t = resolveTokens(null, { palette: { accent: '#111111' } });
            expect(t['--c-accent']).toBe('#111111');
            expect(t['--c-page-bg']).toBeDefined();
        });
    });

    describe('contract completeness (append-only tripwire)', () => {
        it('emits EXACTLY the contract v1 vocabulary for a full theme', () => {
            const keys = Object.keys(resolveTokens(theme(), null)).sort();
            expect(keys).toEqual([...CONTRACT_V1].sort());
        });

        it('never emits section surface tokens — unset means the preset decides', () => {
            const t = resolveTokens(theme(), null);
            expect(t['--c-section-bg']).toBeUndefined();
            expect(t['--c-section-border']).toBeUndefined();
            expect(t['--c-section-shadow']).toBeUndefined();
        });
    });

    describe('cascade (theme default → form override)', () => {
        it('override wins over theme value', () => {
            const t = resolveTokens(theme(), { palette: { accent: '#7c3aed' } });
            expect(t['--c-accent']).toBe('#7c3aed');
        });

        it('sparse override keeps untouched keys from the theme', () => {
            const t = resolveTokens(theme(), { palette: { accent: '#7c3aed' } });
            expect(t['--c-page-bg']).toBe('#f6f4ee');
            expect(t['--c-text']).toBe('#232019');
        });

        it('scalar overrides (radius/density) win', () => {
            const t = resolveTokens(theme(), {
                radius: 'pill',
                density: 'compact'
            });
            expect(t['--c-radius']).toBe('24px');
            expect(t['--c-control-h']).toBe('36px');
        });

        it('undefined means "not set"; null is an explicit value that wins', () => {
            const base = resolveTokens(theme(), {
                effects: { mesh: 'aurora' }
            });
            expect(base['--c-fx-mesh-1']).not.toBe('none');
            const off = resolveTokens(
                { ...theme(), effects: { ...theme().effects, mesh: 'aurora' } },
                { effects: { mesh: null } }
            );
            expect(off['--c-fx-mesh-1']).toBe('none');
            const untouched = resolveTokens(
                { ...theme(), effects: { ...theme().effects, mesh: 'aurora' } },
                { effects: { mesh: undefined } }
            );
            expect(untouched['--c-fx-mesh-1']).not.toBe('none');
        });

        it('focus follows accent unless a theme pins it', () => {
            // editorialIvory pins focus — an accent override must NOT drag it along
            const pinned = resolveTokens(theme(), {
                palette: { accent: '#7c3aed' }
            });
            expect(pinned['--c-field-focus']).toBe('#0f766e');
            // a theme without pinned focus derives it from accent
            const derived = resolveTokens(
                { palette: { accent: '#7c3aed' } },
                null
            );
            expect(derived['--c-field-focus']).toBe('#7c3aed');
        });
    });

    describe('page image — the old-bug reel as string diffs', () => {
        const img = (fit) =>
            resolveTokens(theme(), {
                pageImage: { url: 'https://x/img.png', fit }
            });

        it('cover → size cover, no-repeat', () => {
            const t = img('cover');
            expect(t['--c-page-bg-image']).toBe('url("https://x/img.png")');
            expect(t['--c-page-bg-size']).toBe('cover');
            expect(t['--c-page-bg-repeat']).toBe('no-repeat');
        });

        it('contain → size contain, no-repeat', () => {
            const t = img('contain');
            expect(t['--c-page-bg-size']).toBe('contain');
            expect(t['--c-page-bg-repeat']).toBe('no-repeat');
        });

        it('tile → size auto, repeat', () => {
            const t = img('tile');
            expect(t['--c-page-bg-size']).toBe('auto');
            expect(t['--c-page-bg-repeat']).toBe('repeat');
        });

        it('fit switching NEVER touches the effects tokens (slot isolation)', () => {
            const withFx = (fit) =>
                resolveTokens(theme(), {
                    effects: { mesh: 'aurora', texture: 'dots' },
                    pageImage: { url: 'https://x/img.png', fit }
                });
            const cover = withFx('cover');
            const tile = withFx('tile');
            for (const k of [
                '--c-fx-mesh-1',
                '--c-fx-mesh-2',
                '--c-fx-mesh-3',
                '--c-fx-texture'
            ]) {
                expect(tile[k]).toBe(cover[k]);
            }
        });

        it('no image → none, but fit tokens still emitted (fixed slots)', () => {
            const t = resolveTokens(theme(), null);
            expect(t['--c-page-bg-image']).toBe('none');
            expect(t['--c-page-bg-size']).toBe('cover');
            expect(t['--c-page-bg-repeat']).toBe('no-repeat');
        });

        it('scrim: 0 → none; 40 → exactly one gradient layer', () => {
            const off = resolveTokens(theme(), null);
            expect(off['--c-page-scrim']).toBe('none');
            const on = resolveTokens(theme(), {
                pageImage: { url: 'https://x/i.png', scrim: 40 }
            });
            expect(on['--c-page-scrim']).toContain('linear-gradient');
            expect(on['--c-page-scrim'].match(/gradient\(/g)).toHaveLength(1);
        });
    });

    describe('effects — one token, one layer', () => {
        it('mesh off → all three fixed slots are none', () => {
            const t = resolveTokens(theme(), null);
            expect(t['--c-fx-mesh-1']).toBe('none');
            expect(t['--c-fx-mesh-2']).toBe('none');
            expect(t['--c-fx-mesh-3']).toBe('none');
        });

        it('every mesh slot resolves to at most ONE gradient layer', () => {
            const t = resolveTokens(theme(), { effects: { mesh: 'aurora' } });
            for (const k of ['--c-fx-mesh-1', '--c-fx-mesh-2', '--c-fx-mesh-3']) {
                expect(t[k].match(/gradient\(/g)).toHaveLength(1);
                expect(t[k]).not.toMatch(/\),\s*(radial|linear|conic)/);
            }
        });

        it('texture is a single self-tiling url() layer', () => {
            const t = resolveTokens(theme(), { effects: { texture: 'dots' } });
            expect(t['--c-fx-texture'].match(/url\(/g)).toHaveLength(1);
            const off = resolveTokens(theme(), null);
            expect(off['--c-fx-texture']).toBe('none');
        });

        it('unknown mesh/texture keys degrade to none, never crash', () => {
            const t = resolveTokens(theme(), {
                effects: { mesh: 'nope', texture: 'nope' }
            });
            expect(t['--c-fx-mesh-1']).toBe('none');
            expect(t['--c-fx-texture']).toBe('none');
        });

        it('glass toggles the blur token', () => {
            expect(resolveTokens(theme(), null)['--c-glass-blur']).toBe('0px');
            expect(
                resolveTokens(theme(), { effects: { glass: true } })[
                    '--c-glass-blur'
                ]
            ).toBe('14px');
        });

        it('shadow scale: none/soft/floating; unknown → none', () => {
            const s = (shadow) =>
                resolveTokens(theme(), { effects: { shadow } })[
                    '--c-content-shadow'
                ];
            expect(s('none')).toBe('none');
            expect(s('soft')).toContain('rgba');
            expect(s('floating')).toContain('rgba');
            expect(s('mystery')).toBe('none');
        });
    });

    describe('scales', () => {
        it('radius enum maps: sharp/soft/round/pill; unknown → soft', () => {
            const r = (radius) =>
                resolveTokens(theme(), { radius })['--c-radius'];
            expect(r('sharp')).toBe('0px');
            expect(r('soft')).toBe('8px');
            expect(r('round')).toBe('14px');
            expect(r('pill')).toBe('24px');
            expect(r('banana')).toBe('8px');
        });

        it('density resolves INTO space/control/pad tokens — no density token', () => {
            const comfy = resolveTokens(theme(), { density: 'comfortable' });
            const compact = resolveTokens(theme(), { density: 'compact' });
            expect(comfy['--c-density']).toBeUndefined();
            expect(comfy['--c-space-4']).toBe('16px');
            expect(compact['--c-space-4']).toBe('12px');
            expect(comfy['--c-control-h']).toBe('44px');
            expect(compact['--c-control-h']).toBe('36px');
            expect(comfy['--c-section-pad']).not.toBe(
                compact['--c-section-pad']
            );
        });

        it('border presets: none/hairline/bold; unknown → none', () => {
            const b = (border) =>
                resolveTokens(theme(), { border })['--c-content-border'];
            expect(b('none')).toBe('none');
            expect(b('hairline')).toMatch(/^1px solid /);
            expect(b('bold')).toMatch(/^2px solid /);
            expect(b('mystery')).toBe('none');
        });

        it('typography pairing; unknown → system', () => {
            const t = resolveTokens(theme(), null);
            expect(t['--c-font-display']).toContain('Georgia');
            const u = resolveTokens(theme(), { typography: 'nope' });
            expect(u['--c-font-display']).toContain('Segoe UI');
        });
    });

    describe('derived colors', () => {
        it('on-accent: white on dark accents, near-black on light ones', () => {
            expect(
                resolveTokens({ palette: { accent: '#0f766e' } }, null)[
                    '--c-on-accent'
                ]
            ).toBe('#ffffff');
            expect(
                resolveTokens({ palette: { accent: '#facc15' } }, null)[
                    '--c-on-accent'
                ]
            ).toBe('#111827');
        });

        it('explicit palette.onAccent wins over derivation', () => {
            const t = resolveTokens(
                { palette: { accent: '#facc15', onAccent: '#123456' } },
                null
            );
            expect(t['--c-on-accent']).toBe('#123456');
        });

        it('submit derives from accent unless pinned', () => {
            const t = resolveTokens(theme(), null);
            expect(t['--c-submit-bg']).toBe('#0f766e');
            expect(t['--c-submit-text']).toBe('#ffffff');
            const pinned = resolveTokens(theme(), {
                palette: { submitBg: '#000000', submitText: '#fefefe' }
            });
            expect(pinned['--c-submit-bg']).toBe('#000000');
            expect(pinned['--c-submit-text']).toBe('#fefefe');
        });

        it('focus ring is an rgba of the focus color', () => {
            const t = resolveTokens(theme(), null);
            expect(t['--c-focus-ring']).toMatch(/^0 0 0 3px rgba\(/);
        });

        it('header text falls back to body text; weak falls back to textWeak', () => {
            const t = resolveTokens({ palette: { text: '#101010' } }, null);
            expect(t['--c-header-text']).toBe('#101010');
            expect(t['--c-header-text-weak']).toBe(
                t['--c-text-weak']
            );
        });
    });

    describe('robustness & determinism', () => {
        it('same inputs → deep-equal output', () => {
            const a = resolveTokens(theme(), { radius: 'round' });
            const b = resolveTokens(theme(), { radius: 'round' });
            expect(a).toEqual(b);
        });

        it('unknown top-level keys are ignored (forward compat)', () => {
            const t = resolveTokens(
                { ...theme(), futureThing: { x: 1 } },
                { anotherFuture: true }
            );
            expect(Object.keys(t).sort()).toEqual([...CONTRACT_V1].sort());
        });

        it('full-theme snapshot — any change here is a deliberate contract event', () => {
            expect(resolveTokens(theme(), null)).toMatchSnapshot();
        });

        it('ENGINE_VERSION is pinned', () => {
            expect(ENGINE_VERSION).toBe(1);
        });

        it('tokensToStyle joins pairs for the single application point', () => {
            expect(tokensToStyle({ '--c-a': '1px', '--c-b': 'red' })).toBe(
                '--c-a: 1px; --c-b: red'
            );
            expect(tokensToStyle(null)).toBe('');
        });
    });
});

describe('c-final-theme-catalog', () => {
    it('returns a defensive copy — mutating it cannot poison the catalog', () => {
        const a = getBuiltinTheme('editorialIvory');
        a.palette.accent = '#bad';
        expect(getBuiltinTheme('editorialIvory').palette.accent).toBe(
            '#0f766e'
        );
    });

    it('unknown key → null', () => {
        expect(getBuiltinTheme('nope')).toBeNull();
    });

    it('listing exposes key/name/tags only — never recipes', () => {
        const list = listBuiltinThemes();
        expect(list).toEqual([
            {
                key: 'editorialIvory',
                name: 'Editorial Ivory',
                tags: ['light', 'editorial']
            }
        ]);
        expect(list[0].palette).toBeUndefined();
    });
});

describe('c-final-layout-registry', () => {
    it('scroll row carries the §2.2 metadata', () => {
        expect(LAYOUTS.scroll.multiPage).toBe(false);
        expect(LAYOUTS.scroll.gating).toBe(false);
        expect(typeof LAYOUTS.scroll.load).toBe('function');
    });

    it('unknown layout type falls back to scroll', () => {
        expect(getLayout('hologram')).toBe(LAYOUTS.scroll);
        expect(getLayout(undefined)).toBe(LAYOUTS.scroll);
    });
});
