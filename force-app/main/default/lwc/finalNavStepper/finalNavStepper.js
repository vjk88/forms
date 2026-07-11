import { LightningElement, api } from 'lwc';

/**
 * finalNavStepper — wizard-steps nav primitive (catalog §2).
 *
 * Dumb by contract: renders the step control + the CURRENT page only, dispatches
 * `pagechange` intent on step clicks, and hosts the shared submitBar in its
 * actions slot (slotted from the engine's template, so button events never
 * cross this shadow boundary). Owns THE one progress indicator (checklist #3).
 *
 * Gating renders from `pageValidity` (engine-computed truth, never computed
 * here): in gated mode a step is reachable up to and including the first
 * not-yet-valid page; free mode reaches everything.
 */

const MODES = new Set(['numbered', 'dots', 'progressBar']);

export default class FinalNavStepper extends LightningElement {
    @api pages = [];
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Spec layout.options: { mode, navigation, showStepCount, narrowMode } */
    @api options;

    get opts() {
        return this.options || {};
    }

    get mode() {
        return MODES.has(this.opts.mode) ? this.opts.mode : 'numbered';
    }

    get isProgressBar() {
        return this.mode === 'progressBar';
    }

    /**
     * Two nested divs on purpose: `.stepper` is the size container, `.layout`
     * carries the queried classes — a container query can never style its own
     * container, so they must live on a descendant. The strip always sits on
     * top (owner 2026-07-11: left-rail placement removed).
     */
    get layoutClass() {
        return 'layout';
    }

    get stepsClass() {
        // Narrow collapse (container query flips it): dots by default, a
        // progress bar on request. The wide mode is untouched either way.
        const narrow =
            this.opts.narrowMode === 'progressBar'
                ? 'narrow-bar'
                : 'narrow-dots';
        return `steps mode-${this.mode} ${narrow}`;
    }

    /** The bar markup also mounts when it's only the NARROW collapse target —
     *  CSS shows exactly one of list/bar per container width. */
    get showBar() {
        return this.isProgressBar || this.opts.narrowMode === 'progressBar';
    }

    get showList() {
        return !this.isProgressBar;
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

    get stepList() {
        const current = this.currentPageIndex || 0;
        const gated = this.opts.navigation !== 'free';
        const reachable = this.firstBlocked;
        return (this.pages || []).map((page, index) => {
            const active = index === current;
            const done = index < current;
            const locked = gated && index > reachable;
            let cls = 'step-btn';
            if (active) cls += ' active';
            if (done) cls += ' done';
            return {
                key: page.id || `pg_${index}`,
                label: page.name || `Step ${index + 1}`,
                number: index + 1,
                index,
                cls,
                disabled: locked,
                ariaCurrent: active ? 'step' : null
            };
        });
    }

    get stepCountText() {
        return this.opts.showStepCount
            ? `Step ${(this.currentPageIndex || 0) + 1} of ${(this.pages || []).length}`
            : null;
    }

    get progressPercent() {
        const count = (this.pages || []).length;
        return count
            ? Math.round((((this.currentPageIndex || 0) + 1) / count) * 100)
            : 0;
    }

    get progressFillStyle() {
        // scaleX, not width — compositor-only animation (design hook: layout-transition)
        return `transform: scaleX(${this.progressPercent / 100})`;
    }

    /** One-item list so the keyed template remounts (and animates) per step. */
    get currentPageList() {
        const page = (this.pages || [])[this.currentPageIndex || 0];
        return page
            ? [{ ...page, key: page.id || `pg_${this.currentPageIndex}` }]
            : [];
    }

    handleStepClick(event) {
        const index = Number(event.currentTarget.dataset.index);
        if (index !== this.currentPageIndex) {
            this.dispatchEvent(
                new CustomEvent('pagechange', { detail: { index } })
            );
        }
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
