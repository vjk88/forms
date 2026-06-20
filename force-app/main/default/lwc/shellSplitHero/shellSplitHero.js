import { LightningElement, api } from 'lwc';

/**
 * c/shellSplitHero — archetypes/split-hero.md
 * Brand HERO on the sticky left (logo + title + description only — no nav).
 * The form pane on the right owns navigation, shown via the shared c/formNav:
 *   shell.progress   = the Design panel "Progress indicator" lever, canonical:
 *                      auto | bar | dots | fraction | horizontal | none
 *   shell.navDisplay = legacy fallback (progress | horizontal | none)
 *   shell.navFree    = true → any step clickable; false (default) → linear.
 * A multi-page split-hero steps one page at a time (set shell.nav='scroll' to
 * show every page in one scroll instead). Mobile: panel → compact top band.
 */
const NAV_DISPLAYS = ['progress', 'bar', 'dots', 'fraction', 'horizontal', 'none'];

export default class ShellSplitHero extends LightningElement {
    @api model;
    @api nav;
    @api mode;

    get panelStyle() {
        const w =
            (this.model &&
                this.model.shell &&
                this.model.shell.brandPanel &&
                this.model.shell.brandPanel.width) ||
            '38%';
        return `flex: 0 0 ${w}; min-width: 220px;`;
    }
    get brandContentSet() {
        const bp = (this.model && this.model.shell && this.model.shell.brandPanel) || {};
        return new Set(bp.content || ['logo', 'title', 'description']);
    }
    // Header style 'none' clears the brand rail's content (the rail itself stays
    // as the layout's left column, optionally still showing the banner color/image).
    get headerOn() {
        return ((this.model && this.model.shell && this.model.shell.header) || 'standard') !== 'none';
    }
    get showLogo() {
        const h = (this.model && this.model.header) || {};
        return this.headerOn && this.brandContentSet.has('logo') && (h.arrangement || 'stacked') !== 'textOnly' && !!h.logo;
    }
    get showTitle() {
        return this.headerOn && this.brandContentSet.has('title') && !!(this.model && this.model.header.title);
    }
    get showDesc() {
        return this.headerOn && this.brandContentSet.has('description') && !!(this.model && this.model.header.description);
    }
    get isMultiPage() {
        return !!(this.nav && this.nav.total > 1);
    }

    // ---- brand panel side & layout ----
    get layoutClass() {
        const side = (this.model && this.model.shell && this.model.shell.brandPanel && this.model.shell.brandPanel.side) || 'left';
        return `layout side-${side}`;
    }

    // ---- right-pane navigator (shared c/formNav) ----
    get navDisplay() {
        const sh = (this.model && this.model.shell) || {};
        // The Design panel's "Progress indicator" wins; 'auto' maps to the bar.
        const p = sh.progress;
        if (p === 'auto') return 'progress';
        if (NAV_DISPLAYS.includes(p)) return p;
        // Legacy fallback.
        return NAV_DISPLAYS.includes(sh.navDisplay) ? sh.navDisplay : 'progress';
    }
    get navClickable() {
        return !!(this.model && this.model.shell && this.model.shell.navFree);
    }
    get showNavBar() {
        return this.isStepper && this.navDisplay !== 'none';
    }

    get panePages() {
        if (!this.model) return [];
        if (this.isStepper && this.nav) {
            const key = this.nav.currentPageKey;
            const found = this.model.pages.find((p) => p.pageKey === key);
            return found ? [found] : this.model.pages.slice(0, 1);
        }
        return this.model.pages;
    }
    get isStepper() {
        // Multi-page split-hero steps by default; opt out with shell.nav='scroll'.
        if (!this.isMultiPage) return false;
        return !(this.model && this.model.shell && this.model.shell.nav === 'scroll');
    }
    get showBack() {
        return this.isStepper && !!(this.nav && !this.nav.isFirst);
    }
    get showNext() {
        return this.isStepper && !!(this.nav && !this.nav.isLast);
    }
    get showSubmit() {
        if (!this.model) return true;
        return !this.isStepper || !!(this.nav && this.nav.isLast);
    }
    get submitInfo() {
        return (this.model && this.model.shell && this.model.shell.submit) || { placement: 'flow', alignment: 'right' };
    }
    get isBrandSubmit() {
        return this.submitInfo.placement === 'brandPanel';
    }
    get isStickySubmit() {
        return this.submitInfo.placement === 'stickyBottom';
    }
    get submitClass() {
        const a = this.submitInfo.alignment || 'right';
        let cls = `nav-bar align-${a}`;
        if (this.isStickySubmit) cls += ' is-sticky';
        if (this.isBrandSubmit) cls += ' brand-placement';
        return cls;
    }

    // Forward a step click from c/formNav up to the engine.
    handleChildNav(e) {
        this.dispatchEvent(new CustomEvent('navrequest', { detail: e.detail }));
    }
    fireBack() {
        this.dispatchEvent(new CustomEvent('navrequest', { detail: { dir: 'back' } }));
    }
    fireNext() {
        this.dispatchEvent(new CustomEvent('navrequest', { detail: { dir: 'next' } }));
    }
    fireSubmit() {
        this.dispatchEvent(new CustomEvent('submitrequest'));
    }
}
