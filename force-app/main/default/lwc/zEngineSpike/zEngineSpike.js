import { LightningElement } from 'lwc';
import { materialize, applyOps } from 'c/layoutModel';
import { LAYOUT_TEMPLATES } from 'c/formThemes';

/**
 * T1 spike + first smoke harness. Add to a Lightning app page AND an
 * Experience Cloud page (guest) — if the form renders on both, literal
 * dynamic import() of shells works on both surfaces. Record results in
 * docs/redesign/SPIKE_RESULTS.md. Throwaway: superseded by T17 harness.
 */
const PAGES = [
    { key: 'p_main', label: 'Your details', order: 1 },
    { key: 'p_extra', label: 'Preferences', order: 2 }
];
const SECTIONS = [
    { key: 'sec_contact', pageKey: 'p_main', title: 'Contact', order: 1 },
    { key: 'sec_address', pageKey: 'p_main', title: 'Address', order: 2 },
    { key: 'sec_details', pageKey: 'p_extra', title: 'Details', order: 3 }
];
const ELEMENTS = [
    { key: 'e1', sectionKey: 'sec_contact', label: 'First name', type: 'text', required: true, order: 1 },
    { key: 'e2', sectionKey: 'sec_contact', label: 'Last name', type: 'text', required: true, order: 2 },
    { key: 'e3', sectionKey: 'sec_contact', label: 'Email', type: 'email', required: true, order: 3 },
    { key: 'e4', sectionKey: 'sec_address', label: 'Street', type: 'text', order: 4 },
    { key: 'e5', sectionKey: 'sec_address', label: 'City', type: 'text', order: 5 },
    { key: 'e6', sectionKey: 'sec_details', label: 'Notes', type: 'textarea', order: 6 }
];

export default class ZEngineSpike extends LightningElement {
    pages = PAGES;
    sections = SECTIONS;
    elements = ELEMENTS;
    skin = LAYOUT_TEMPLATES.classic;
    spec = materialize('classic', PAGES, SECTIONS);
    status = 'Engine mounted — if sections render below, dynamic shell import works on this surface.';

    // Exercises applyOps end-to-end: split the first page into 1:1 columns.
    handleSplit() {
        const { spec, errors } = applyOps(this.spec, [
            { op: 'splitColumns', pageKey: 'p_main', zoneIndex: 0, childIndex: 0, ratio: [1, 1] }
        ]);
        this.status = errors.length ? `applyOps rejected: ${errors[0].message}` : 'applyOps OK — page 1 is now two columns.';
        if (!errors.length) this.spec = spec;
    }

    handleMissingShell() {
        const { spec, errors } = applyOps(this.spec, [{ op: 'setArchetype', archetype: 'mosaicGrid' }]);
        this.status = errors.length
            ? `setArchetype rejected: ${errors[0].message}`
            : 'Switched to mosaicGrid — engine should show a friendly "not implemented" notice (shell lands in T13).';
        if (!errors.length) this.spec = spec;
    }
}