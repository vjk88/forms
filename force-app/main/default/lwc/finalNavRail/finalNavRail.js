import { LightningElement, api, track } from 'lwc';

/**
 * finalNavRail — persistent side-nav primitive (catalog §2).
 *
 * A page list (and/or progress) beside the content pane. Free navigation;
 * dispatches `pagechange`, hosts the slotted submitBar under the content.
 * A11y: nav list of buttons with aria-current="page" on the active entry.
 *
 * Narrow behavior is an ENUM (contract): `topBar` collapses the rail to a
 * horizontal chip row; `drawer` hides it behind a Pages toggle. Both driven by
 * a container query — the drawer toggle exists in DOM only narrow (CSS shows it).
 */

const RAIL_WIDTH_CLASS = {
    narrow: 'rail-narrow',
    wide: 'rail-wide'
};

export default class FinalNavRail extends LightningElement {
    @api pages = [];
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Spec layout.options: { side, railWidth, railContent, sticky, narrowBehavior } */
    @api options;

    @track drawerOpen = false;

    get opts() {
        return this.options || {};
    }

    get layoutClass() {
        const side = this.opts.side === 'right' ? 'side-right' : 'side-left';
        const width = RAIL_WIDTH_CLASS[this.opts.railWidth] || 'rail-standard';
        const narrow =
            this.opts.narrowBehavior === 'drawer' ? 'narrow-drawer' : 'narrow-topbar';
        const sticky = this.opts.sticky ? ' sticky-rail' : '';
        return `layout ${side} ${width} ${narrow}${sticky}`;
    }

    get railClass() {
        return this.drawerOpen ? 'rail drawer-open' : 'rail';
    }

    get showPageList() {
        return this.opts.railContent !== 'progress';
    }

    get showProgress() {
        return (
            this.opts.railContent === 'progress' ||
            this.opts.railContent === 'both'
        );
    }

    get pageList() {
        const current = this.currentPageIndex || 0;
        return (this.pages || []).map((page, index) => ({
            key: page.id || `pg_${index}`,
            label: page.name || `Page ${index + 1}`,
            number: index + 1,
            index,
            cls: index === current ? 'rail-link active' : 'rail-link',
            ariaCurrent: index === current ? 'page' : null
        }));
    }

    get progressText() {
        return `${(this.currentPageIndex || 0) + 1} of ${(this.pages || []).length}`;
    }

    get progressFillStyle() {
        const count = (this.pages || []).length;
        const fraction = count ? ((this.currentPageIndex || 0) + 1) / count : 0;
        return `transform: scaleX(${fraction})`;
    }

    /** One-item list so the keyed template remounts (and animates) per page. */
    get currentPageList() {
        const page = (this.pages || [])[this.currentPageIndex || 0];
        return page ? [{ ...page, key: page.id || `pg_${this.currentPageIndex}` }] : [];
    }

    get drawerToggleLabel() {
        const page = (this.pages || [])[this.currentPageIndex || 0];
        return page && page.name ? page.name : 'Pages';
    }

    get drawerExpanded() {
        return this.drawerOpen ? 'true' : 'false';
    }

    handlePageClick(event) {
        const index = Number(event.currentTarget.dataset.index);
        this.drawerOpen = false;
        if (index !== this.currentPageIndex) {
            this.dispatchEvent(new CustomEvent('pagechange', { detail: { index } }));
        }
    }

    handleDrawerToggle() {
        this.drawerOpen = !this.drawerOpen;
    }
}
