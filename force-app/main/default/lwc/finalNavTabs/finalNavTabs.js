import { LightningElement, api } from 'lwc';
import { observeStuck } from 'c/finalStuck';

/**
 * finalNavTabs — tabbed-pages nav primitive (catalog §2).
 *
 * Free navigation by design: every tab is always reachable, so `pageValidity`
 * is accepted (contract) but renders no gating. Dispatches `pagechange`;
 * Next/Back/Submit come from the slotted submitBar.
 *
 * A11y: real tablist/tab/tabpanel roles with a roving tabindex — Left/Right
 * arrows move AND activate (automatic activation), Home/End jump.
 */

const STYLES = new Set(['underline', 'pills', 'enclosed']);

const ALIGN_CLASS = {
    left: 'align-left',
    center: 'align-center',
    fullWidth: 'align-full'
};

export default class FinalNavTabs extends LightningElement {
    @api pages = [];
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Spec layout.options: { tabAlignment, tabStyle, showTabIcons } */
    @api options;

    /** True only while the strip is pinned — the ONLY time it paints a surface. */
    stuck = false;

    _disconnectStuck = null;

    renderedCallback() {
        if (this._disconnectStuck === null) {
            this._disconnectStuck = observeStuck(
                this.template.querySelector('.stuck-sentinel'),
                this.template.querySelector('.tab-strip'),
                (stuck) => {
                    this.stuck = stuck;
                }
            );
        }
    }

    disconnectedCallback() {
        if (this._disconnectStuck) {
            this._disconnectStuck();
            this._disconnectStuck = null;
        }
    }

    get stripClass() {
        return this.stuck ? 'tab-strip is-stuck' : 'tab-strip';
    }

    get opts() {
        return this.options || {};
    }

    get tabStyle() {
        return STYLES.has(this.opts.tabStyle)
            ? this.opts.tabStyle
            : 'underline';
    }

    get listClass() {
        const align = ALIGN_CLASS[this.opts.tabAlignment] || ALIGN_CLASS.left;
        return `tab-list style-${this.tabStyle} ${align}`;
    }

    get tabList() {
        const current = this.currentPageIndex || 0;
        const showIcons = Boolean(this.opts.showTabIcons);
        return (this.pages || []).map((page, index) => {
            const active = index === current;
            return {
                key: page.id || `pg_${index}`,
                label: page.name || `Page ${index + 1}`,
                index,
                cls: active ? 'tab active' : 'tab',
                selected: active ? 'true' : 'false',
                tabindex: active ? '0' : '-1',
                iconName: showIcons && page.icon ? `utility:${page.icon}` : null
            };
        });
    }

    /** One-item list so the keyed template remounts (and animates) per tab. */
    get currentPageList() {
        const page = (this.pages || [])[this.currentPageIndex || 0];
        return page
            ? [{ ...page, key: page.id || `pg_${this.currentPageIndex}` }]
            : [];
    }

    handleTabClick(event) {
        this._activate(Number(event.currentTarget.dataset.index));
    }

    handleKeydown(event) {
        const count = (this.pages || []).length;
        if (!count) {
            return;
        }
        const current = this.currentPageIndex || 0;
        let target = null;
        if (event.key === 'ArrowRight') {
            target = (current + 1) % count;
        } else if (event.key === 'ArrowLeft') {
            target = (current - 1 + count) % count;
        } else if (event.key === 'Home') {
            target = 0;
        } else if (event.key === 'End') {
            target = count - 1;
        }
        if (target !== null) {
            event.preventDefault();
            this._activate(target, true);
        }
    }

    _activate(index, focus) {
        if (index === this.currentPageIndex) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('pagechange', { detail: { index } })
        );
        if (focus) {
            // Roving tabindex: move focus with activation once the host updates.
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            requestAnimationFrame(() => {
                const tab = this.template.querySelector(
                    `[data-index="${index}"]`
                );
                if (tab) {
                    tab.focus();
                }
            });
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
