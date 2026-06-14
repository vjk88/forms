import { LightningElement, api } from 'lwc';

/**
 * c/shellSplitHero — archetypes/split-hero.md
 * Fixed brand panel (sticky left) beside a scrolling form pane.
 * Mobile: panel collapses to a compact top band.
 */
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
    get showTitle() {
        return !!(this.model && this.model.header.title);
    }
    get showDesc() {
        return !!(this.model && this.model.header.description);
    }
    get isMultiPage() {
        return !!(this.nav && this.nav.total > 1);
    }
    get progressLabel() {
        return this.nav ? `Step ${this.nav.currentIndex + 1} of ${this.nav.total}` : 'Form progress';
    }
    get stepItems() {
        if (!this.model || !this.nav) return [];
        return this.model.pages.map((p, i) => {
            const state = (this.nav.states && this.nav.states[p.pageKey]) || 'untouched';
            const isActive = p.pageKey === this.nav.currentPageKey;
            let cls = 'dot';
            if (isActive) cls += ' dot-active';
            else if (state === 'complete') cls += ' dot-done';
            else if (state === 'error') cls += ' dot-error';
            return { key: p.pageKey, label: p.label || `Step ${i + 1}`, dotClass: cls };
        });
    }
    get panePages() {
        if (!this.model) return [];
        if (this.model.shell && this.model.shell.nav === 'stepper' && this.nav) {
            const key = this.nav.currentPageKey;
            const found = this.model.pages.find((p) => p.pageKey === key);
            return found ? [found] : this.model.pages.slice(0, 1);
        }
        return this.model.pages;
    }
    get isStepper() {
        return !!(this.model && this.model.shell && this.model.shell.nav === 'stepper');
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
    get submitClass() {
        const a =
            (this.model &&
                this.model.shell &&
                this.model.shell.submit &&
                this.model.shell.submit.alignment) ||
            'right';
        return `nav-bar align-${a}`;
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
