/**
 * finalDesignRegistry — the ONE control registry behind Design mode
 * (FORM_STUDIO_IA §5: canonical 9 areas; Simple is a projection of the same
 * registry, never a second implementation).
 *
 * Rules:
 * - Every control maps to something the engine or viewer ACTUALLY consumes —
 *   no dead controls, ever (the coverage-matrix lesson).
 * - Themed controls (`themePath`) write SPARSE deltas at
 *   `spec.theme.overrides.<themePath>`; presence of a delta IS the edited
 *   state, and reset = delete the delta.
 * - Plain controls (`path`) write spec content (header words, submit labels,
 *   layout frame) — content has no "edited vs theme" concept, no reset chip.
 * - `appliesTo` gates by layout: `{ layouts: [...] }`, `{ notLayouts: [...] }`
 *   or `{ paginated: true }`. Hidden ALWAYS keeps values (IA §6) — filtering
 *   is render-only.
 */

export const RADIUS_ORDER = [
    'sharp',
    'xs',
    'soft',
    'md',
    'round',
    'lg',
    'xl',
    'pill'
];

const RADIUS_OPTIONS = [
    { value: 'sharp', label: 'Sharp' },
    { value: 'xs', label: 'Crisp' },
    { value: 'soft', label: 'Soft' },
    { value: 'md', label: 'Rounded' },
    { value: 'round', label: 'Round' },
    { value: 'lg', label: 'Extra round' },
    { value: 'xl', label: 'Curvy' },
    { value: 'pill', label: 'Pill' }
];

