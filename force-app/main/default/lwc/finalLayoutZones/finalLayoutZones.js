import { LightningElement, api } from 'lwc';

/**
 * finalLayoutZones — arranges one page's sections into columns / grid (catalog §1).
 *
 * Owns the section loop so every nav primitive renders pages the same way.
 * Collapse to one column is a CONTAINER query, never viewport (UIUX review
 * #12), at a fixed 540px constant in the CSS. (The early/standard/late
 * `collapse` enum was deleted 2026-07-18 — sweep DELETE ruling: no writer
 * ever existed. Same for `collapseOrder`.)
 */

const ARRANGEMENT_CLASS = {
    single: 'arr-single',
    twoCol: 'arr-twocol',
    grid: 'arr-grid',
    bento: 'arr-bento'
};

const GAP_CLASS = { sm: 'gap-sm', md: 'gap-md', lg: 'gap-lg' };

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
        const arr =
            ARRANGEMENT_CLASS[z.arrangement] || ARRANGEMENT_CLASS.single;
        const gap = GAP_CLASS[z.gap] || GAP_CLASS.md;
        return `zone-grid ${arr} ${gap}`;
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
