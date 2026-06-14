/**
 * c/formTemplates — curated catalog for the gallery-first creation experience
 * (PHASE2 creation redesign; owner picked "gallery-first, map object on pick").
 *
 * Pure data + dependency-free helpers (same rule as c/layoutFixtures, so the
 * gallery, its Jest tests, and the create path all consume it without cycles).
 * Each template is a REAL, themed example form bound to a suggested standard
 * object; on pick the user can remap it onto their own object (fields that
 * don't exist there are dropped — see toEngineParts/toBodyJson `validApis`).
 *
 * Theme objects are plain literals (NOT c/formThemes) — the engine consumes
 * them as opaque `skin` data. Authoring shape (compact):
 *   { id, name, category, description, icon, formType, suggestedObject,
 *     suggestedObjectLabel, layoutMode, archetype, adapters[], theme{},
 *     header{title,subtitle}, sections:[ {title, gridColumns, elements:[…]} ] }
 * Element authoring shape:
 *   Field:   { type:'Field', fieldApiName, name, uiBehavior?, renderAs?, helpText? }
 *   Display: { type:'Callout'|'Rich_Text'|'Divider'|'Spacer'|'Consent'|'Image',
 *              name?, content?, calloutVariant?, spacerSize?, imageUrl? }
 */

export const TEMPLATE_CATEGORIES = [
    { value: 'all', label: 'All' },
    { value: 'intake', label: 'Intake' },
    { value: 'sales', label: 'Sales' },
    { value: 'support', label: 'Support' },
    { value: 'events', label: 'Events' },
    { value: 'survey', label: 'Survey' },
    { value: 'blank', label: 'Blank' }
];

// Appearance is NOT defined here anymore — each template carries `themeId` +
// `skinId`, resolved to real tokens by c/formThemes `resolveTheme()` in the
// gallery/viewer. Keeping this module dependency-free (no c/formThemes import)
// so the gallery, its Jest tests, and the create path consume it without cycles.

