import { LightningElement, api } from 'lwc';

/**
 * c/shellTabbed — archetypes/tabbed-card.md
 * Pages as lightning-tabset tabs; free navigation (soft validation).
 * Progress fraction + submit in card footer.
 */
export default class ShellTabbed extends LightningElement {
    @api model;
    @api nav;
    @api mode;

    get showHeader() {
        const h = this.model && this.model.shell && this.model.shell.header;
        return h !== 'none' && !!(this.model && (this.model.header.title || this.model.header.description));
    }
    get currentTabValue() {
        return (this.nav && this.nav.currentPageKey) || (this.model && this.model.pages[0] && this.model.pages[0].pageKey);
    }
    get tabs() {
        if (!this.model || !this.nav) return this.model ? this.model.pages : [];
        return this.model.pages.map((p) => {
            const state = (this.nav.states && this.nav.states[p.pageKey]) || 'untouched';
            const isActive = p.pageKey === this.nav.currentPageKey;
            return {
                ...p,
                _tabLabel: p.label || 'Page',
                _stateIcon: state === 'complete' ? '✓' : state === 'error' ? '⚠' : '',
                _isActive: isActive
            };
        });
    }
    get progressLabel() {
        if (!this.nav) return '';
        const done = Object.values(this.nav.states || {}).filter((s) => s === 'complete').length;
        return `${done} of ${this.nav.total} done`;
    }
    get submitClass() {
        const a =
            (this.model &&
                this.model.shell &&
                this.model.shell.submit &&
                this.model.shell.submit.alignment) ||
            'right';
        return `footer-row align-${a}`;
    }

    handleTabSelect(e) {
        const pageKey = e.detail.value;
        if (pageKey && pageKey !== this.currentTabValue) {
            this.dispatchEvent(new CustomEvent('navrequest', { detail: { pageKey } }));
        }
    }
    fireSubmit() {
        this.dispatchEvent(new CustomEvent('submitrequest'));
    }
}
