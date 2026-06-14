/**
 * c/layoutFixtures — T20 shared test/seed data (PHASE1_WORKPLAN §3).
 *
 * Pure data + factory helpers. NO imports (so layoutModel tests, engine
 * tests, the T17 harness and future copilot tests can all consume it without
 * dependency cycles). The same JSON shapes feed the Apex validator tests —
 * keep error-code expectations in sync with FormLayoutSpecValidator.
 */

// --------------------------------------------------------------- seed data
// Minimal seed used across the layoutModel suite.
export const PAGES_BASIC = [
    { key: 'p_main', order: 1 },
    { key: 'p_extra', order: 2 }
];
export const SECTIONS_BASIC = [
    { key: 'sec_contact', pageKey: 'p_main', order: 1 },
    { key: 'sec_address', pageKey: 'p_main', order: 2 },
    { key: 'sec_details', pageKey: 'p_extra', order: 3 },
    { key: 'sec_consent', pageKey: 'p_extra', order: 4 }
];

// Rich seeds (harness presets + engine tests). Shape = engine @api contract.
export const SEEDS = {
    contact: {
        label: 'Contact request (2 pages, 3 sections)',
        formTitle: 'Contact Request',
        formDescription: 'Tell us how to reach you.',
        pages: [
            { key: 'p_main', label: 'Your details', order: 1 },
            { key: 'p_extra', label: 'Preferences', order: 2 }
        ],
        sections: [
            { key: 'sec_contact', pageKey: 'p_main', title: 'Contact', order: 1 },
            { key: 'sec_address', pageKey: 'p_main', title: 'Address', order: 2 },
            { key: 'sec_details', pageKey: 'p_extra', title: 'Details', order: 3 }
        ],
        elements: [
            { key: 'e1', sectionKey: 'sec_contact', label: 'First name', type: 'text', required: true, order: 1 },
            { key: 'e2', sectionKey: 'sec_contact', label: 'Last name', type: 'text', required: true, order: 2 },
            { key: 'e3', sectionKey: 'sec_contact', label: 'Email', type: 'email', required: true, order: 3 },
            { key: 'e4', sectionKey: 'sec_address', label: 'Street', type: 'text', order: 4 },
            { key: 'e5', sectionKey: 'sec_address', label: 'City', type: 'text', order: 5 },
            { key: 'e6', sectionKey: 'sec_details', label: 'Notes', type: 'textarea', order: 6 }
        ]
    },
    lead: {
        label: 'Lead capture (1 page, 2 sections)',
        formTitle: 'Get a Quote',
        formDescription: 'Two minutes, no obligation.',
        pages: [{ key: 'p_lead', label: 'About you', order: 1 }],
        sections: [
            { key: 'sec_company', pageKey: 'p_lead', title: 'Company', order: 1 },
            { key: 'sec_needs', pageKey: 'p_lead', title: 'What do you need?', order: 2 }
        ],
        elements: [
            { key: 'l1', sectionKey: 'sec_company', label: 'Company', type: 'text', required: true, order: 1 },
            { key: 'l2', sectionKey: 'sec_company', label: 'Employees', type: 'number', order: 2 },
            { key: 'l3', sectionKey: 'sec_needs', label: 'Budget', type: 'currency', order: 3 },
            { key: 'l4', sectionKey: 'sec_needs', label: 'Timeline', type: 'picklist', order: 4 }
        ]
    },
    caseIntake: {
        label: 'Case intake (3 pages, 5 sections)',
        formTitle: 'Support Case',
        formDescription: 'Describe the issue and we will route it.',
        pages: [
            { key: 'p_who', label: 'Who', order: 1 },
            { key: 'p_what', label: 'What happened', order: 2 },
            { key: 'p_review', label: 'Review', order: 3 }
        ],
        sections: [
            { key: 'sec_requester', pageKey: 'p_who', title: 'Requester', order: 1 },
            { key: 'sec_product', pageKey: 'p_what', title: 'Product', order: 2 },
            { key: 'sec_issue', pageKey: 'p_what', title: 'Issue', order: 3 },
            { key: 'sec_attachments', pageKey: 'p_what', title: 'Attachments', order: 4 },
            { key: 'sec_summary', pageKey: 'p_review', title: 'Summary', order: 5 }
        ],
        elements: [
            { key: 'c1', sectionKey: 'sec_requester', label: 'Name', type: 'text', required: true, order: 1 },
            { key: 'c2', sectionKey: 'sec_requester', label: 'Email', type: 'email', required: true, order: 2 },
            { key: 'c3', sectionKey: 'sec_product', label: 'Product', type: 'picklist', required: true, order: 3 },
            { key: 'c4', sectionKey: 'sec_product', label: 'Version', type: 'text', order: 4 },
            { key: 'c5', sectionKey: 'sec_issue', label: 'Severity', type: 'picklist', required: true, order: 5 },
            { key: 'c6', sectionKey: 'sec_issue', label: 'Description', type: 'textarea', required: true, order: 6 },
            { key: 'c7', sectionKey: 'sec_attachments', label: 'Screenshot', type: 'file', order: 7 },
            { key: 'c8', sectionKey: 'sec_summary', label: 'Anything else?', type: 'textarea', order: 8 }
        ]
    }
};

