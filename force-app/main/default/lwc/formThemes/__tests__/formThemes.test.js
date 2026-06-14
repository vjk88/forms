/**
 * T6 regression: Theme Spec v2 keys must NOT change any v1 token value for
 * existing skins (acceptance: PHASE1_WORKPLAN §3 T6).
 */
import {
    themeVars, LAYOUT_TEMPLATES, THEMES, SKINS, THEME_OPTIONS,
    skinsForTheme, resolveTheme, colorRamp, contrastRatio, validatePalette
} from 'c/formThemes';

// Every token the v1 themeVars() emitted (pre-v2 contract).
const V1_TOKENS = [
    '--c-font-body', '--c-font-display', '--c-accent', '--c-brand',
    '--c-brand-dark', '--c-radius', '--c-radius-card', '--c-submit-bg',
    '--c-back-color', '--c-card-bg', '--c-card-border', '--c-card-shadow',
    '--c-page-bg', '--c-section-style', '--c-section-header-bg',
    '--c-section-padding', '--c-header-style'
];

function tokenMap(str) {
    const map = {};
    str.split(/;\s?(?=--)/).forEach((pair) => {
        const i = pair.indexOf(':');
        if (i > 0) map[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    });
    return map;
}

const pick = (map, keys) => Object.fromEntries(keys.map((k) => [k, map[k]]));

describe('c-form-themes themeVars v2', () => {
    Object.keys(LAYOUT_TEMPLATES).forEach((name) => {
        it(`keeps every v1 token value unchanged for the "${name}" skin`, () => {
            const skin = LAYOUT_TEMPLATES[name];
            const base = tokenMap(themeVars(skin));
            // v1 expectations derive straight from the skin object.
            expect(base['--c-accent']).toBe(skin.accent);
            expect(base['--c-submit-bg']).toBe(skin.accent);
            expect(base['--c-page-bg']).toBe(skin.pageBg);
            expect(base['--c-section-style']).toBe(skin.sectionDefault);
            V1_TOKENS.forEach((tok) => expect(base[tok]).toBeDefined());

            // Adding every v2 key must leave all v1 values identical.
            const loaded = tokenMap(
                themeVars(
                    {
                        ...skin,
                        inputStyle: 'underline', inputDisplayFont: true,
                        labelStyle: 'mono-caps', labelPosition: 'left',
                        controlScale: 1.25, texture: 'grid',
                        bgEffect: 'mesh', titleStyle: 'gradient', panelDecor: 'frame'
                    },
                    'compact'
                )
            );
            expect(pick(loaded, V1_TOKENS)).toEqual(pick(base, V1_TOKENS));
        });
    });

    it('emits v1-equivalent v2 defaults for a bare v1 skin', () => {
        const m = tokenMap(themeVars(LAYOUT_TEMPLATES.classic));
        expect(m['--c-space-4']).toBe('16px'); // matches old hardcoded fallbacks
        expect(m['--c-control-h']).toBe('40px');
        expect(m['--c-input-border']).toBe('1.5px solid var(--c-border, #d8dde6)');
        expect(m['--c-input-font']).toBe('var(--c-font-body)');
        expect(m['--c-label-transform']).toBe('none');
        expect(m['--c-texture']).toBe('none');
        expect(m['--c-title-fill']).toBe('var(--c-text, #16325c)');
        expect(m['--c-label-col']).toBeUndefined();
        expect(m['--c-mesh-1']).toBeUndefined();
        expect(m['--c-panel-decor-color']).toBeUndefined();
        expect(m['--c-dur-1']).toBe('150ms');
    });

    it('maps the v2 keys to their tokens', () => {
        const m = tokenMap(
            themeVars(
                {
                    ...LAYOUT_TEMPLATES.classic,
                    inputStyle: 'filled', labelStyle: 'muted-sm', labelPosition: 'left',
                    controlScale: 1.5, texture: 'grain', bgEffect: 'mesh',
                    meshHues: ['#111111'], titleStyle: 'gradient', panelDecor: 'frame'
                },
                'compact'
            )
        );
        expect(m['--c-space-4']).toBe('12px'); // compact scale
        expect(m['--c-control-h']).toBe('48px'); // 32 × 1.5
        expect(m['--c-tap-min']).toBe('66px');
        expect(m['--c-input-bg']).toBe('var(--c-surface-sunken, #f3f3f6)');
        expect(m['--c-label-size']).toBe('0.75rem');
        expect(m['--c-label-col']).toBe('160px');
        expect(m['--c-texture']).toContain('data:image/svg+xml');
        expect(m['--c-mesh-1']).toBe('#111111');
        expect(m['--c-mesh-2']).toBe('#7a5cff'); // default fills the gap
        // titleStyle:'gradient' is ignored — title fill stays solid (no gradient text).
        expect(m['--c-title-fill']).toBe('var(--c-text, #16325c)');
        expect(m['--c-panel-decor-color']).toContain('color-mix');
    });

    it('clamps controlScale to 1–1.5 and ignores junk', () => {
        const big = tokenMap(themeVars({ controlScale: 9 }));
        const junk = tokenMap(themeVars({ controlScale: 'huge' }));
        expect(big['--c-control-h']).toBe('60px'); // 40 × 1.5 cap
        expect(junk['--c-control-h']).toBe('40px');
    });
});

describe('c-form-themes Theme → Skin → Accent model (v2)', () => {
    it('ships 7 themes, each with ≥2 skins and a valid defaultSkin', () => {
        expect(Object.keys(THEMES)).toHaveLength(7);
        expect(THEME_OPTIONS).toHaveLength(7);
        Object.keys(THEMES).forEach((id) => {
            const skins = SKINS[id];
            expect(Object.keys(skins).length).toBeGreaterThanOrEqual(2);
            expect(skins[THEMES[id].defaultSkin]).toBeDefined();
            expect(skinsForTheme(id).length).toBe(Object.keys(skins).length);
        });
    });

    it('resolves theme structure + skin mood into one merged object', () => {
        const m = resolveTheme('lightning', 'light');
        // structural keys come from the theme
        expect(m.font).toBe('salesforce');
        expect(m.radius).toBe('slds');
        expect(m.sectionDefault).toBe('card');
        // mood/color keys come from the skin
        expect(m.accent).toBe('#0176d3');
        expect(m.pageBg).toBe('#f3f3f3');
        expect(m.borderColor).toBe('#dddbda');
        // provenance recorded, dropdown label stripped
        expect(m.theme).toBe('lightning');
        expect(m.skin).toBe('light');
        expect(m.label).toBeUndefined();
    });

    it('falls back to Cloud / the default skin for unknown ids', () => {
        const bad = resolveTheme('nope', 'nope');
        const cloud = resolveTheme('cloud', 'light');
        expect(bad.font).toBe(cloud.font); // cloud structure
        expect(resolveTheme('midnight', 'nope').skin).toBe('noir'); // theme default
    });

    it('applies accent + overrides in the right order (lowest scope wins)', () => {
        const m = resolveTheme('cloud', 'light', {
            accent: '#ff0000',
            overrides: { radius: 'pill', accent: '#00ff00' }
        });
        expect(m.radius).toBe('pill'); // override beats theme structure
        expect(m.accent).toBe('#00ff00'); // override beats the accent knob
    });

    it('emits the same tokens via the v2 signature as the resolved object', () => {
        const viaIds = tokenMap(themeVars('cloud', 'light'));
        const viaObj = tokenMap(themeVars(resolveTheme('cloud', 'light')));
        expect(viaIds).toEqual(viaObj);
        expect(viaIds['--c-accent']).toBe('#0176d3');
    });

    it('honors the density arg in the 4th position (v2 signature)', () => {
        const comfy = tokenMap(themeVars('cloud', 'light', {}, 'comfortable'));
        const compact = tokenMap(themeVars('cloud', 'light', {}, 'compact'));
        expect(comfy['--c-space-4']).toBe('16px');
        expect(compact['--c-space-4']).toBe('12px');
    });

    it('back-compat: legacy object signature still works unchanged', () => {
        const legacy = tokenMap(themeVars(LAYOUT_TEMPLATES.classic, 'compact'));
        expect(legacy['--c-accent']).toBe(LAYOUT_TEMPLATES.classic.accent);
        expect(legacy['--c-space-4']).toBe('12px'); // density still 2nd arg
    });

    it('dark skins flip the chrome text tokens', () => {
        const dark = tokenMap(themeVars('midnight', 'noir'));
        expect(dark['--c-text']).toBe('#f3f0ff');
        expect(dark['--c-mesh-1']).toBe('#7a5cff');
    });
});

describe('c-form-themes four-lane palette + OKLCH ramps (T3.2)', () => {
    const HEX = /^#[0-9a-f]{6}$/i;

    it('builds a 10-step ramp, light → dark, all valid hex', () => {
        const ramp = colorRamp('#4f46e5');
        expect(ramp).toHaveLength(10);
        ramp.forEach((c) => expect(c).toMatch(HEX));
        // monotonically darkening (luminance via contrast vs white grows)
        const lum = ramp.map((c) => contrastRatio(c, '#ffffff'));
        for (let i = 1; i < lum.length; i++) {
            expect(lum[i]).toBeGreaterThan(lum[i - 1]);
        }
    });

    it('returns symmetric ratio and white/black extremes (~21:1)', () => {
        expect(+contrastRatio('#000000', '#ffffff').toFixed(0)).toBe(21);
        expect(contrastRatio('#123456', '#abcdef')).toBe(
            contrastRatio('#abcdef', '#123456')
        );
    });

    it('Primary drives accent/buttons; Neutral drives text + default bg', () => {
        const palette = {
            primary: '#8069bf', secondary: '#7c7296',
            tertiary: '#c9a74d', neutral: '#79767d'
        };
        const m = tokenMap(themeVars('cloud', 'light', { palette }));
        expect(m['--c-accent']).toBe('#8069bf');
        expect(m['--c-submit-bg']).toBe('#8069bf');
        expect(m['--c-secondary']).toBe('#7c7296');
        expect(m['--c-tertiary']).toBe('#c9a74d');
        // neutral seeds text + surface tokens
        expect(m['--c-text']).toMatch(HEX);
        expect(m['--c-page-bg']).toMatch(HEX);
        expect(m['--c-surface-sunken']).toMatch(HEX);
        // neutral-derived body text must be readable on the seeded surface
        expect(contrastRatio(m['--c-text'], m['--c-card-bg'])).toBeGreaterThan(4.5);
    });

    it('a §3.2 surface override still beats the neutral-seeded default', () => {
        const m = tokenMap(
            themeVars('cloud', 'light', {
                palette: { neutral: '#79767d' },
                overrides: { pageBg: '#ff0000' }
            })
        );
        expect(m['--c-page-bg']).toBe('#ff0000');
    });

    it('validatePalette flags an unreadable kit and passes a good one', () => {
        expect(validatePalette({ primary: '#1d4ed8', neutral: '#71717a' }).ok).toBe(true);
        const bad = validatePalette({ primary: '#fde047', neutral: '#fafafa' });
        expect(bad.ok).toBe(false);
        expect(bad.warnings.length).toBeGreaterThan(0);
    });

    it('no palette = no role tokens (preset skins unaffected)', () => {
        const m = tokenMap(themeVars('cloud', 'light'));
        expect(m['--c-secondary']).toBeUndefined();
        expect(m['--c-tertiary']).toBeUndefined();
    });
});
