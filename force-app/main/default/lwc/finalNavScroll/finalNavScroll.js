import { LightningElement, api } from 'lwc';
import { isRealPageName } from 'c/finalPageName';

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
        const dividers = this.showPageDividers;
        return (this.pages || []).map((page, index) => {
            // A divider heads a page only when the page has a name somebody
            // chose. A placeholder ("Page 3") would become the loudest heading
            // there is, so that divider keeps its line, drops the words from
            // sight, and the section titles under it keep their full size.
            const named = dividers && isRealPageName(page.name);
            return {
                ...page,
                key: page.id || `pg_${index}`,
                sections: page.sections || [],
                named,
                quietClass:
                    index === 0
                        ? 'divider divider-quiet divider-first'
                        : 'divider divider-quiet',
                // Under a real divider the sections' titles are subheadings
                // (smaller); otherwise they are the top-level headings and
                // keep their size.
                zonesClass: named ? 'zones-under-divider' : ''
            };
        });
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