// ---------------------------------------------------------------- live seeds
// T2.2 harness Live mode: elements in the body-JSON shape the section
// renderer consumes (type/fieldApiName/renderAs/uiBehavior/…) against REAL
// standard objects. Between the two seeds all 14 element kinds appear.
SEEDS.contactLive = {
    label: 'LIVE: Contact (statics + toggle/radio/dropdown/consent/file)',
    objectApiName: 'Contact',
    formTitle: 'Contact Intake (live)',
    formDescription: 'Real record-edit-form against Contact.',
    pages: [
        { key: 'p_who', label: 'Who', order: 1 },
        { key: 'p_extra', label: 'Extras', order: 2 }
    ],
    sections: [
        { key: 'sec_name', pageKey: 'p_who', title: 'Name', order: 1, gridColumns: 2 },
        { key: 'sec_reach', pageKey: 'p_who', title: 'How to reach you', order: 2 },
        { key: 'sec_static', pageKey: 'p_extra', title: 'Statics', order: 3 }
    ],
    elements: [
        { key: 'lc1', sectionKey: 'sec_name', order: 1, type: 'Field', fieldApiName: 'FirstName', name: 'First name', label: 'First name' },
        { key: 'lc2', sectionKey: 'sec_name', order: 2, type: 'Field', fieldApiName: 'LastName', name: 'Last name', label: 'Last name', uiBehavior: 'Required' },
        { key: 'lc3', sectionKey: 'sec_name', order: 3, type: 'Field', fieldApiName: 'Salutation', name: 'Salutation', label: 'Salutation', renderAs: 'Dropdown' },
        { key: 'lc4', sectionKey: 'sec_name', order: 4, type: 'Field', fieldApiName: 'LeadSource', name: 'How did you hear about us?', label: 'Lead source', renderAs: 'Radio_Buttons' },
        { key: 'lc5', sectionKey: 'sec_reach', order: 5, type: 'Field', fieldApiName: 'Email', name: 'Email', label: 'Email', uiBehavior: 'Required' },
        { key: 'lc6', sectionKey: 'sec_reach', order: 6, type: 'Field', fieldApiName: 'DoNotCall', name: 'Do not call me', label: 'Do not call', renderAs: 'Toggle' },
        { key: 'lc7', sectionKey: 'sec_reach', order: 7, type: 'Field', fieldApiName: 'Department', name: 'Preferred channels', label: 'Preferred channels', renderAs: 'Custom_MultiSelect', customOptionsJson: '[{"label":"Email","value":"Email"},{"label":"Phone","value":"Phone"},{"label":"SMS","value":"SMS"}]' },
        { key: 'lc8', sectionKey: 'sec_static', order: 8, type: 'Rich_Text', label: 'Intro', content: '<p>This block is <b>display text</b> — never submitted.</p>' },
        { key: 'lc9', sectionKey: 'sec_static', order: 9, type: 'Callout', label: 'Callout', content: 'Heads up: live harness — submits nothing.', calloutVariant: 'warning' },
        { key: 'lc10', sectionKey: 'sec_static', order: 10, type: 'Divider', label: 'Divider' },
        { key: 'lc11', sectionKey: 'sec_static', order: 11, type: 'Image', label: 'Image', imageUrl: 'https://picsum.photos/400/120', imageAlt: 'Sample', imageSize: 'small' },
        { key: 'lc12', sectionKey: 'sec_static', order: 12, type: 'Spacer', label: 'Spacer', spacerSize: 'medium' },
        { key: 'lc13', sectionKey: 'sec_static', order: 13, type: 'Consent', label: 'Consent', content: 'I agree to the <b>terms</b>.', consentRequired: true },
        { key: 'lc14', sectionKey: 'sec_static', order: 14, type: 'File_Upload', name: 'Attachment', label: 'Attachment' }
    ]
};
SEEDS.accountLive = {
    label: 'LIVE: Account (slider + repeater)',
    objectApiName: 'Account',
    formTitle: 'Account Intake (live)',
    formDescription: 'Slider + related-contacts repeater.',
    pages: [{ key: 'p_acct', label: 'Account', order: 1 }],
    sections: [
        { key: 'sec_acct', pageKey: 'p_acct', title: 'Company', order: 1, gridColumns: 2 },
        {
            key: 'sec_people', pageKey: 'p_acct', title: 'People', order: 2,
            relatedSections: [{
                id: 'rep_contacts',
                name: 'Contacts',
                parentSObjectApi: 'Contact',
                linkingField: 'AccountId',
                displayStyle: 'stacked',
                elements: [
                    { type: 'Field', fieldApiName: 'FirstName', name: 'First name' },
                    { type: 'Field', fieldApiName: 'LastName', name: 'Last name', uiBehavior: 'Required' },
                    { type: 'Field', fieldApiName: 'Email', name: 'Email' }
                ]
            }]
        }
    ],
    elements: [
        { key: 'la1', sectionKey: 'sec_acct', order: 1, type: 'Field', fieldApiName: 'Name', name: 'Company name', label: 'Company name', uiBehavior: 'Required' },
        { key: 'la2', sectionKey: 'sec_acct', order: 2, type: 'Field', fieldApiName: 'Industry', name: 'Industry', label: 'Industry', renderAs: 'Dropdown' },
        { key: 'la3', sectionKey: 'sec_acct', order: 3, type: 'Field', fieldApiName: 'Rating', name: 'Rating', label: 'Rating', renderAs: 'Radio_Buttons' },
        { key: 'la4', sectionKey: 'sec_acct', order: 4, type: 'Field', fieldApiName: 'NumberOfEmployees', name: 'Employees', label: 'Employees', renderAs: 'Slider', sliderMin: 0, sliderMax: 500, sliderStep: 10 },
        { key: 'la5', sectionKey: 'sec_acct', order: 5, type: 'Field', fieldApiName: 'Description', name: 'Notes', label: 'Notes', uiBehavior: 'Read_Only' }
    ]
};

