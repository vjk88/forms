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
    /** Spec layout.options — scroll reads only showDividers. */
    @api options;

    get pageList() {
        return (this.pages || []).map((page, index) => ({
            ...page,
            key: page.id || `pg_${index}`,
            sections: page.sections || []
        }));
    }

    get showPageDividers() {
        const show = Boolean(this.options && this.options.showDividers);
        return show && (this.pages || []).length > 1;
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
