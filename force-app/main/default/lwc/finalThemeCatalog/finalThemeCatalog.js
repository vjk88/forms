/**
 * finalThemeCatalog — L4 built-in theme data (ARCHITECTURE_LAYOUTS_THEMES §4).
 *
 * Data only: theme-property objects (§4.1 shape). Zero CSS, zero component knowledge —
 * the engine owns translation to tokens. Lives in MANAGED code so built-in recipes are
 * not browsable in a subscriber org (§4.2, decision closed 2026-07-03). Loaded by
 * BUILDER components only — the published/guest runtime uses the spec's `resolved`
 * token snapshot and never imports this module (resolve-at-publish).
 *
 * Roster source: theme-comparison.html (owner-curated; formStudio's set, cleaned).
 * Colours map raw; radius/shadow/border quantize onto the engine's named scales (§3.3).
 * `layout` = affinity metadata (classic|stepped|split) — drives gallery preview + a
 * suggested-layout default; NEVER forces a layout (themes stay decoupled, §0). Fonts are
 * `system` for now (owner: SF-native; fonts revisited later). Page/split images come from
 * the `formThemeAssets` static resource (guest-safe). Split themes paint their brand pane
 * via `palette.headerBg` (finalNavSplitHero consumes --c-header-bg when unconfigured).
 */
import { resolveTokens, ENGINE_VERSION } from 'c/finalThemeEngine';

