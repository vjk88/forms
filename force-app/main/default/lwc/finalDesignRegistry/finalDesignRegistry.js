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
 * - `appliesTo` gates by layout: `{ layouts: [...] }` or `{ paginated: true }`.
 *   Hidden ALWAYS keeps values (IA §6) — filtering is render-only.
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
                        fallback: '#ffffff'
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
                        type: 'color',
                        themePath: 'palette.pageBg'
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
                            { value: 'dusk', label: 'Dusk' }
                        ]
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
                        key: 'texture',
                        label: 'Texture',
                        type: 'select',
                        themePath: 'effects.texture',
                        emptyAsNull: true,
                        options: [
                            { value: '', label: 'None' },
                            { value: 'dots', label: 'Dots' },
                            { value: 'grid', label: 'Grid' }
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
                        type: 'toggle',
                        themePath: 'effects.glass'
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
                        fallback: 'medium',
                        options: [
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
                                label: 'One question at a time'
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
                        key: 'headerBg',
                        label: 'Fill',
                        type: 'color',
                        themePath: 'palette.headerBg'
                    },
                    {
                        key: 'bannerImage',
                        label: 'Banner image',
                        type: 'image',
                        path: 'header.bgImage.url',
                        versionPath: 'header.bgImage.versionId'
                    },
                    {
                        key: 'bannerOpacity',
                        label: 'Image opacity',
                        type: 'range',
                        path: 'header.bgImage.opacity',
                        needsValueOf: 'bannerImage',
                        min: 0,
                        max: 100,
                        fallback: 100
                    },
                    {
                        key: 'headerText',
                        label: 'Header text',
                        type: 'color',
                        themePath: 'palette.headerText',
                        contrastToken: '--c-header-bg',
                        subject: 'Header text'
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
                        type: 'color',
                        themePath: 'palette.contentBg'
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
                            { value: 'brutal', label: 'Hard offset' }
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
                        fallback: '#d8d8d8'
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
                        key: 'fieldBorderColor',
                        label: 'Input border',
                        type: 'color',
                        themePath: 'palette.fieldBorderColor',
                        fallback: '#c9ced6'
                    },
                    {
                        key: 'focus',
                        label: 'Focus color',
                        type: 'color',
                        themePath: 'fieldStates.focus'
                    },
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
                            { value: 'together-left', label: 'Together · left' },
                            {
                                value: 'together-right',
                                label: 'Together · right'
                            },
                            { value: 'split', label: 'Split' }
                        ]
                    },
                    {
                        key: 'submitBg',
                        label: 'Button fill',
                        type: 'color',
                        themePath: 'palette.submitBg',
                        contrastToken: '--c-submit-text',
                        subject: 'Button labels'
                    },
                    {
                        key: 'submitText',
                        label: 'Button label color',
                        type: 'color',
                        themePath: 'palette.submitText',
                        fallback: '#ffffff'
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