const AREAS = [
    {
        key: 'theme',
        label: 'Theme',
        icon: 'utility:brush',
        groups: [
            {
                key: 'palette',
                label: 'Palette',
                note: 'brand inks',
                controls: [
                    {
                        key: 'accent',
                        label: 'Accent',
                        type: 'color',
                        themePath: 'palette.accent',
                        simple: true,
                        contrastToken: '--c-on-accent',
                        subject: 'Button labels'
                    },
                    {
                        key: 'onAccent',
                        label: 'Button text',
                        type: 'color',
                        themePath: 'palette.onAccent',
                        // unset = derived readable ink on the accent
                        fallbackToken: '--c-on-accent'
                    },
                    {
                        key: 'text',
                        label: 'Text',
                        type: 'color',
                        themePath: 'palette.text',
                        contrastToken: '--c-content-bg',
                        subject: 'Body text'
                    },
                    {
                        key: 'textWeak',
                        label: 'Muted text',
                        type: 'color',
                        themePath: 'palette.textWeak',
                        contrastToken: '--c-content-bg',
                        subject: 'Muted text'
                    }
                ]
            }
        ]
    },
    {
        key: 'type',
        label: 'Type',
        icon: 'utility:text',
        groups: [
            {
                key: 'fonts',
                label: 'Fonts',
                controls: [
                    {
                        key: 'typography',
                        label: 'Font pairing',
                        type: 'select',
                        themePath: 'typography',
                        // panel appends Form_Font__mdt entries as custom:<key>
                        // options and routes them to overrides.customFont
                        dynamicOptions: 'fonts',
                        options: [
                            { value: 'system', label: 'System' },
                            {
                                value: 'editorial',
                                label: 'Editorial (serif display)'
                            },
                            { value: 'mono', label: 'Mono' },
                            { value: 'geometric', label: 'Geometric' },
                            { value: 'humanist', label: 'Humanist' }
                        ]
                    }
                ]
            }
        ]
    },
    {
        key: 'backdrop',
        label: 'Backdrop',
        icon: 'utility:image',
        groups: [
            {
                key: 'pagebg',
                label: 'Page background',
                controls: [
                    {
                        key: 'pageBg',
                        label: 'Fill',
                        type: 'gradientSurface',
                        themePath: 'palette.pageBg',
                        gradientPath: 'palette.pageBgGradient'
                    },
                    {
                        key: 'pageBgOpacity',
                        label: 'Fill opacity',
                        type: 'range',
                        themePath: 'palette.pageBgOpacity',
                        min: 0,
                        max: 100,
                        fallback: 100
                    },
                    {
                        key: 'pageImage',
                        label: 'Image',
                        type: 'image',
                        themePath: 'pageImage.url',
                        versionPath: 'pageImage.versionId'
                    },
                    {
                        key: 'pageFit',
                        label: 'Image fit',
                        type: 'select',
                        themePath: 'pageImage.fit',
                        needsImage: true,
                        options: [
                            { value: 'cover', label: 'Cover' },
                            { value: 'contain', label: 'Contain' },
                            { value: 'tile', label: 'Tile' }
                        ]
                    },
                    {
                        key: 'pageScrim',
                        label: 'Scrim',
                        type: 'range',
                        themePath: 'pageImage.scrim',
                        needsImage: true,
                        min: 0,
                        max: 80
                    },
                    {
                        key: 'pageImageOpacity',
                        label: 'Image opacity',
                        type: 'range',
                        themePath: 'pageImage.opacity',
                        needsImage: true,
                        min: 0,
                        max: 100,
                        fallback: 100
                    },
                    {
                        key: 'pageRadius',
                        label: 'Corner rounding (embedded)',
                        type: 'select',
                        themePath: 'pageRadius',
                        emptyAsNull: true,
                        options: [
                            { value: '', label: 'Square' },
                            ...RADIUS_OPTIONS.filter((o) => o.value !== 'sharp')
                        ]
                    }
                ]
            },
            {
                key: 'atmosphere',
                label: 'Atmosphere',
                controls: [
                    {
                        key: 'mesh',
                        label: 'Mesh',
                        type: 'select',
                        themePath: 'effects.mesh',
                        emptyAsNull: true,
                        options: [
                            { value: '', label: 'None' },
                            { value: 'aurora', label: 'Aurora' },
                            { value: 'dusk', label: 'Dusk' },
                            { value: 'neon', label: 'Neon' },
                            { value: 'custom', label: 'Custom colors' }
                        ]
                    },
                    {
                        key: 'meshColors',
                        label: 'Blob colors',
                        type: 'meshColors',
                        themePath: 'effects.meshColors',
                        // visible for ANY active mesh — presets show their own
                        // colors; editing one converts to a custom mesh (panel)
                        needsEffect: 'mesh'
                    },
                    {
                        key: 'meshIntensity',
                        label: 'Mesh intensity',
                        type: 'select',
                        themePath: 'effects.meshIntensity',
                        needsEffect: 'mesh',
                        options: [
                            { value: 'subtle', label: 'Subtle' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'strong', label: 'Strong' }
                        ]
                    },
                    {
                        key: 'meshAnimate',
                        label: 'Float animation',
                        type: 'toggle',
                        themePath: 'effects.meshAnimate',
                        needsEffect: 'mesh'
                    },
                    {
                        key: 'texture',
                        label: 'Texture',
                        type: 'select',
                        themePath: 'effects.texture',
                        emptyAsNull: true,
                        options: [
                            { value: '', label: 'None' },
                            { value: 'dots', label: 'Dots' },
                            { value: 'grid', label: 'Grid' },
                            { value: 'grain', label: 'Grain' }
                        ]
                    },
                    {
                        key: 'textureIntensity',
                        label: 'Texture intensity',
                        type: 'select',
                        themePath: 'effects.textureIntensity',
                        needsEffect: 'texture',
                        options: [
                            { value: 'subtle', label: 'Subtle' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'strong', label: 'Strong' }
                        ]
                    },
                    {
                        key: 'glass',
                        label: 'Glass blur',
                        type: 'select',
                        themePath: 'effects.glass',
                        emptyAsNull: true,
                        // legacy boolean theme values display as their depths
                        valueMap: { true: '14', false: '' },
                        options: [
                            { value: '', label: 'Off' },
                            { value: '8', label: 'Subtle' },
                            { value: '14', label: 'Standard' },
                            { value: '26', label: 'Deep' }
                        ]
                    }
                ]
            }
        ]
    },
    {
        key: 'layout',
        label: 'Layout',
        icon: 'utility:layout',
        groups: [
            {
                key: 'frame',
                label: 'Frame',
                controls: [
                    {
                        key: 'maxWidth',
                        label: 'Max content width',
                        type: 'select',
                        path: 'layout.maxWidth',
                        // '' = unset (buttonArrangement precedent): carded
                        // layouts read medium; bleed layouts keep their locked
                        // column (540 card / 480 pane) until an explicit pick
                        fallback: '',
                        options: [
                            { value: '', label: 'Layout default' },
                            { value: 'narrow', label: 'Narrow' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'wide', label: 'Wide' },
                            { value: 'full', label: 'Full' }
                        ]
                    },
                    {
                        key: 'density',
                        label: 'Density',
                        type: 'select',
                        themePath: 'density',
                        options: [
                            { value: 'comfortable', label: 'Comfortable' },
                            { value: 'compact', label: 'Compact' }
                        ]
                    }
                ]
            }
        ]
    },
    {
        key: 'paging',
        label: 'Paging',
        icon: 'utility:forward',
        groups: [
            {
                key: 'flow',
                label: 'Flow',
                appliesTo: { layouts: ['scroll'] },
                controls: [
                    {
                        // finalNavScroll always read this; the switch never
                        // existed (audit fix 2026-07-11)
                        key: 'showDividers',
                        label: 'Page dividers',
                        type: 'toggle',
                        path: 'layout.options.showDividers',
                        fallback: false
                    }
                ]
            },
            {
                key: 'panes',
                label: 'Pane flow',
                appliesTo: { layouts: ['splitHero'] },
                controls: [
                    {
                        key: 'fullBleed',
                        label: 'Immersive full-bleed',
                        type: 'toggle',
                        path: 'layout.options.fullBleed',
                        fallback: true
                    },
                    {
                        key: 'paneFlow',
                        label: 'Flow',
                        type: 'select',
                        path: 'layout.options.paneFlow',
                        fallback: '',
                        options: [
                            { value: '', label: 'All fields together' },
                            {
                                value: 'oneAtATime',
                                label: 'One section at a time'
                            }
                        ]
                    },
                    {
                        key: 'heroProgress',
                        label: 'Progress (brand pane)',
                        type: 'select',
                        path: 'layout.options.progressStyle',
                        fallback: 'default',
                        options: [
                            { value: 'default', label: 'Step dots' },
                            { value: 'horizontal', label: 'Progress bar' },
                            { value: 'none', label: 'None' }
                        ]
                    }
                ]
            },
            {
                key: 'steps',
                label: 'Steps',
                appliesTo: { layouts: ['stepper'] },
                controls: [
                    {
                        key: 'stepperMode',
                        label: 'Progress indicator',
                        type: 'select',
                        path: 'layout.options.mode',
                        fallback: 'numbered',
                        options: [
                            { value: 'numbered', label: 'Numbered steps' },
                            { value: 'dots', label: 'Dots' },
                            { value: 'progressBar', label: 'Progress bar' }
                        ]
                    },
                    {
                        key: 'stepperNarrow',
                        label: 'Small screens',
                        type: 'select',
                        path: 'layout.options.narrowMode',
                        fallback: '',
                        options: [
                            { value: '', label: 'Dots' },
                            { value: 'progressBar', label: 'Progress bar' }
                        ]
                    },
                    {
                        key: 'stepperNavigation',
                        label: 'Step access',
                        type: 'select',
                        path: 'layout.options.navigation',
                        fallback: '',
                        options: [
                            { value: '', label: 'Unlock in order' },
                            { value: 'free', label: 'Jump to any step' }
                        ]
                    },
                    {
                        key: 'stepperCount',
                        label: '“Step 2 of 5” text',
                        type: 'toggle',
                        path: 'layout.options.showStepCount',
                        fallback: false
                    }
                ]
            },
            {
                key: 'tabstrip',
                label: 'Tab strip',
                appliesTo: { layouts: ['tabs'] },
                controls: [
                    {
                        key: 'tabStyle',
                        label: 'Style',
                        type: 'select',
                        path: 'layout.options.tabStyle',
                        fallback: 'underline',
                        options: [
                            { value: 'underline', label: 'Underline' },
                            { value: 'pills', label: 'Pills' },
                            { value: 'enclosed', label: 'Enclosed' }
                        ]
                    },
                    {
                        key: 'tabAlignment',
                        label: 'Alignment',
                        type: 'select',
                        path: 'layout.options.tabAlignment',
                        fallback: 'left',
                        options: [
                            { value: 'left', label: 'Left' },
                            { value: 'center', label: 'Centered' },
                            { value: 'fullWidth', label: 'Stretch across' }
                        ]
                    }
                ]
            },
            {
                key: 'sideRail',
                label: 'Side rail',
                appliesTo: { layouts: ['rail'] },
                controls: [
                    {
                        key: 'railSide',
                        label: 'Side',
                        type: 'select',
                        path: 'layout.options.side',
                        fallback: '',
                        options: [
                            { value: '', label: 'Left' },
                            { value: 'right', label: 'Right' }
                        ]
                    },
                    {
                        key: 'railWidth',
                        label: 'Rail width',
                        type: 'select',
                        path: 'layout.options.railWidth',
                        fallback: '',
                        options: [
                            { value: 'narrow', label: 'Narrow' },
                            { value: '', label: 'Standard' },
                            { value: 'wide', label: 'Wide' }
                        ]
                    },
                    {
                        key: 'railContent',
                        label: 'Rail shows',
                        type: 'select',
                        path: 'layout.options.railContent',
                        fallback: '',
                        options: [
                            { value: '', label: 'Page links' },
                            { value: 'both', label: 'Links + progress' }
                        ]
                    },
                    {
                        key: 'railNavigation',
                        label: 'Step access',
                        type: 'select',
                        path: 'layout.options.navigation',
                        // opposite default to the stepper: the rail was born
                        // free-navigation, so '' must stay that way — gating
                        // is the explicit opt-in the primitive reads
                        fallback: '',
                        options: [
                            { value: '', label: 'Jump to any page' },
                            { value: 'gated', label: 'Unlock in order' }
                        ]
                    },
                    {
                        key: 'railNarrow',
                        label: 'Small screens',
                        type: 'select',
                        path: 'layout.options.narrowBehavior',
                        fallback: '',
                        options: [
                            { value: '', label: 'Chips across the top' },
                            { value: 'drawer', label: 'Collapse into a menu' }
                        ]
                    }
                ]
            },
            {
                key: 'sectionFlow',
                label: 'Section flow',
                appliesTo: { layouts: ['oneAtATime'] },
                controls: [
                    {
                        // same option splitHero's pane group exposes — this
                        // layout's carded look existed with no way to reach it
                        // (audit fix 2026-07-11)
                        key: 'oaatBleed',
                        label: 'Immersive full-bleed',
                        type: 'toggle',
                        path: 'layout.options.fullBleed',
                        fallback: true
                    },
                    {
                        key: 'advanceLabel',
                        label: 'Continue button label',
                        type: 'text',
                        path: 'layout.options.advanceLabel',
                        placeholder: 'Continue'
                    },
                    {
                        key: 'oaatProgress',
                        label: 'Progress bar',
                        type: 'toggle',
                        path: 'layout.options.showProgressBar',
                        fallback: true
                    },
                    {
                        key: 'advanceTrigger',
                        label: 'Advance with',
                        type: 'select',
                        path: 'layout.options.advanceTrigger',
                        fallback: '',
                        options: [
                            { value: '', label: 'Button click' },
                            {
                                value: 'keyboard',
                                label: 'Button or Return key'
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        key: 'header',
        label: 'Header',
        icon: 'utility:textbox',
        groups: [
            {
                key: 'words',
                label: 'Branding & words',
                controls: [
                    {
                        key: 'headerStyle',
                        label: 'Header style',
                        type: 'select',
                        path: 'header.style',
                        fallback: 'standard',
                        options: [
                            { value: 'standard', label: 'Standard' },
                            { value: 'minimal', label: 'Minimal' },
                            { value: 'none', label: 'None' }
                        ]
                    },
                    {
                        // legacy-coverage sweep 2026-07-08: the runtime always
                        // supported header.arrangement; only the control was missing
                        key: 'headerArrangement',
                        label: 'Arrangement',
                        type: 'select',
                        path: 'header.arrangement',
                        fallback: 'stacked',
                        options: [
                            { value: 'stacked', label: 'Stacked' },
                            { value: 'logoBeside', label: 'Logo beside text' },
                            { value: 'inline', label: 'Inline (one row)' },
                            { value: 'centered', label: 'Centered' },
                            { value: 'textOnly', label: 'Text only' }
                        ]
                    },
                    {
                        key: 'brandName',
                        label: 'Brand name',
                        type: 'text',
                        path: 'header.brandName',
                        placeholder: 'Typeset as a wordmark'
                    },
                    {
                        key: 'logo',
                        label: 'Logo',
                        type: 'image',
                        path: 'header.logo.url',
                        versionPath: 'header.logo.versionId',
                        simple: true
                    },
                    {
                        key: 'title',
                        label: 'Title',
                        type: 'text',
                        path: 'header.title',
                        simple: true
                    },
                    {
                        key: 'description',
                        label: 'Subtitle',
                        type: 'text',
                        path: 'header.description',
                        simple: true
                    },
                    {
                        key: 'highlight',
                        label: 'Highlight message',
                        type: 'text',
                        path: 'header.highlight.text',
                        placeholder: 'Optional announcement line'
                    }
                ]
            },
            {
                key: 'surface',
                label: 'Surface',
                controls: [
                    {
                        // Split Hero owns its header (the brand pane): the
                        // standard header's fill/banner never paint there, so
                        // the knobs hide (owner 2026-07-11). Text colors stay —
                        // they ink the theme-dressed pane.
                        key: 'headerBg',
                        label: 'Fill',
                        type: 'gradientSurface',
                        themePath: 'palette.headerBg',
                        gradientPath: 'palette.headerBgGradient',
                        appliesTo: { notLayouts: ['splitHero'] }
                    },
                    {
                        key: 'headerBgOpacity',
                        label: 'Fill opacity',
                        type: 'range',
                        themePath: 'palette.headerBgOpacity',
                        min: 0,
                        max: 100,
                        fallback: 100,
                        appliesTo: { notLayouts: ['splitHero'] }
                    },
                    {
                        key: 'bannerImage',
                        label: 'Banner image',
                        type: 'image',
                        path: 'header.bgImage.url',
                        versionPath: 'header.bgImage.versionId',
                        appliesTo: { notLayouts: ['splitHero'] }
                    },
                    {
                        key: 'bannerOpacity',
                        label: 'Image opacity',
                        type: 'range',
                        path: 'header.bgImage.opacity',
                        needsValueOf: 'bannerImage',
                        min: 0,
                        max: 100,
                        fallback: 100,
                        appliesTo: { notLayouts: ['splitHero'] }
                    },
                    {
                        key: 'headerText',
                        label: 'Header text',
                        type: 'color',
                        themePath: 'palette.headerText',
                        contrastToken: '--c-header-bg',
                        subject: 'Header text'
                    },
                    {
                        key: 'headerTextWeak',
                        label: 'Subtitle color',
                        type: 'color',
                        themePath: 'palette.headerTextWeak',
                        contrastToken: '--c-header-bg',
                        subject: 'Subtitle'
                    }
                ]
            }
        ]
    },
    {
        key: 'body',
        label: 'Body',
        icon: 'utility:rows',
        groups: [
            {
                key: 'panel',
                label: 'Content panel',
                controls: [
                    {
                        key: 'contentBg',
                        label: 'Fill',
                        type: 'gradientSurface',
                        themePath: 'palette.contentBg',
                        gradientPath: 'palette.contentBgGradient'
                    },
                    {
                        key: 'contentBgOpacity',
                        label: 'Fill opacity',
                        type: 'range',
                        themePath: 'palette.contentBgOpacity',
                        min: 0,
                        max: 100,
                        fallback: 100
                    },
                    {
                        key: 'shadow',
                        label: 'Shadow',
                        type: 'select',
                        themePath: 'effects.shadow',
                        options: [
                            { value: 'none', label: 'None' },
                            { value: 'soft', label: 'Soft' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'floating', label: 'Floating' },
                            { value: 'brutal', label: 'Hard offset' },
                            { value: 'deep', label: 'Deep (dark pages)' }
                        ]
                    },
                    {
                        key: 'radius',
                        label: 'Corner rounding',
                        type: 'select',
                        themePath: 'radius',
                        options: RADIUS_OPTIONS
                    },
                    {
                        key: 'border',
                        label: 'Border weight',
                        type: 'select',
                        themePath: 'border',
                        options: [
                            { value: 'hairline', label: 'Hairline' },
                            { value: 'bold', label: 'Bold' }
                        ]
                    },
                    {
                        key: 'borderColor',
                        label: 'Border color',
                        type: 'color',
                        themePath: 'palette.borderColor',
                        fallbackToken: '--c-border-color'
                    }
                ]
            },
            {
                // ONE global section look (owner 2026-07-11) — replaces the
                // never-built per-section style pickers. Unset = each section's
                // own preset class decides (default Card); the engine emits
                // --c-section-* only when something here is set.
                key: 'sections',
                label: 'Sections',
                controls: [
                    {
                        key: 'sectionStyle',
                        label: 'Section style',
                        type: 'select',
                        themePath: 'sectionStyle',
                        emptyAsNull: true,
                        options: [
                            { value: '', label: 'Default (Card)' },
                            { value: 'plain', label: 'Plain' },
                            { value: 'card', label: 'Card' },
                            { value: 'boxed', label: 'Boxed' },
                            { value: 'outline', label: 'Outline' },
                            { value: 'subtle', label: 'Subtle' }
                        ]
                    },
                    {
                        key: 'sectionBg',
                        label: 'Fill',
                        type: 'color',
                        themePath: 'palette.sectionBg',
                        contrastToken: '--c-text',
                        subject: 'Section content'
                    },
                    {
                        key: 'sectionBorderColor',
                        label: 'Border color',
                        type: 'color',
                        themePath: 'palette.sectionBorderColor'
                    }
                ]
            }
        ]
    },
    {
        key: 'fields',
        label: 'Fields',
        icon: 'utility:list',
        groups: [
            {
                key: 'inputs',
                label: 'Inputs',
                controls: [
                    {
                        key: 'inputStyle',
                        label: 'Input style',
                        type: 'select',
                        themePath: 'fieldStyle',
                        options: [
                            { value: 'outline', label: 'Standard outline' },
                            { value: 'underline', label: 'Boutique underline' },
                            { value: 'filled', label: 'Flat filled' }
                        ]
                    },
                    {
                        // legacy-coverage sweep 2026-07-08: old build had
                        // inputBackground; explicit fill wins in EVERY shell
                        key: 'fieldBg',
                        label: 'Input fill',
                        type: 'color',
                        themePath: 'palette.fieldBg',
                        fallbackToken: '--c-input-bg',
                        contrastToken: '--c-text',
                        subject: 'Input text'
                    },
                    {
                        key: 'fieldBorderColor',
                        label: 'Input border',
                        type: 'color',
                        themePath: 'palette.fieldBorderColor',
                        // live derived ink, never a stale static hex
                        fallbackToken: '--c-field-border'
                    },
                    // Focus color REMOVED (owner 2026-07-11): focus rides the
                    // accent — the engine default, and what every catalog theme
                    // already did. fieldStates.focus stays honored for old specs.
                    {
                        key: 'error',
                        label: 'Error color',
                        type: 'color',
                        themePath: 'fieldStates.error',
                        fallback: '#b42318'
                    },
                    {
                        key: 'required',
                        label: 'Required marker',
                        type: 'color',
                        themePath: 'fieldStates.required',
                        fallback: '#b42318'
                    }
                ]
            },
            {
                key: 'labels',
                label: 'Labels',
                controls: [
                    {
                        key: 'labelPosition',
                        label: 'Label position',
                        type: 'select',
                        themePath: 'labelPosition',
                        options: [
                            { value: 'top', label: 'Top' },
                            { value: 'left', label: 'Left' }
                        ]
                    },
                    {
                        key: 'labelColor',
                        label: 'Label color',
                        type: 'color',
                        themePath: 'palette.labelColor',
                        // unset = the label style derives it — show the LIVE
                        // resolved ink, never a stale black swatch
                        fallbackToken: '--c-label-color',
                        contrastToken: '--c-content-bg',
                        subject: 'Field labels'
                    },
                    {
                        key: 'labelStyle',
                        label: 'Label style',
                        type: 'select',
                        themePath: 'labelStyle',
                        options: [
                            { value: 'default', label: 'Default' },
                            { value: 'monoCaps', label: 'Uppercase mono' },
                            { value: 'caps', label: 'Uppercase small' },
                            { value: 'mutedSm', label: 'Muted small' }
                        ]
                    }
                ]
            }
        ]
    },
    {
        key: 'actions',
        label: 'Actions',
        icon: 'utility:check',
        groups: [
            {
                key: 'buttons',
                label: 'Buttons',
                controls: [
                    {
                        key: 'submitLabel',
                        label: 'Submit label',
                        type: 'text',
                        path: 'submit.label',
                        simple: true
                    },
                    {
                        key: 'nextLabel',
                        label: 'Next label',
                        type: 'text',
                        path: 'submit.nextLabel',
                        placeholder: 'Next',
                        appliesTo: { paginated: true }
                    },
                    {
                        key: 'backLabel',
                        label: 'Back label',
                        type: 'text',
                        path: 'submit.backLabel',
                        placeholder: 'Back',
                        appliesTo: { paginated: true }
                    },
                    {
                        key: 'buttonArrangement',
                        label: 'Arrangement',
                        type: 'select',
                        path: 'submit.buttonArrangement',
                        fallback: '',
                        options: [
                            { value: '', label: 'Layout default' },
                            {
                                value: 'together-left',
                                label: 'Together · left'
                            },
                            {
                                value: 'together-right',
                                label: 'Together · right'
                            },
                            { value: 'split', label: 'Split' },
                            { value: 'stretch', label: 'Stretch' }
                        ]
                    },
                    {
                        key: 'submitBg',
                        label: 'Button fill',
                        type: 'color',
                        themePath: 'palette.submitBg',
                        // unset = the accent; show THAT, not an empty swatch
                        fallbackToken: '--c-submit-bg',
                        contrastToken: '--c-submit-text',
                        subject: 'Button labels'
                    },
                    {
                        key: 'submitText',
                        label: 'Button label color',
                        type: 'color',
                        themePath: 'palette.submitText',
                        // unset = derived readable ink (black on light fills)
                        fallbackToken: '--c-submit-text'
                    }
                ]
            },
            {
                // After Submit (owner FormBuilder port, screenshots 2026-07-09).
                // All spec content; `needsValue` = render-only equality gates
                // (hidden ALWAYS keeps values, IA §6). The runtime render is
                // c/finalAfterSubmit; redirect EXECUTION lands with P3.
                key: 'afterSubmit',
                label: 'After submit',
                controls: [
                    {
                        key: 'asMode',
                        label: 'After submit',
                        type: 'tiles',
                        path: 'settings.completion.mode',
                        fallback: 'screen',
                        options: [
                            {
                                value: 'screen',
                                label: 'Completion screen',
                                hint: 'Show a thank-you page'
                            },
                            {
                                value: 'toast',
                                label: 'Toast & go',
                                hint: 'Pop a toast, jump to record / URL'
                            }
                        ]
                    },
                    {
                        key: 'asMessage',
                        label: 'Thank-you message',
                        type: 'richtext',
                        path: 'settings.completion.message',
                        placeholder:
                            'Thank you! Your response has been recorded.',
                        needsValue: [{ key: 'asMode', equals: 'screen' }]
                    },
                    {
                        key: 'asAutoRedirect',
                        label: 'Auto-redirect',
                        type: 'toggle',
                        path: 'settings.completion.autoRedirect',
                        needsValue: [{ key: 'asMode', equals: 'screen' }]
                    },
                    {
                        key: 'asRedirectTo',
                        label: 'Redirect to',
                        type: 'select',
                        path: 'settings.completion.redirectTo',
                        fallback: 'record',
                        options: [
                            {
                                value: 'record',
                                label: 'The new / updated record'
                            },
                            { value: 'url', label: 'Custom URL' }
                        ],
                        needsValue: [
                            { key: 'asMode', equals: 'screen' },
                            { key: 'asAutoRedirect', equals: true }
                        ]
                    },
                    {
                        key: 'asRedirectUrl',
                        label: 'Redirect URL',
                        type: 'text',
                        path: 'settings.completion.redirectUrl',
                        placeholder: 'https://…',
                        needsValue: [
                            { key: 'asMode', equals: 'screen' },
                            { key: 'asAutoRedirect', equals: true },
                            { key: 'asRedirectTo', equals: 'url' }
                        ]
                    },
                    {
                        key: 'asRedirectDelay',
                        label: 'Redirect delay (seconds)',
                        type: 'number',
                        path: 'settings.completion.redirectDelay',
                        fallback: 5,
                        min: 0,
                        max: 60,
                        needsValue: [
                            { key: 'asMode', equals: 'screen' },
                            { key: 'asAutoRedirect', equals: true }
                        ]
                    },
                    {
                        key: 'asActionButton',
                        label: 'Action button',
                        type: 'toggle',
                        path: 'settings.completion.actionButton',
                        fallback: true,
                        needsValue: [{ key: 'asMode', equals: 'screen' }]
                    },
                    {
                        key: 'asButtonLabel',
                        label: 'Button label',
                        type: 'text',
                        path: 'settings.completion.buttonLabel',
                        placeholder: 'Continue',
                        needsValue: [
                            { key: 'asMode', equals: 'screen' },
                            { key: 'asActionButton', equals: true }
                        ]
                    },
                    {
                        key: 'asButtonGoesTo',
                        label: 'Goes to',
                        type: 'select',
                        path: 'settings.completion.buttonGoesTo',
                        fallback: 'record',
                        options: [
                            {
                                value: 'record',
                                label: 'The new / updated record'
                            },
                            { value: 'url', label: 'Custom URL' }
                        ],
                        needsValue: [
                            { key: 'asMode', equals: 'screen' },
                            { key: 'asActionButton', equals: true }
                        ]
                    },
                    {
                        key: 'asButtonUrl',
                        label: 'Button URL',
                        type: 'text',
                        path: 'settings.completion.buttonUrl',
                        placeholder: 'https://…',
                        needsValue: [
                            { key: 'asMode', equals: 'screen' },
                            { key: 'asActionButton', equals: true },
                            { key: 'asButtonGoesTo', equals: 'url' }
                        ]
                    },
                    // Toast & go: same destination slots, its own gate — two
                    // registry rows over ONE path is the OR of the mode gates.
                    {
                        key: 'asToastGoTo',
                        label: 'Go to',
                        type: 'select',
                        path: 'settings.completion.redirectTo',
                        fallback: 'record',
                        options: [
                            {
                                value: 'record',
                                label: 'The new / updated record'
                            },
                            { value: 'url', label: 'Custom URL' }
                        ],
                        needsValue: [{ key: 'asMode', equals: 'toast' }]
                    },
                    {
                        key: 'asToastUrl',
                        label: 'URL',
                        type: 'text',
                        path: 'settings.completion.redirectUrl',
                        placeholder: 'https://…',
                        needsValue: [
                            { key: 'asMode', equals: 'toast' },
                            { key: 'asToastGoTo', equals: 'url' }
                        ]
                    }
                ]
            }
        ]
    }
];

export function listAreas() {
    return AREAS;
}

/** Every control, flattened with its area/group keys. */
export function flattenControls() {
    const out = [];
    for (const area of AREAS) {
        for (const group of area.groups) {
            for (const control of group.controls) {
                out.push({ area: area.key, group: group.key, control });
            }
        }
    }
    return out;
}

// ----- tiny path helpers (dot paths over plain JSON trees) -----

export function getAt(obj, path) {
    if (!obj || !path) {
        return undefined;
    }
    let node = obj;
    for (const part of path.split('.')) {
        if (node === null || typeof node !== 'object') {
            return undefined;
        }
        node = node[part];
    }
    return node;
}

export function setAt(obj, path, value) {
    const parts = path.split('.');
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (node[parts[i]] === null || typeof node[parts[i]] !== 'object') {
            node[parts[i]] = {};
        }
        node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
}

/** Delete a leaf and prune now-empty parent objects. */
export function deleteAt(obj, path) {
    const parts = path.split('.');
    const stack = [];
    let node = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (node === null || typeof node !== 'object') {
            return;
        }
        stack.push(node);
        node = node[parts[i]];
    }
    if (node === null || typeof node !== 'object') {
        return;
    }
    delete node[parts[parts.length - 1]];
    for (let i = stack.length - 1; i >= 0; i--) {
        const parent = stack[i];
        const key = parts[i];
        const child = parent[key];
        if (
            child &&
            typeof child === 'object' &&
            Object.keys(child).length === 0
        ) {
            delete parent[key];
        } else {
            break;
        }
    }
}