export const FORM_TEMPLATES = [
    {
        id: 'contact-intake',
        name: 'Contact intake',
        category: 'intake',
        description: 'Capture a new contact — name, how to reach them, and a note.',
        icon: 'standard:contact',
        formType: 'Form',
        suggestedObject: 'Contact',
        suggestedObjectLabel: 'Contact',
        layoutMode: 'Single_Page',
        archetype: 'stacked',
        themeId: 'cloud', skinId: 'light',
        adapters: ['Internal_Record_Page'],
        header: { title: 'Contact intake', subtitle: "Tell us who you are and how to reach you." },
        sections: [
            {
                title: 'Your details', gridColumns: 2,
                elements: [
                    { type: 'Field', fieldApiName: 'FirstName', name: 'First name' },
                    { type: 'Field', fieldApiName: 'LastName', name: 'Last name', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Email', name: 'Email', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Phone', name: 'Phone' },
                    { type: 'Field', fieldApiName: 'LeadSource', name: 'How did you hear about us?', renderAs: 'Dropdown' }
                ]
            },
            {
                title: 'Anything else?', gridColumns: 1,
                elements: [
                    { type: 'Field', fieldApiName: 'Description', name: 'Notes' },
                    { type: 'Consent', name: 'Consent', content: 'I agree to be contacted about my request.' }
                ]
            }
        ]
    },
    {
        id: 'lead-capture',
        name: 'Lead capture',
        category: 'sales',
        description: 'A punchy, branded lead form for landing pages and campaigns.',
        icon: 'standard:lead',
        formType: 'Form',
        suggestedObject: 'Lead',
        suggestedObjectLabel: 'Lead',
        layoutMode: 'Single_Page',
        archetype: 'splitHero',
        themeId: 'luxe', skinId: 'emerald',
        adapters: ['Internal_Record_Page', 'Public_Guest'],
        header: { title: 'Get a quote', subtitle: 'Two minutes, no obligation.' },
        sections: [
            {
                title: 'About you', gridColumns: 2,
                elements: [
                    { type: 'Field', fieldApiName: 'FirstName', name: 'First name' },
                    { type: 'Field', fieldApiName: 'LastName', name: 'Last name', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Email', name: 'Work email', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Company', name: 'Company', uiBehavior: 'Required' }
                ]
            },
            {
                title: 'What do you need?', gridColumns: 1,
                elements: [
                    { type: 'Field', fieldApiName: 'Industry', name: 'Industry', renderAs: 'Dropdown' },
                    { type: 'Field', fieldApiName: 'NumberOfEmployees', name: 'Company size', renderAs: 'Slider' },
                    { type: 'Field', fieldApiName: 'Description', name: 'Tell us about your project' }
                ]
            }
        ]
    },
    {
        id: 'support-case',
        name: 'Support request',
        category: 'support',
        description: 'A guided, multi-step case form that routes itself.',
        icon: 'standard:case',
        formType: 'Form',
        suggestedObject: 'Case',
        suggestedObjectLabel: 'Case',
        layoutMode: 'Multi_Page_Wizard',
        archetype: 'stepper',
        themeId: 'cloud', skinId: 'soft',
        adapters: ['Internal_Record_Page'],
        header: { title: 'Open a support request', subtitle: 'A few quick steps and we will route it.' },
        sections: [
            {
                title: 'The basics', gridColumns: 1,
                elements: [
                    { type: 'Field', fieldApiName: 'Subject', name: 'Subject', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Type', name: 'What kind of issue?', renderAs: 'Radio_Buttons' }
                ]
            },
            {
                title: 'Details', gridColumns: 1,
                elements: [
                    { type: 'Field', fieldApiName: 'Priority', name: 'How urgent?', renderAs: 'Radio_Buttons' },
                    { type: 'Field', fieldApiName: 'Description', name: 'Describe the problem', uiBehavior: 'Required' }
                ]
            },
            {
                title: 'How to reach you', gridColumns: 2,
                elements: [
                    { type: 'Field', fieldApiName: 'SuppliedName', name: 'Your name' },
                    { type: 'Field', fieldApiName: 'SuppliedEmail', name: 'Your email', uiBehavior: 'Required' }
                ]
            }
        ]
    },
    {
        id: 'event-signup',
        name: 'Event signup',
        category: 'events',
        description: 'A clean, document-style RSVP that reads like an invitation.',
        icon: 'standard:event',
        formType: 'Form',
        suggestedObject: 'Contact',
        suggestedObjectLabel: 'Contact',
        layoutMode: 'Single_Page',
        archetype: 'stacked',
        themeId: 'editorial', skinId: 'paper',
        adapters: ['Internal_Record_Page', 'Public_Guest'],
        header: { title: "You're invited", subtitle: 'Reserve your spot below.' },
        sections: [
            {
                title: 'Who is coming?', gridColumns: 2,
                elements: [
                    { type: 'Field', fieldApiName: 'FirstName', name: 'First name', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'LastName', name: 'Last name', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Email', name: 'Email', uiBehavior: 'Required' }
                ]
            },
            {
                title: 'Preferences', gridColumns: 1,
                elements: [
                    { type: 'Rich_Text', name: 'Note', content: '<p>Doors open at 6pm. Dietary needs? Let us know below.</p>' },
                    { type: 'Field', fieldApiName: 'Description', name: 'Dietary needs / notes' }
                ]
            }
        ]
    },
    {
        id: 'account-onboarding',
        name: 'Account onboarding',
        category: 'sales',
        description: 'A longer company profile, organized into a side-nav layout.',
        icon: 'standard:account',
        formType: 'Form',
        suggestedObject: 'Account',
        suggestedObjectLabel: 'Account',
        layoutMode: 'Vertical_Navigation',
        archetype: 'sideNav',
        themeId: 'cloud', skinId: 'light',
        adapters: ['Internal_Record_Page'],
        header: { title: 'Onboard a company', subtitle: 'Tell us about the organization.' },
        sections: [
            {
                title: 'Company', gridColumns: 2,
                elements: [
                    { type: 'Field', fieldApiName: 'Name', name: 'Company name', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Website', name: 'Website' },
                    { type: 'Field', fieldApiName: 'Industry', name: 'Industry', renderAs: 'Dropdown' },
                    { type: 'Field', fieldApiName: 'NumberOfEmployees', name: 'Employees', renderAs: 'Slider' }
                ]
            },
            {
                title: 'Address', gridColumns: 2,
                elements: [
                    { type: 'Field', fieldApiName: 'BillingStreet', name: 'Street' },
                    { type: 'Field', fieldApiName: 'BillingCity', name: 'City' },
                    { type: 'Field', fieldApiName: 'BillingState', name: 'State' },
                    { type: 'Field', fieldApiName: 'BillingPostalCode', name: 'Postal code' }
                ]
            }
        ]
    },
    {
        id: 'nps-survey',
        name: 'Satisfaction survey',
        category: 'survey',
        description: 'A conversational, one-question-at-a-time feedback survey.',
        icon: 'standard:survey',
        formType: 'Survey',
        suggestedObject: 'Contact',
        suggestedObjectLabel: 'Contact',
        layoutMode: 'Single_Page',
        archetype: 'oneAtATime',
        themeId: 'cloud', skinId: 'soft',
        adapters: ['Internal_Record_Page', 'Public_Guest'],
        header: { title: 'How did we do?', subtitle: 'Your feedback takes under a minute.' },
        sections: [
            {
                title: 'Your feedback', gridColumns: 1,
                elements: [
                    { type: 'Callout', name: 'Intro', content: 'Thanks for taking a moment — we read every response.', calloutVariant: 'info' },
                    { type: 'Field', fieldApiName: 'Description', name: 'What stood out, good or bad?' },
                    { type: 'Field', fieldApiName: 'Email', name: 'Email (optional, if you want a reply)' }
                ]
            }
        ]
    },
    {
        id: 'blank',
        name: 'Blank form',
        category: 'blank',
        description: 'Start from scratch with one empty section.',
        icon: 'utility:new',
        formType: 'Form',
        suggestedObject: '',
        suggestedObjectLabel: '',
        layoutMode: 'Single_Page',
        archetype: 'stacked',
        themeId: 'cloud', skinId: 'light',
        adapters: ['Internal_Record_Page'],
        header: { title: 'New form', subtitle: '' },
        sections: [{ title: 'Details', gridColumns: 1, elements: [] }]
    }
];

// ---------------------------------------------------------------- helpers

const MULTI_PAGE_MODES = new Set([
    'Multi_Page_Wizard',
    'Vertical_Navigation',
    'Top_Navigation'
]);

/** A field element survives an object remap only if the field exists there. */
function fieldSurvives(el, validApis) {
    if ((el.type || 'Field') !== 'Field') return true; // display elements always
    if (!el.fieldApiName) return false;
    if (!validApis) return true; // not yet validated → assume suggested object
    return validApis.has(el.fieldApiName.toLowerCase());
}

/**
 * Normalize a template into pages → sections → elements with stable ids.
 * Multi-page layout modes put each authored section on its own page; single
 * page keeps them together. `validApis` (lowercased Set) drops fields the
 * chosen object lacks. Internal — feeds both the engine preview and the body.
 */
function normalize(tpl, validApis) {
    const multi = MULTI_PAGE_MODES.has(tpl.layoutMode);
    const pages = [];
    let sIdx = 0;
    let eIdx = 0;
    (tpl.sections || []).forEach((sec, i) => {
        const pageIndex = multi ? i : 0;
        if (!pages[pageIndex]) {
            pages[pageIndex] = {
                id: `${tpl.id}-p${pageIndex + 1}`,
                name: multi ? sec.title || `Step ${pageIndex + 1}` : tpl.name,
                sections: []
            };
        }
        sIdx += 1;
        const elements = (sec.elements || [])
            .filter((el) => fieldSurvives(el, validApis))
            .map((el) => {
                eIdx += 1;
                return { ...el, id: `${tpl.id}-e${eIdx}`, type: el.type || 'Field' };
            });
        pages[pageIndex].sections.push({
            id: `${tpl.id}-s${sIdx}`,
            title: sec.title,
            gridColumns: sec.gridColumns || 1,
            elements
        });
    });
    return pages.filter(Boolean);
}

/**
 * Engine @api parts (pages/sections/elements) for a live preview at any scale.
 * Element view-model matches the engine's preview-stub contract
 * (key/sectionKey/label/type/required/order).
 */
export function toEngineParts(tpl, validApis) {
    const pages = [];
    const sections = [];
    const elements = [];
    let order = 0;
    normalize(tpl, validApis).forEach((pg, pgIndex) => {
        pages.push({ key: pg.id, label: pg.name, order: pgIndex + 1 });
        pg.sections.forEach((sec) => {
            sections.push({
                key: sec.id, pageKey: pg.id, title: sec.title,
                gridColumns: sec.gridColumns, order: order + 1
            });
            sec.elements.forEach((el) => {
                order += 1;
                elements.push({
                    key: el.id, sectionKey: sec.id,
                    label: el.name || el.fieldApiName || el.type,
                    type: el.type,
                    required: el.uiBehavior === 'Required',
                    order
                });
            });
        });
    });
    return { pages, sections, elements };
}

/**
 * The Layout_Config__c body JSON (verified org shape) for the create action.
 * `objectApiName` is the user's chosen/remapped object; `validApis` drops any
 * authored field that object doesn't have.
 */
export function toBodyJson(tpl, objectApiName, validApis) {
    return {
        schemaVersion: 1,
        layoutMode: tpl.layoutMode,
        header: {
            visible: !!(tpl.header && tpl.header.title),
            title: (tpl.header && tpl.header.title) || tpl.name,
            subtitle: (tpl.header && tpl.header.subtitle) || ''
        },
        formSettings: {
            submitLabel: 'Submit',
            thankYouMessage: 'Thanks — your response was received.',
            // Real theme tokens are written by the gallery (resolveTheme from
            // themeId/skinId); here we only carry the legacy layout hint.
            theme: { layout: legacyLayoutFor(tpl.archetype) }
        },
        pages: normalize(tpl, validApis).map((pg) => ({
            id: pg.id,
            name: pg.name,
            showInProgress: true,
            sections: pg.sections.map((sec) => ({
                id: sec.id,
                name: sec.title,
                showHeader: true,
                gridColumns: sec.gridColumns,
                contextType: 'primary',
                collapsible: false,
                collapsedByDefault: false,
                isRepeatable: false,
                elements: sec.elements.map((el) => ({ ...el }))
            }))
        }))
    };
}

// Canonical layout → legacy theme.layout id (so the saved body's theme.layout
// is a value the existing builder/property panel also understands).
function legacyLayoutFor(archetype) {
    switch (archetype) {
        case 'splitHero':
            return 'split';
        case 'stepper':
            return 'stepped';
        case 'oneAtATime':
            return 'compact';
        default:
            return 'classic';
    }
}

export function templateById(id) {
    return FORM_TEMPLATES.find((t) => t.id === id) || null;
}

// ------------------------------------------------ custom + bare-layout sources

// Canonical layout id → friendly label (formTemplates stays import-free, so
// this is a local copy of the 8 layouts in presets.js LAYOUT_LABELS / groups).
export const LAYOUT_LABELS = {
    stacked: 'Stacked',
    bento: 'Bento Grid',
    stepper: 'Stepper',
    splitHero: 'Split Hero',
    sideNav: 'Side Nav',
    oneAtATime: 'One at a Time',
    tabbed: 'Tabbed',
    accordion: 'Accordion'
};
export const LAYOUT_OPTIONS = Object.keys(LAYOUT_LABELS);

// Multi-page sample shown ONLY in a layout's live preview (so picking a layout
// shows its real structure — wizard steps, side-nav items, tabs — not an empty
// or single-page form). Engine-contract shape; never created. 3 pages so paged
// archetypes have something to page through.
const SAMPLE_PAGES = [
    { key: 'sp_p1', label: 'About you', order: 1 },
    { key: 'sp_p2', label: 'Your needs', order: 2 },
    { key: 'sp_p3', label: 'Wrap up', order: 3 }
];
const SAMPLE_SECTIONS_VM = [
    { key: 'sp_s1', pageKey: 'sp_p1', title: 'Contact', icon: 'utility:user', gridColumns: 2, order: 1 },
    { key: 'sp_s2', pageKey: 'sp_p1', title: 'Address', icon: 'utility:location', gridColumns: 2, order: 2 },
    { key: 'sp_s3', pageKey: 'sp_p2', title: 'Project', icon: 'utility:knowledge_base', gridColumns: 1, order: 3 },
    { key: 'sp_s4', pageKey: 'sp_p3', title: 'Confirm', icon: 'utility:check', gridColumns: 1, order: 4 }
];
const SAMPLE_ELEMENTS_VM = [
    { key: 'sp_e1', sectionKey: 'sp_s1', label: 'First name', type: 'text', required: true, order: 1 },
    { key: 'sp_e2', sectionKey: 'sp_s1', label: 'Last name', type: 'text', required: true, order: 2 },
    { key: 'sp_e3', sectionKey: 'sp_s1', label: 'Email', type: 'email', required: true, order: 3 },
    { key: 'sp_e4', sectionKey: 'sp_s1', label: 'Phone', type: 'phone', order: 4 },
    { key: 'sp_e5', sectionKey: 'sp_s2', label: 'Street', type: 'text', order: 5 },
    { key: 'sp_e6', sectionKey: 'sp_s2', label: 'City', type: 'text', order: 6 },
    { key: 'sp_e7', sectionKey: 'sp_s2', label: 'State', type: 'text', order: 7 },
    { key: 'sp_e8', sectionKey: 'sp_s2', label: 'Postal code', type: 'text', order: 8 },
    { key: 'sp_e9', sectionKey: 'sp_s3', label: 'What do you need?', type: 'textarea', required: true, order: 9 },
    { key: 'sp_e10', sectionKey: 'sp_s3', label: 'Budget', type: 'currency', order: 10 },
    { key: 'sp_e11', sectionKey: 'sp_s3', label: 'Timeline', type: 'picklist', order: 11 },
    { key: 'sp_e12', sectionKey: 'sp_s4', label: 'Notes', type: 'textarea', order: 12 }
];

/** Rich multi-page preview parts for a "start from a layout" card. */
export function sampleLayoutParts() {
    return {
        pages: SAMPLE_PAGES.map((p) => ({ ...p })),
        sections: SAMPLE_SECTIONS_VM.map((s) => ({ ...s })),
        elements: SAMPLE_ELEMENTS_VM.map((e) => ({ ...e }))
    };
}

/** "Start from a layout" — an empty form in the chosen shell, object picked on use. */
export function bareLayoutTemplate(archetype) {
    const label = LAYOUT_LABELS[archetype] || archetype;
    return {
        id: `layout-${archetype}`,
        source: 'layout',
        name: `${label} layout`,
        category: 'layout',
        description: `Start from the ${label} layout with an empty form.`,
        icon: 'utility:layout',
        formType: 'Form',
        suggestedObject: '',
        suggestedObjectLabel: '',
        layoutMode: 'Single_Page',
        archetype,
        themeId: 'cloud', skinId: 'light',
        adapters: ['Internal_Record_Page'],
        header: { title: 'New form', subtitle: '' },
        sections: [{ title: 'Details', gridColumns: 1, elements: [] }]
    };
}

// Generic demo logo (inline SVG data URI — no binary asset to manage). A blue
// SLDS-ish badge + "AcmeForms" wordmark; used only to show how a header logo
// looks in previews.
const SAMPLE_LOGO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="138" height="36" viewBox="0 0 138 36">' +
    '<rect x="0" y="2" width="32" height="32" rx="8" fill="#0176d3"/>' +
    '<rect x="9" y="11" width="14" height="2.6" rx="1.3" fill="#ffffff"/>' +
    '<rect x="9" y="16.7" width="14" height="2.6" rx="1.3" fill="#ffffff"/>' +
    '<rect x="9" y="22.4" width="9" height="2.6" rx="1.3" fill="#ffffff"/>' +
    '<text x="42" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="#16325c">Acme</text>' +
    '<text x="84" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" fill="#0176d3">Forms</text>' +
    '</svg>';
export const SAMPLE_LOGO = 'data:image/svg+xml,' + encodeURIComponent(SAMPLE_LOGO_SVG);

// Header shown in a layout preview so logo + title + subtitle are demoed.
export const SAMPLE_HEADER = {
    title: 'Your form title',
    subtitle: 'A short subtitle your respondents will read first.',
    logo: SAMPLE_LOGO
};

/** A saved Form_Template__c (TemplateDTO) → the unified template shape. */
export function customRecordToTemplate(dto) {
    let def = {};
    try {
        def = JSON.parse(dto.definition || '{}');
    } catch {
        def = {};
    }
    return {
        id: dto.id,
        source: 'custom',
        name: dto.name,
        category: dto.category || 'custom',
        description: def.description || '',
        icon: def.icon || 'standard:form',
        formType: def.formType || 'Form',
        suggestedObject: def.suggestedObject || '',
        suggestedObjectLabel: def.suggestedObjectLabel || '',
        layoutMode: def.layoutMode || 'Single_Page',
        archetype: def.archetype || 'stacked',
        themeId: def.themeId || 'cloud', skinId: def.skinId || 'light',
        adapters: def.adapters || ['Internal_Record_Page'],
        // Custom templates store ready-to-use payloads (already object-bound):
        bodyJson: def.bodyJson || '',
        specJson: def.specJson || '',
        customCss: def.customCss || ''
    };
}

/**
 * A stored Layout_Config body → engine preview parts (pages/sections/elements).
 * Mirrors c/formViewer.flattenBody minus visibility — used to preview a saved
 * custom template whose body is already expanded (not authoring shape).
 */
export function bodyToEngineParts(body) {
    const pages = [];
    const sections = [];
    const elements = [];
    let order = 0;
    const rawPages = Array.isArray(body && body.pages) ? body.pages : [];
    rawPages.forEach((p, pi) => {
        const pageKey = p.id || `p${pi + 1}`;
        pages.push({ key: pageKey, label: p.name, order: pi + 1 });
        (p.sections || []).forEach((s, si) => {
            const secKey = s.id || `${pageKey}_s${si + 1}`;
            sections.push({
                key: secKey, pageKey, title: s.name,
                gridColumns: s.gridColumns || 1, order: order + 1
            });
            (s.elements || []).forEach((el) => {
                order += 1;
                elements.push({
                    key: el.id || `${secKey}_e${order}`,
                    sectionKey: secKey,
                    label: el.name || el.fieldApiName || el.type,
                    type: el.type || 'Field',
                    required: el.uiBehavior === 'Required',
                    order
                });
            });
        });
    });
    return { pages, sections, elements };
}