// ------------------------------------------------------------- valid specs
/** Hand-written known-good classic spec over PAGES_BASIC/SECTIONS_BASIC. */
export function baseSpec() {
    return {
        version: 1,
        archetype: 'classic',
        shell: { nav: 'scroll', chrome: 'card', maxWidth: 'medium', header: 'standard', progress: 'auto' },
        pages: [
            {
                pageKey: 'p_main',
                zones: [{ type: 'zone', span: 12, children: [{ type: 'stack', sections: ['sec_contact', 'sec_address'] }] }]
            },
            {
                pageKey: 'p_extra',
                zones: [{ type: 'zone', span: 12, children: [{ type: 'stack', sections: ['sec_details', 'sec_consent'] }] }]
            }
        ],
        responsive: { collapseBelow: '768px', collapseOrder: 'source' }
    };
}

/** A deeper valid spec: split zones + columns + sticky (engine/zones tests). */
export function deepSpec() {
    return {
        version: 1,
        archetype: 'mosaicGrid',
        density: 'compact',
        shell: { nav: 'scroll', chrome: 'fullbleed', maxWidth: 'wide', header: 'hero', progress: 'none' },
        pages: [
            {
                pageKey: 'p_main',
                zones: [
                    {
                        type: 'zone',
                        span: 8,
                        children: [
                            { type: 'columns', ratio: [1, 1], tracks: [['sec_contact'], ['sec_address']] },
                            { type: 'stack', sections: ['sec_details'] }
                        ]
                    },
                    { type: 'zone', span: 4, sticky: true, children: [{ type: 'stack', sections: ['sec_consent'] }] }
                ]
            }
        ],
        responsive: { collapseBelow: '1024px', collapseOrder: 'mainFirst' }
    };
}

