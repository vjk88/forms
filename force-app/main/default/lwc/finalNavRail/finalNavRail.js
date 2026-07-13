import { LightningElement, api, track } from 'lwc';
import { observeStuck } from 'c/finalStuck';

/**
 * finalNavRail — persistent side-nav primitive (catalog §2).
 *
 * A page list (and/or progress) beside the content pane. Free navigation by
 * default; `navigation: 'gated'` locks pages past the first not-yet-valid one
 * (opt-IN — the stepper's convention inverted, so existing rail forms keep
 * their jump-anywhere behavior). Dispatches `pagechange`, hosts the slotted
 * submitBar under the content.
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
    /** Spec layout.options: { side, railWidth, railContent, sticky, narrowBehavior, navigation } */
    @api options;

    @track drawerOpen = false;
    /** True only while the narrow chip row is pinned — its only painted state. */
    stuck = false;

    _disconnectStuck = null;

    disconnectedCallback() {
        if (this._disconnectStuck) {
            this._disconnectStuck();
            this._disconnectStuck = null;
        }
    }

    get opts() {
        return this.options || {};
    }

    get layoutClass() {
        const side = this.opts.side === 'right' ? 'side-right' : 'side-left';
        const width = RAIL_WIDTH_CLASS[this.opts.railWidth] || 'rail-standard';
        const narrow =
            this.opts.narrowBehavior === 'drawer'
                ? 'narrow-drawer'
                : 'narrow-topbar';
        // Sticky by DEFAULT (owner 2026-07-11): the rail is wayfinding — it
        // must survive the scroll. Opt out with an explicit sticky:false.
        const sticky = this.opts.sticky === false ? '' : ' sticky-rail';
        // Docked by DEFAULT (owner 2026-07-11): the whole page holds still —
        // background, header, rail — and ONLY the content column scrolls
        // (viewport-capped height, same model as splitHero's form pane).
        const dock = this.opts.dock === false ? '' : ' dock';
        return `layout ${side} ${width} ${narrow}${sticky}${dock}`;
    }

    /** Dock height = the viewport below this layout's own top edge. Measured
     *  once per mount (chrome + page/panel padding + header above us);
     *  --rail-dock-top feeds the CSS calc. Same posture as pageFrame's
     *  --frame-offset — LEX chrome height is stable, re-measuring jitters. */
    renderedCallback() {
        if (this._disconnectStuck === null) {
            this._disconnectStuck = observeStuck(
                this.template.querySelector('.stuck-sentinel'),
                this.template.querySelector('.rail'),
                (stuck) => {
                    this.stuck = stuck;
                }
            );
        }
        if (this._dockMeasured) {
            return;
        }
        const layout = this.template.querySelector('.layout');
        if (!layout) {
            return;
        }
        const top = Math.max(0, Math.round(layout.getBoundingClientRect().top));
        this.template.host.style.setProperty('--rail-dock-top', `${top}px`);
        this._dockMeasured = true;
    }

    get railClass() {
        let cls = this.drawerOpen ? 'rail drawer-open' : 'rail';
        // narrow topBar paint-when-pinned; wide rail has no surface to paint
        if (this.stuck) {
            cls += ' is-stuck';
        }
        return cls;
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

    /** Index of the first page the last validation run left invalid. */
    get firstBlocked() {
        const validity = this.pageValidity || [];
        for (let i = 0; i < (this.pages || []).length; i++) {
            if (!validity[i]) {
                return i;
            }
        }
        return (this.pages || []).length;
    }

    get pageList() {
        const current = this.currentPageIndex || 0;
        const gated = this.opts.navigation === 'gated';
        const reachable = this.firstBlocked;
        return (this.pages || []).map((page, index) => ({
            key: page.id || `pg_${index}`,
            label: page.name || `Page ${index + 1}`,
            number: index + 1,
            index,
            cls: index === current ? 'rail-link active' : 'rail-link',
            ariaCurrent: index === current ? 'page' : null,
            disabled: gated && index > reachable
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
        return page
            ? [{ ...page, key: page.id || `pg_${this.currentPageIndex}` }]
            : [];
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
            this.dispatchEvent(
                new CustomEvent('pagechange', { detail: { index } })
            );
        }
    }

    handleDrawerToggle() {
        this.drawerOpen = !this.drawerOpen;
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
