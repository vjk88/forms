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

    get shell() {
        return (this.model && this.model.shell) || {};
    }
    get wrapperClass() {
        return `wrap chrome-${this.shell.chrome || 'card'}`;
    }
    get cardClass() {
        return `card maxw-${this.shell.maxWidth || 'narrow'}`;
    }
    get isPaper() {
        return this.shell.chrome === 'paper';
    }
    get submitInfo() {
        return this.shell.submit || { placement: 'flow', alignment: 'right' };
    }
    get isStickySubmit() {
        return this.submitInfo.placement === 'stickyBottom';
    }
    get footerClass() {
        const a = this.submitInfo.alignment || 'right';
        return `footer-row align-${a}${this.isStickySubmit ? ' is-sticky' : ''}`;
    }
    get progressSetting() {
        return this.shell.progress || 'auto';
    }
    get showProgressFraction() {
        return this.progressSetting !== 'none';
    }
    get showHeader() {
        const h = this.shell.header;
        const hd = (this.model && this.model.header) || {};
        return h !== 'none' && !!(hd.title || hd.description || hd.logo || hd.highlight);
    }
    get highlightVariant() {
        return this.shell.header === 'hero' ? 'banner' : '';
    }
    get headerArrangement() {
        return (this.model && this.model.header && this.model.header.arrangement) || 'stacked';
    }
    get showLogo() {
        const hd = (this.model && this.model.header) || {};
        return this.headerArrangement !== 'textOnly' && !!hd.logo;
    }
    get headClass() {
        return `head head-${this.shell.header || 'standard'} arrange-${this.headerArrangement}`;
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
        if (!this.showProgressFraction || !this.nav) return '';
        const done = Object.values(this.nav.states || {}).filter((s) => s === 'complete').length;
        return `${done} of ${this.nav.total} done`;
    }
    get submitClass() {
        return this.footerClass;
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
