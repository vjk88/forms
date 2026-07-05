import { LightningElement, api } from 'lwc';

/**
 * finalNavScroll — continuous-flow nav primitive (catalog §2 contract).
 *
 * Dumb by contract: accepts the shared inputs, renders all pages in one scroll,
 * owns zero validation/submission logic. Scroll has no pagination chrome, so
 * `currentPageIndex` / `pageValidity` are accepted (contract) but unused here.
 * Section arrangement is finalLayoutZones' job — pages arrive with their zones
 * config already merged (layout.zonesDefault + page override) by the viewer.
 */
export default class FinalNavScroll extends LightningElement {
    @api pages = [];
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Presentation option: page labels become dividers when > 1 page. */
    @api showDividers = false;

    get pageList() {
        return (this.pages || []).map((page, index) => ({
            ...page,
            key: page.id || `pg_${index}`,
            sections: page.sections || []
        }));
    }

    get showPageDividers() {
        return this.showDividers && (this.pages || []).length > 1;
    }
}
