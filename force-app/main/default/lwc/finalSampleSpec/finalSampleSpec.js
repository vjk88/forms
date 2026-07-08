import { getBrandCopy } from 'c/finalThemeCatalog';

/**
 * finalSampleSpec — the canned FORM_SPEC_SCHEMA v1 spec every pre-save preview
 * renders (creation flow step 3; any future "try this layout" surface).
 *
 * Three pages so paginated layouts (stepper/tabs/rail/oneAtATime/splitHero)
 * demo their navigation instead of looking empty — same trick as the old
 * build's sampleLayoutParts. Elements are unbound (`binding: null`): this is
 * display-only demo furniture, never submitted.
 */

const SAMPLE_PAGES = [
    {
        id: 'pg_sample_about',
        name: 'About you',
        sections: [
            {
                id: 'sec_sample_contact',
                title: 'Contact',
                style: 'card',
                columns: 2,
                elements: [
                    field('first', 'First name', 'text', true),
                    field('last', 'Last name', 'text', true),
                    field('email', 'Email', 'email', true),
                    field('phone', 'Phone', 'phone', false)
                ]
            },
            {
                id: 'sec_sample_address',
                title: 'Address',
                style: 'card',
                columns: 2,
                elements: [
                    field('street', 'Street', 'text', false),
                    field('city', 'City', 'text', false)
                ]
            }
        ]
    },
    {
        id: 'pg_sample_needs',
        name: 'Your needs',
        sections: [
            {
                id: 'sec_sample_project',
                title: 'Project',
                style: 'card',
                columns: 1,
                elements: [
                    field('date', 'Preferred date', 'date', false),
                    field('notes', 'Tell us more', 'textarea', false)
                ]
            }
        ]
    },
    {
        id: 'pg_sample_wrap',
        name: 'Wrap up',
        sections: [
            {
                id: 'sec_sample_confirm',
                title: 'Confirm',
                style: 'card',
                columns: 1,
                elements: [
                    field('updates', 'Send me updates', 'checkbox', false)
                ]
            }
        ]
    }
];

function field(key, label, inputType, required) {
    return {
        id: `el_sample_${key}`,
        type: 'field',
        binding: null,
        label,
        labelPosition: 'top',
        required,
        config: { inputType }
    };
}

/**
 * Build the sample spec for a layout + theme choice.
 * @param {object} opts
 * @param {string} opts.layout    registry layout key (scroll|stepper|…)
 * @param {string} [opts.paneFlow]  splitHero pane flow ('pages'|'oneAtATime')
 * @param {string} [opts.themeKey]  builtin theme catalog key
 * @param {string} [opts.title]     live title (the typed form name) — falls
 *                                  back to the theme's brand copy
 */
export function buildSampleSpec({ layout, paneFlow, themeKey, title } = {}) {
    const brand = getBrandCopy(themeKey);
    const options = {};
    if (layout === 'splitHero' && paneFlow === 'oneAtATime') {
        options.paneFlow = 'oneAtATime';
    }
    const spec = {
        specVersion: 1,
        form: { name: title || brand.title, type: 'form' },
        layout: {
            type: layout || 'scroll',
            options,
            // no maxWidth: unset = "Layout default" (carded panels read
            // medium; bleed layouts keep their locked column) — pinning
            // 'medium' here made the harness silently pick FOR the user
            zonesDefault: { arrangement: 'single', gap: 'md' }
        },
        header: {
            style: 'standard',
            arrangement: 'stacked',
            title: title || brand.title,
            description: brand.subtitle
        },
        submit: { label: 'Submit' },
        pages: JSON.parse(JSON.stringify(SAMPLE_PAGES))
    };
    if (themeKey) {
        spec.theme = { source: 'builtin', name: themeKey };
    }
    return spec;
}