const THEMES = {
    editorialIvory: {
        name: 'Editorial Ivory',
        tags: ['light', 'editorial'],
        layout: 'classic',
        palette: {
            accent: '#0f766e',
            pageBg: '#f6f4ee',
            contentBg: '#fffdf8',
            text: '#232019',
            textWeak: '#6f6a5e',
            headerBg: 'transparent',
            headerText: '#232019',
            headerTextWeak: '#6f6a5e',
            borderColor: '#dcdad4'
        },
        typography: 'editorial',
        radius: 'soft',
        border: 'hairline',
        density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null },
        fieldStates: { focus: '#0f766e', error: '#b42318', required: '#b42318' }
    },

    // ---- Classic family -----------------------------------------------------
    nordic: {
        name: 'Nordic Minimalist',
        tags: ['light', 'minimalist'],
        layout: 'classic',
        palette: {
            accent: '#1e3a8a', onAccent: '#ffffff', pageBg: '#f3f4f6', contentBg: '#ffffff',
            text: '#1f2937', textWeak: '#6b7280', headerBg: 'transparent', borderColor: '#d1d5db'
        },
        typography: 'system', radius: 'soft', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    neoBrutalism: {
        name: 'Neo-Brutalism',
        tags: ['light', 'creative'],
        layout: 'classic',
        palette: {
            accent: '#d946ef', onAccent: '#ffffff', pageBg: '#fef08a', contentBg: '#ffffff',
            text: '#000000', textWeak: '#4b5563', headerBg: 'transparent', borderColor: '#000000'
        },
        typography: 'system', radius: 'sharp', border: 'bold', density: 'comfortable',
        effects: { shadow: 'brutal', glass: false, texture: null, mesh: null }
    },

    dracula: {
        name: 'Dracula Dark',
        tags: ['dark', 'creative'],
        layout: 'classic',
        palette: {
            accent: '#ff79c6', onAccent: '#1e1f29', pageBg: '#1e1f29', contentBg: '#282a36',
            text: '#f8f8f2', textWeak: '#6272a4', headerBg: 'transparent', borderColor: '#44475a'
        },
        typography: 'system', radius: 'soft', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: false, texture: null, mesh: null }
    },

    terracotta: {
        name: 'Warm Terracotta',
        tags: ['light', 'editorial'],
        layout: 'classic',
        palette: {
            accent: '#c2410c', onAccent: '#ffffff', pageBg: '#faf7f2', contentBg: '#ffffff',
            text: '#27272a', textWeak: '#71717a', headerBg: 'transparent', borderColor: '#d4d4d8'
        },
        typography: 'system', radius: 'xs', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    forest: {
        name: 'Forest Moss',
        tags: ['light', 'minimalist'],
        layout: 'classic',
        palette: {
            accent: '#14532d', onAccent: '#ffffff', pageBg: '#f4f7f5', contentBg: '#ffffff',
            text: '#1e293b', textWeak: '#64748b', headerBg: 'transparent', borderColor: '#cbd5e1'
        },
        typography: 'system', radius: 'md', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    slate: {
        name: 'Steel Slate',
        tags: ['light', 'minimalist'],
        layout: 'classic',
        palette: {
            accent: '#0f172a', onAccent: '#ffffff', pageBg: '#f1f5f9', contentBg: '#ffffff',
            text: '#334155', textWeak: '#64748b', headerBg: 'transparent', borderColor: '#cbd5e1'
        },
        typography: 'system', radius: 'soft', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    tokyo: {
        name: 'Tokyo Midnight',
        tags: ['dark', 'creative'],
        layout: 'classic',
        palette: {
            accent: '#06b6d4', onAccent: '#0c0f1d', pageBg: '#0c0f1d', contentBg: '#161b33',
            text: '#e2e8f0', textWeak: '#64748b', headerBg: 'transparent', borderColor: '#1e293b'
        },
        typography: 'system', radius: 'xs', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: false, texture: null, mesh: null }
    },

    sandstone: {
        name: 'Sandstone & Copper',
        tags: ['light', 'editorial'],
        layout: 'classic',
        palette: {
            accent: '#7c2d12', onAccent: '#ffffff', pageBg: '#f5e0d3', contentBg: '#fffdfa',
            text: '#3c1508', textWeak: '#8c6250', headerBg: 'transparent', borderColor: '#e7d5c7'
        },
        typography: 'system', radius: 'round', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    terminal: {
        name: 'Retro Terminal',
        tags: ['dark', 'minimalist'],
        layout: 'classic',
        palette: {
            accent: '#22c55e', onAccent: '#000000', pageBg: '#000000', contentBg: '#000000',
            text: '#22c55e', textWeak: '#15803d', headerBg: 'transparent', borderColor: '#22c55e'
        },
        typography: 'system', radius: 'sharp', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'none', glass: false, texture: null, mesh: null }
    },

    lavender: {
        name: 'Lavender Mist',
        tags: ['light', 'creative'],
        layout: 'classic',
        palette: {
            accent: '#7e22ce', onAccent: '#ffffff', pageBg: '#f3e8ff', contentBg: '#ffffff',
            text: '#3b0764', textWeak: '#7b3a9c', headerBg: 'transparent', borderColor: '#e9d5ff'
        },
        typography: 'system', radius: 'lg', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'medium', glass: false, texture: null, mesh: null }
    },

    execNav: {
        name: 'Steel Side-Nav',
        tags: ['light', 'minimalist'],
        layout: 'classic',
        palette: {
            accent: '#1e40af', onAccent: '#ffffff', pageBg: '#f1f5f9', contentBg: '#ffffff',
            text: '#0f172a', textWeak: '#475569', headerBg: 'transparent', borderColor: '#cbd5e1'
        },
        typography: 'system', radius: 'soft', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    startupNav: {
        name: 'Tech Startup Nav',
        tags: ['light', 'minimalist'],
        layout: 'classic',
        palette: {
            accent: '#4f46e5', onAccent: '#ffffff', pageBg: '#f8fafc', contentBg: '#ffffff',
            text: '#0f172a', textWeak: '#64748b', headerBg: 'transparent', borderColor: '#e2e8f0'
        },
        typography: 'system', radius: 'md', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'medium', glass: false, texture: null, mesh: null }
    },

    // ---- Stepper family -----------------------------------------------------
    mintStepper: {
        name: 'Neo-Mint Stepper',
        tags: ['dark', 'stepped', 'minimalist'],
        layout: 'stepped',
        palette: {
            accent: '#10b981', onAccent: '#111827', pageBg: '#111827', contentBg: '#1f2937',
            text: '#f9fafc', textWeak: '#9ca3af', headerBg: 'transparent', borderColor: '#374151'
        },
        typography: 'system', radius: 'soft', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: false, texture: null, mesh: null }
    },

    retroStepper: {
        name: 'Amber Terminal Stepper',
        tags: ['dark', 'stepped', 'creative'],
        layout: 'stepped',
        palette: {
            accent: '#f97316', onAccent: '#0c0703', pageBg: '#0c0703', contentBg: '#1a0e05',
            text: '#fb923c', textWeak: '#c2410c', headerBg: 'transparent', borderColor: '#ea580c'
        },
        typography: 'system', radius: 'sharp', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'none', glass: false, texture: null, mesh: null }
    },

    snowStepper: {
        name: 'Nordic Snow Stepper',
        tags: ['light', 'stepped', 'minimalist'],
        layout: 'stepped',
        palette: {
            accent: '#3b82f6', onAccent: '#ffffff', pageBg: '#f0f4f8', contentBg: '#ffffff',
            text: '#1e293b', textWeak: '#64748b', headerBg: 'transparent', borderColor: '#cbd5e1'
        },
        typography: 'system', radius: 'lg', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    // ---- Split-hero family (pane painted via headerBg) ----------------------
    marbleSplit: {
        name: 'Marble Split-Hero',
        tags: ['light', 'split', 'creative', 'bgimage'],
        layout: 'split',
        palette: {
            accent: '#d97706', onAccent: '#ffffff', pageBg: '#fafaf9', contentBg: '#ffffff',
            text: '#1c1917', textWeak: '#78716c',
            headerBg: "url('/resource/formThemeAssets/marble.jpg') center/cover no-repeat",
            headerText: '#1c1917', headerTextWeak: '#78716c', borderColor: '#e7e5e4'
        },
        typography: 'system', radius: 'xs', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'medium', glass: false, texture: null, mesh: null }
    },

    cyberSplit: {
        name: 'Cyber Midnight Split-Hero',
        tags: ['dark', 'split', 'creative', 'bgimage'],
        layout: 'split',
        palette: {
            accent: '#ec4899', onAccent: '#ffffff', pageBg: '#09090b', contentBg: '#18181b',
            text: '#fafafa', textWeak: '#a1a1aa',
            headerBg: "url('/resource/formThemeAssets/tech.jpg') center/cover no-repeat",
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.7)', borderColor: '#27272a'
        },
        typography: 'system', radius: 'xs', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: false, texture: null, mesh: null }
    },

    claySplit: {
        name: 'Terracotta Split-Hero',
        tags: ['light', 'split', 'editorial', 'bgimage'],
        layout: 'split',
        palette: {
            accent: '#c2410c', onAccent: '#ffffff', pageBg: '#fdfbf7', contentBg: '#ffffff',
            text: '#292524', textWeak: '#78716c',
            headerBg: "url('/resource/formThemeAssets/desert.jpg') center/cover no-repeat",
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.85)', borderColor: '#e7d5c7'
        },
        typography: 'system', radius: 'soft', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null }
    },

    botanicalSplit: {
        name: 'Botanical Split-Hero',
        tags: ['light', 'split', 'minimalist', 'bgimage'],
        layout: 'split',
        palette: {
            accent: '#15803d', onAccent: '#ffffff', pageBg: '#f4f7f5', contentBg: '#ffffff',
            text: '#1e293b', textWeak: '#64748b',
            headerBg: "url('/resource/formThemeAssets/forest.jpg') center/cover no-repeat",
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.85)', borderColor: '#e2e8f0'
        },
        typography: 'system', radius: 'md', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'medium', glass: false, texture: null, mesh: null }
    },

    auraSplit: {
        name: 'Bioluminescent Split',
        tags: ['dark', 'split', 'creative'],
        layout: 'split',
        palette: {
            accent: '#2dd4bf', onAccent: '#090d16', pageBg: '#090d16', contentBg: 'rgba(255, 255, 255, 0.08)',
            text: '#f8fafc', textWeak: '#a1a1aa',
            headerBg: 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(255, 255, 255, 0.15)'
        },
        typography: 'system', radius: 'lg', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: true, texture: null, mesh: null }
    },

    // ---- Background-image showcase (page image + frosted glass) --------------
    sunsetDunes: {
        name: 'Sunset Dunes',
        tags: ['light', 'creative', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#f97316', onAccent: '#ffffff', pageBg: '#e8a87c', contentBg: 'rgba(255, 255, 255, 0.78)',
            text: '#27272a', textWeak: '#52525b',
            headerBg: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(255, 255, 255, 0.3)'
        },
        typography: 'system', radius: 'lg', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/sunset.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    forestMist: {
        name: 'Forest Mist',
        tags: ['light', 'editorial', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#15803d', onAccent: '#ffffff', pageBg: '#8ba99b', contentBg: 'rgba(255, 255, 255, 0.85)',
            text: '#1e293b', textWeak: '#475569',
            headerBg: 'linear-gradient(to right, #052e16 0%, #15803d 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(255, 255, 255, 0.3)'
        },
        typography: 'system', radius: 'md', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/forest.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    marbleLuxury: {
        name: 'Marble Luxury',
        tags: ['light', 'creative', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#18181b', onAccent: '#ffffff', pageBg: '#e8e6e3', contentBg: '#ffffff',
            text: '#18181b', textWeak: '#71717a',
            headerBg: "url('/resource/formThemeAssets/wood.jpg') center/cover no-repeat",
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.9)', borderColor: '#e4e4e7'
        },
        typography: 'system', radius: 'xs', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'medium', glass: false, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/marble.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    carbonMatrix: {
        name: 'Carbon Matrix',
        tags: ['dark', 'creative', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#22c55e', onAccent: '#0f172a', pageBg: '#0a0f18', contentBg: 'rgba(15, 23, 42, 0.88)',
            text: '#f8fafc', textWeak: '#94a3b8',
            headerBg: 'linear-gradient(to right, #090d16 0%, #0f172a 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.7)', borderColor: 'rgba(255, 255, 255, 0.15)'
        },
        typography: 'system', radius: 'xs', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/tech.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    oceanBreeze: {
        name: 'Ocean Breeze',
        tags: ['light', 'creative', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#06b6d4', onAccent: '#ffffff', pageBg: '#7ec8d8', contentBg: 'rgba(255, 255, 255, 0.72)',
            text: '#0e7490', textWeak: '#4b5563',
            headerBg: 'linear-gradient(135deg, #0891b2 0%, #0d9488 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(255, 255, 255, 0.35)'
        },
        typography: 'system', radius: 'xl', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/ocean.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    cosmicVortex: {
        name: 'Cosmic Vortex',
        tags: ['dark', 'creative', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#a855f7', onAccent: '#ffffff', pageBg: '#1a0f2e', contentBg: 'rgba(15, 10, 30, 0.8)',
            text: '#f3e8ff', textWeak: '#c084fc',
            headerBg: 'linear-gradient(135deg, #7c3aed 0%, #c084fc 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.7)', borderColor: 'rgba(255, 255, 255, 0.15)'
        },
        typography: 'system', radius: 'lg', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/nebula.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    desertOasis: {
        name: 'Desert Oasis',
        tags: ['light', 'editorial', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#ea580c', onAccent: '#ffffff', pageBg: '#d99b6c', contentBg: 'rgba(253, 251, 247, 0.85)',
            text: '#3f2b18', textWeak: '#7c5f43',
            headerBg: 'linear-gradient(to right, #ea580c 0%, #c2410c 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(255, 255, 255, 0.25)'
        },
        typography: 'system', radius: 'md', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'medium', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/desert.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    vintagePaper: {
        name: 'Vintage Paper',
        tags: ['light', 'minimalist', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#4b5563', onAccent: '#ffffff', pageBg: '#e8e2d5', contentBg: 'rgba(255, 253, 247, 0.95)',
            text: '#1c1917', textWeak: '#44403c', headerBg: 'transparent',
            headerText: '#1c1917', headerTextWeak: '#78716c', borderColor: '#78716c'
        },
        typography: 'system', radius: 'sharp', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'soft', glass: false, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/paper.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    auroraBorealis: {
        name: 'Northern Lights',
        tags: ['dark', 'creative', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#2dd4bf', onAccent: '#041d1a', pageBg: '#0a1518', contentBg: 'rgba(15, 23, 25, 0.85)',
            text: '#ccfbf1', textWeak: '#14b8a6',
            headerBg: 'linear-gradient(to right, #041b18 0%, #155e54 100%)',
            headerText: '#ffffff', headerTextWeak: 'rgba(255, 255, 255, 0.8)', borderColor: 'rgba(255, 255, 255, 0.15)'
        },
        typography: 'system', radius: 'md', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'floating', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/aurora.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    silkLuxury: {
        name: 'Silk Luxury',
        tags: ['light', 'creative', 'bgimage'],
        layout: 'classic',
        palette: {
            accent: '#db2777', onAccent: '#ffffff', pageBg: '#f5d5e0', contentBg: 'rgba(255, 255, 255, 0.85)',
            text: '#4c0519', textWeak: '#be185d',
            headerBg: 'linear-gradient(135deg, #fbcfe8 0%, #f472b6 100%)',
            headerText: '#4c0519', headerTextWeak: '#9d174d', borderColor: 'rgba(255, 255, 255, 0.4)'
        },
        typography: 'system', radius: 'lg', border: 'hairline', density: 'comfortable',
        effects: { shadow: 'medium', glass: true, texture: null, mesh: null },
        pageImage: { url: '/resource/formThemeAssets/silk.jpg', fit: 'cover', position: 'center', scrim: 0 }
    },

    // Pixel port of design-explorations/04-glass-event-registration.html
    // (owner 2026-07-08). Exercises the full immersive stack: 4-blob animated
    // screen-blend mesh, grain, 26px glass, gradient title ink, gradient+glow
    // CTA, caps labels, pill card over round inputs.
    neonNights: {
        name: 'Neon Nights',
        tags: ['dark', 'creative'],
        layout: 'classic',
        palette: {
            accent: '#ff2e93', onAccent: '#ffffff', pageBg: '#08060f',
            contentBg: 'rgba(255, 255, 255, 0.08)',
            text: '#f3f0ff', textWeak: '#b9b4d6',
            headerBg: 'transparent', headerText: '#ffffff', headerTextWeak: '#b9b4d6',
            headerTitleGradient: { angle: 100, stops: ['#ffffff', '#d9ccff 60%', '#16e0c4'] },
            borderColor: 'rgba(255, 255, 255, 0.22)',
            fieldBorderColor: 'rgba(255, 255, 255, 0.22)',
            submitBg: '#16e0c4', submitText: '#0a0612',
            submitBgGradient: { type: 'linear', angle: 100, start: '#16e0c4', end: '#7af6e0' },
            submitGlow: true
        },
        typography: 'geometric',
        fieldStyle: 'outline', fieldRadius: 'round', labelStyle: 'caps',
        radius: 'pill', border: 'hairline', density: 'comfortable',
        pageRadius: 'xl',
        effects: {
            shadow: 'deep', glass: 26,
            texture: 'grain', textureIntensity: 'subtle',
            mesh: 'neon', meshIntensity: 'subtle',
            meshAnimate: true, meshBlend: 'screen', meshBlur: 60
        },
        fieldStates: { focus: '#ff2e93', error: '#ff5470', required: '#ff2e93' }
    }
};

/** Catalog key → theme-property object (a defensive copy), or null when unknown. */
export function getBuiltinTheme(key) {
    const theme = THEMES[key];
    return theme ? JSON.parse(JSON.stringify(theme)) : null;
}

/** Gallery listing: [{ key, name, tags, layout }] — never the recipes themselves. */
export function listBuiltinThemes() {
    return Object.entries(THEMES).map(([key, t]) => ({
        key,
        name: t.name,
        tags: [...t.tags],
        layout: t.layout || 'classic'
    }));
}

// Sample brand copy per theme — the personality lines every preview surface
// (theme cards, the creation flow's live sample form) shares. Matches the
// theme-comparison.html identities; unknown keys get the generic lockup.
const BRAND_COPY = {
    editorialIvory: { title: 'The Gazette', subtitle: 'Subscribe to our weekly print edition.' },
    neonNights: { title: 'Neon Nights 2026', subtitle: 'An after-hours showcase of light, sound & code.' },
    nordic: { title: 'Pre-Flight Manifest', subtitle: 'Verify passenger and crew credentials.' },
    neoBrutalism: { title: 'Creator Application', subtitle: 'Apply for the early access program.' },
    dracula: { title: 'Central Core Uplink', subtitle: 'Authorize security token to sync.' },
    terracotta: { title: 'Workshop Registry', subtitle: 'Join our pottery classes in Austin.' },
    forest: { title: 'Ranger Application', subtitle: 'Register for conservation patrols.' },
    slate: { title: 'Customs Declaration', subtitle: 'Declare global freight manifests.' },
    tokyo: { title: 'Node Connection', subtitle: 'Enter credentials for terminal 4-G.' },
    sandstone: { title: 'Guest Concierge', subtitle: 'Submit preferences for your stay.' },
    terminal: { title: 'SYSOP Authentication', subtitle: 'INPUT SECURE TOKENS FOR ACCESS.' },
    lavender: { title: 'Patient Admittance', subtitle: 'Provide medical information.' },
    execNav: { title: 'Corporate Onboarding', subtitle: 'Complete compliance checklists.' },
    startupNav: { title: 'API Key Generation', subtitle: 'Generate production credentials.' },
    mintStepper: { title: 'Developer Setup', subtitle: 'Initialize environment parameters.' },
    retroStepper: { title: 'Bootloader Wizard', subtitle: 'Mounting virtual system image.' },
    snowStepper: { title: 'Flight Check-in', subtitle: 'Confirm seat assignments.' },
    marbleSplit: { title: 'VIP Lounge Sign-in', subtitle: 'Enter the luxury rewards portal.' },
    cyberSplit: { title: 'Infiltration Gate', subtitle: 'Establishing remote SSH session.' },
    claySplit: { title: 'Artisan Membership', subtitle: 'Receive special discounts and invites.' },
    botanicalSplit: { title: 'Forest Preservation', subtitle: 'Join our carbon offsets program.' },
    auraSplit: { title: 'Artist Portfolio', subtitle: 'Upload your creative submissions.' },
    sunsetDunes: { title: 'Desert Expedition', subtitle: 'Book a luxury guided safari.' },
    forestMist: { title: 'Retreat Enrollment', subtitle: 'Escape to our off-grid cabins.' },
    marbleLuxury: { title: 'Exhibition RSVP', subtitle: 'Reserve private viewing passes.' },
    carbonMatrix: { title: 'Threat Assessment', subtitle: 'File an infrastructure hazard report.' },
    oceanBreeze: { title: 'Dive Charter Signup', subtitle: 'Confirm rental and experience level.' },
    cosmicVortex: { title: 'Telescope Booking', subtitle: 'Reserve time on deep-space optics.' },
    desertOasis: { title: 'Booking Request', subtitle: 'Check availability for canvas tents.' },
    vintagePaper: { title: 'Literary Submission', subtitle: 'Send poems or short stories.' },
    auroraBorealis: { title: 'Expedition Registry', subtitle: 'Register scientific equipment.' },
    silkLuxury: { title: 'Atelier Booking', subtitle: 'Schedule a custom fitting.' }
};

/** Brand personality lockup for a theme key — always returns { title, subtitle }. */
export function getBrandCopy(key) {
    return (
        BRAND_COPY[key] || {
            title: 'Registration',
            subtitle: 'Tell us a little about yourself.'
        }
    );
}

/**
 * Resolve-at-publish (ARCH §5, BUILD_PHASES P2): compile a draft spec into
 * its publishable form by snapshotting the full token map into
 * `spec.resolved`. The published render then reads tokens directly and NEVER
 * imports this catalog — publishing is the only moment theme recipes and the
 * spec meet. Pure function: returns a new spec, input untouched.
 */
export function resolveSpecForPublish(spec, customThemeProps) {
    if (!spec || spec.specVersion !== 1) {
        throw new Error('resolveSpecForPublish: unsupported spec');
    }
    const out = JSON.parse(JSON.stringify(spec));
    let theme = null;
    if (out.theme && out.theme.source === 'builtin') {
        theme = getBuiltinTheme(out.theme.name);
    } else if (out.theme && out.theme.source === 'custom') {
        // the caller fetches the Theme_Definition__c JSON first — publishing
        // silently without the recipe would snapshot the wrong tokens
        if (!customThemeProps) {
            throw new Error(
                'resolveSpecForPublish: custom theme properties required'
            );
        }
        theme = customThemeProps;
    }
    out.resolved = {
        tokens: resolveTokens(theme, out.theme ? out.theme.overrides : null),
        engineVersion: ENGINE_VERSION,
        resolvedAt: new Date().toISOString()
    };
    return out;
}