// ----------------------------------------------------------- invalid specs
// expectCode values MUST match validateSpec (JS) AND FormLayoutSpecValidator
// (Apex) — both validators are asserted against this same matrix.
function mutated(fn) {
    const s = baseSpec();
    fn(s);
    return s;
}

export const INVALID_SPECS = [
    { name: 'wrong version', expectCode: 'bad-version', spec: mutated((s) => { s.version = 2; }) },
    { name: 'missing archetype', expectCode: 'bad-archetype', spec: mutated((s) => { delete s.archetype; }) },
    { name: 'unknown nav', expectCode: 'invalid-enum', spec: mutated((s) => { s.shell.nav = 'diagonal'; }) },
    { name: 'no pages', expectCode: 'bad-pages', spec: mutated((s) => { s.pages = []; }) },
    { name: 'duplicate pageKey', expectCode: 'duplicate-key', spec: mutated((s) => { s.pages[1].pageKey = 'p_main'; }) },
    {
        name: 'section placed twice',
        expectCode: 'duplicate-section',
        spec: mutated((s) => { s.pages[1].zones[0].children[0].sections.push('sec_contact'); })
    },
    { name: 'zone span 13', expectCode: 'bad-span', spec: mutated((s) => { s.pages[0].zones[0].span = 13; }) },
    {
        name: 'ratio out of range',
        expectCode: 'bad-ratio',
        spec: mutated((s) => {
            s.pages[0].zones[0].children = [{ type: 'columns', ratio: [5, 1], tracks: [['sec_contact'], ['sec_address']] }];
        })
    },
    {
        name: 'ratio/tracks mismatch',
        expectCode: 'ratio-tracks-mismatch',
        spec: mutated((s) => {
            s.pages[0].zones[0].children = [{ type: 'columns', ratio: [1, 1], tracks: [['sec_contact']] }];
        })
    },
    {
        name: 'nested columns',
        expectCode: 'bad-node-type',
        spec: mutated((s) => {
            s.pages[0].zones[0].children = [{ type: 'grid', sections: ['sec_contact'] }];
        })
    },
    {
        name: 'stepperPlacement without stepper nav',
        expectCode: 'incompatible',
        spec: mutated((s) => { s.shell.stepperPlacement = 'rail'; })
    },
    { name: 'unknown top-level key', expectCode: 'unknown-key', spec: mutated((s) => { s.surprise = true; }) },
    {
        name: 'brandPanel width out of range',
        expectCode: 'bad-width',
        spec: mutated((s) => { s.shell.brandPanel = { side: 'left', width: '60%' }; })
    },
    { name: 'bad collapseBelow', expectCode: 'invalid-enum', spec: mutated((s) => { s.responsive.collapseBelow = '999px'; }) }
];

// ------------------------------------------------------------ orphan cases
// For normalize(): nothing ever disappears (LAYOUT_SPEC §5).
export const ORPHAN_CASES = [
    {
        name: 'data section missing from spec → appended to its page',
        spec: mutated((s) => { s.pages[0].zones[0].children[0].sections = ['sec_contact']; }),
        pages: PAGES_BASIC,
        sections: SECTIONS_BASIC,
        expectAppended: ['sec_address'],
        expectDropped: []
    },
    {
        name: 'spec references a key not in data → dropped with warning',
        spec: mutated((s) => { s.pages[0].zones[0].children[0].sections.push('sec_ghost'); }),
        pages: PAGES_BASIC,
        sections: SECTIONS_BASIC,
        expectAppended: [],
        expectDropped: ['sec_ghost']
    }
];

// ---------------------------------------------------------- conflict cases
// For rebaseOps(): ops whose targets vanished/moved in the new base spec.
export const CONFLICT_OPS = [
    { op: 'moveSection', sectionKey: 'sec_ghost', target: { pageKey: 'p_main', zoneIndex: 0, childIndex: 0 } },
    { op: 'splitColumns', pageKey: 'p_gone', zoneIndex: 0, childIndex: 0, ratio: [1, 1] },
    { op: 'setZones', pageKey: 'p_gone', spans: [8, 4] }
];
