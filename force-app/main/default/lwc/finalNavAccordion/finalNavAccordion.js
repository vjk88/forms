import { LightningElement, api, track } from 'lwc';

/**
 * finalNavAccordion — expandable-panels nav primitive (catalog §2).
 *
 * Panels are presentation state owned HERE (open/close is not pagination):
 * every page stays reachable, the registry row says `paginates: false`, and
 * the slotted submitBar renders once below all panels. `pagechange` still
 * fires on expand so the engine can track visit order.
 *
 * A11y: each trigger is a button with aria-expanded + aria-controls; the
 * panel region is labelled by its trigger.
 */
export default class FinalNavAccordion extends LightningElement {
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Spec layout.options: { allowMultiple, firstPanelOpen, iconPosition } */
    @api options;

    @track _openKeys;
    _pages = [];

    @api
    get pages() {
        return this._pages;
    }
    set pages(value) {
        this._pages = value || [];
        this._openKeys = undefined; // re-seed the default open panel per spec
    }

    get opts() {
        return this.options || {};
    }

    get openKeys() {
        if (this._openKeys === undefined) {
            const first = this._pages[0];
            const open = this.opts.firstPanelOpen !== false && first;
            this._openKeys = open ? [first.id || 'pg_0'] : [];
        }
        return this._openKeys;
    }

    get iconTrailing() {
        return this.opts.iconPosition === 'trailing';
    }

    get panelList() {
        const open = this.openKeys;
        return (this._pages || []).map((page, index) => {
            const key = page.id || `pg_${index}`;
            const isOpen = open.includes(key);
            return {
                ...page,
                key,
                index,
                isOpen,
                panelId: `panel-${key}`,
                triggerId: `trigger-${key}`,
                expanded: isOpen ? 'true' : 'false',
                triggerCls: this.iconTrailing
                    ? 'trigger icon-trailing'
                    : 'trigger',
                chevronCls: isOpen ? 'chevron open' : 'chevron',
                sections: page.sections || []
            };
        });
    }

    handleToggle(event) {
        const key = event.currentTarget.dataset.key;
        const index = Number(event.currentTarget.dataset.index);
        const open = this.openKeys;
        if (open.includes(key)) {
            this._openKeys = open.filter((k) => k !== key);
            return;
        }
        this._openKeys = this.opts.allowMultiple ? [...open, key] : [key];
        this.dispatchEvent(new CustomEvent('pagechange', { detail: { index } }));
    }
}
