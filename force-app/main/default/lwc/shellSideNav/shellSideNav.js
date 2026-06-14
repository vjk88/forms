import { LightningElement, api } from 'lwc';

/**
 * c/shellSideNav — archetypes/side-nav.md
 * Wide: vertical nav rail (240px) beside scrolling content.
 * Narrow (CSS container query): rail becomes a horizontally-scrollable top bar
 * of step chips — the active chip keeps its label, inactive chips collapse to
 * number dots (full label on hover via title/aria-label). Active chip is
 * auto-scrolled into view here in JS (CSS can't center the active element).
 */
export default class ShellSideNav extends LightningElement {
    @api model;
    @api nav;
    @api mode;

    _lastActiveKey;

    renderedCallback() {
        // Keep the active chip visible in the narrow scrollable top bar.
        const key = this.nav && this.nav.currentPageKey;
        if (!key || key === this._lastActiveKey) return;
        this._lastActiveKey = key;
        const rail = this.template.querySelector('.rail');
        if (!rail) return;
        // No-op when the rail isn't horizontally scrollable (i.e. wide/vertical).
        if (rail.scrollWidth <= rail.clientWidth + 2) return;
        const active = this.template.querySelector('.nav-item.is-current');
        if (!active) return;
        const target = active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;
        rail.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }

    get railItems() {
        if (!this.model || !this.nav) return [];
        return this.model.pages.map((p, i) => {
            const state = (this.nav.states && this.nav.states[p.pageKey]) || 'untouched';
            const isActive = p.pageKey === this.nav.currentPageKey;
            let cls = 'nav-item';
            if (isActive) cls += ' is-current';
            else if (state === 'complete') cls += ' is-complete';
            else if (state === 'error') cls += ' is-error';
            const label = p.label || `Section ${i + 1}`;
            return {
                key: p.pageKey,
                label,
                num: i + 1,
                itemClass: cls,
                stateLabel: state === 'complete' ? '✓' : state === 'error' ? '⚠' : '',
                ariaCurrent: isActive ? 'page' : undefined
            };
        });
    }
    get panePages() {
        // Multi-page: rail click swaps content (board §6). Single page: scroll.
        const pages = (this.model && this.model.pages) || [];
        if (pages.length > 1 && this.nav) {
            const found = pages.find((p) => p.pageKey === this.nav.currentPageKey);
            return found ? [found] : pages.slice(0, 1);
        }
        return pages;
    }
    get progressPct() {
        return this.nav ? this.nav.progressPct : 0;
    }
    get progressStyle() {
        return `width: ${this.progressPct}%;`;
    }
    get currentPageLabel() {
        if (!this.nav || !this.model) return '';
        const key = this.nav.currentPageKey;
        const page = this.model.pages.find((p) => p.pageKey === key);
        return (page && page.label) || '';
    }
    get mobileSummary() {
        return `${this.currentPageLabel} · ${this.nav ? this.nav.currentIndex + 1 : 0} of ${this.nav ? this.nav.total : 0}`;
    }

    handleRailClick(e) {
        const key = e.currentTarget.dataset.key;
        if (key) this.dispatchEvent(new CustomEvent('navrequest', { detail: { pageKey: key } }));
    }
    fireSubmit() {
        this.dispatchEvent(new CustomEvent('submitrequest'));
    }
}
