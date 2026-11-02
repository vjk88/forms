/**
 * Shared fixtures for the PDF tests: the real vendored pdf-lib + fontkit
 * (the same files the browser loads from the formPdf static resource), real
 * brand fonts from formPdfFonts, and a spec that uses every block kind.
 */
/* global require, __dirname, Buffer */
const fs = require('fs');
const path = require('path');

const RES = path.resolve(__dirname, '../../../../staticresources');

export function loadLib() {
    const lib = require(path.join(RES, 'formPdf/pdf-lib.min.js'));
    const fontkit = require(path.join(RES, 'formPdf/fontkit.umd.min.js'));
    return { lib, fontkit };
}

export function fontBytes(file) {
    return new Uint8Array(fs.readFileSync(path.join(RES, 'formPdfFonts', file)));
}

/** A 2×2 PNG, so image paths run without network or canvas. */
export const PNG_2X2 = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWNgYGD4z8DAwMDAwMDAAAAJAAEQ0pW5AAAAAElFTkSuQmCC',
        'base64'
    )
);

export const SPEC = {
    specVersion: 1,
    form: { name: 'Volunteer sign-up', type: 'survey' },
    header: {
        title: 'Volunteer sign-up',
        description: 'Tell us how you would like to help this season.',
        brandName: 'Green Valley Trust',
        logo: { url: '/logo.png', versionId: '068000000000001' }
    },
    pages: [
        {
            id: 'pg1',
            name: 'About you',
            sections: [
                {
                    id: 'sec1',
                    title: 'Contact',
                    description: 'So we can reach you.',
                    elements: [
                        { id: 'el_name', type: 'field', label: 'Full name', required: true, config: { inputType: 'text' } },
                        { id: 'el_email', type: 'field', label: 'Email', required: true, config: { inputType: 'email' } },
                        { id: 'el_date', type: 'field', label: 'Available from', config: { inputType: 'date' } },
                        {
                            id: 'el_role',
                            type: 'field',
                            label: 'Preferred role',
                            config: {
                                inputType: 'picklist',
                                renderAs: 'Radio_Buttons',
                                options: [
                                    { value: 'trail', label: 'Trail maintenance' },
                                    { value: 'guide', label: 'Guided walks' },
                                    { value: 'office', label: 'Office help' }
                                ]
                            }
                        },
                        { id: 'el_notes', type: 'field', label: 'Anything else we should know?', config: { inputType: 'textarea' } },
                        { id: 'el_hidden', type: 'field', label: 'Hidden by a rule', config: { inputType: 'text' } }
                    ]
                }
            ]
        },
        {
            id: 'pg2',
            name: 'Your experience',
            sections: [
                {
                    id: 'sec2',
                    title: 'Experience',
                    elements: [
                        { id: 'el_rt', type: 'richText', config: { html: '<p>Please answer <strong>honestly</strong>. There are no wrong answers.</p><ul><li>First point</li><li>Second point</li></ul>' } },
                        { id: 'el_nps', type: 'nps', label: 'How likely are you to recommend us?', config: {} },
                        { id: 'el_lik', type: 'likert', label: 'I enjoy working outdoors', config: {} },
                        {
                            id: 'el_mx',
                            type: 'matrix',
                            label: 'Rate these activities',
                            config: { rows: [{ value: 'a', label: 'Planting' }, { value: 'b', label: 'Litter picking' }] }
                        },
                        { id: 'el_yn', type: 'yesNo', label: 'Have you volunteered before?', config: {} },
                        { id: 'el_img', type: 'image', config: { src: '/logo.png', size: 'small', alt: 'Logo' } },
                        { id: 'el_consent', type: 'consent', label: 'Consent', config: { html: '<p>I agree to the volunteer code of conduct.</p>' } }
                    ]
                },
                {
                    id: 'sec_rep',
                    title: 'Emergency contacts',
                    repeat: { entryLabel: 'Contact {index}' },
                    elements: [
                        { id: 'el_rname', type: 'field', label: 'Name', config: { inputType: 'text' } },
                        { id: 'el_rphone', type: 'field', label: 'Phone', config: { inputType: 'phone' } }
                    ]
                }
            ]
        }
    ]
};

export const PAYLOAD = {
    answers: {
        el_name: 'Ana María Ünal',
        el_email: 'ana@example.org',
        el_date: '2026-11-14',
        el_role: 'guide',
        el_notes: 'I have first-aid training.\nAvailable on weekends only.',
        el_hidden: 'should never print',
        el_nps: 9,
        el_lik: 4,
        el_mx: { a: 3 },
        el_yn: true,
        el_consent: true
    },
    repeats: {
        sec_rep: [
            { el_rname: 'Sam Ünal', el_rphone: '+44 20 7946 0000' },
            { el_rname: 'Lee Park', el_rphone: '' }
        ]
    }
};

export const TOKENS = {
    '--c-text': '#1c2b2a',
    '--c-text-weak': '#4b5d5b',
    '--c-accent': '#2f7d4f',
    '--c-on-accent': '#ffffff',
    '--c-page-bg': '#eef4ef',
    '--c-header-bg': 'rgba(31, 79, 54, 1)',
    '--c-header-text': '#ffffff',
    '--c-header-text-weak': 'color-mix(in srgb, #ffffff 80%, transparent)',
    '--c-field-border': '#9fb3a8',
    '--c-radius': '8px',
    '--c-font-body': '"FormsBundledDMSans", system-ui, sans-serif',
    '--c-font-display': '"FormsBundledFraunces", Georgia, serif'
};
