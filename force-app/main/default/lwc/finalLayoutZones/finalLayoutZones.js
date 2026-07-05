import { LightningElement, api } from 'lwc';

/**
 * finalLayoutZones — arranges one page's sections into columns / grid (catalog §1).
 *
 * Owns the section loop so every nav primitive renders pages the same way.
 * Collapse is a CONTAINER query, never viewport (UIUX review #12): the
 * early/standard/late enum maps to container-width constants that live in the
 * CSS — raw px never crosses the wire.
 *
 * `collapseOrder` accepts only "source" today: schema §4 has no per-section
 * priority key yet, so source order IS the complete implementation — no dead
 * "priority" control is rendered anywhere until the schema can express it.
 */

const ARRANGEMENT_CLASS = {
    single: 'arr-single',
    twoCol: 'arr-twocol',
    grid: 'arr-grid',
    bento: 'arr-bento'
};

const GAP_CLASS = { sm: 'gap-sm', md: 'gap-md', lg: 'gap-lg' };

const COLLAPSE_CLASS = {
    early: 'collapse-early',
    standard: 'collapse-standard',
    late: 'collapse-late'
};

export default class FinalLayoutZones extends LightningElement {
    /** The page's sections (schema §4). */
    @api sections = [];
    /** Merged zones config: layout.zonesDefault + the page's sparse override. */
    @api zones;

    get sectionList() {
        return this.sections || [];
    }

    get gridClass() {
        const z = this.zones || {};
        const arr = ARRANGEMENT_CLASS[z.arrangement] || ARRANGEMENT_CLASS.single;
        const gap = GAP_CLASS[z.gap] || GAP_CLASS.md;
        const collapse = COLLAPSE_CLASS[z.collapse] || COLLAPSE_CLASS.standard;
        return `zone-grid ${arr} ${gap} ${collapse}`;
    }
}
