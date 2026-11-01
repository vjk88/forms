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
 * panel region is labelled by its trigger. The panel title is an h2 (a page,
 * like Scroll's page divider), so the h3 section titles inside read as its
 * children instead of as more panels.
 */
/** Jump numbers this layout already opened a panel for. Module-level, so a
 *  panel the person closed again never re-opens on an old click. */
const panelFocusDone = new Set();

/** The jump number one of this page's questions carries, if any. */
function focusNumber(page) {
    for (const section of page.sections || []) {
        for (const el of section.elements || []) {
            if (el && el.focusRequest) {
                return el.focusRequest;
            }
        }
    }
    return null;
}

export default class FinalNavAccordion extends LightningElement {
    @api currentPageIndex = 0;
    @api pageValidity = [];
    /** Spec layout.options: { allowMultiple, firstPanelOpen, iconPosition } —
     *  ALL PRODUCT-SET since 2026-07-18 (Design panel "Accordion" group,
     *  sweep BUILD slice 1). The layout survives an edit in the Studio, so a
     *  change to "First panel open" or "Allow multiple" re-seeds the panels
     *  here — the pages setter keeps them now, and used to be what applied
     *  these switches live. */
    _options;
    @api
    get options() {
        return this._options;
    }
    set options(value) {
        const before = this._options || {};
        const after = value || {};
        if (
            this._options !== undefined &&
            (before.firstPanelOpen !== after.firstPanelOpen ||
                before.allowMultiple !== after.allowMultiple)
        ) {
            this._openKeys = undefined;
        }
        this._options = value;
    }

    @track _openKeys;
    _pages = [];
    _pageKeys = [];

    @api
    get pages() {
        return this._pages;
    }
    /**
     * The viewer hands over NEW page data after every answer, so this setter
     * must not reset the panels (it used to, and answering a question in
     * panel 2 sent you back to panel 1). Every open panel that is still there
     * stays open — an answer, or a rule showing or hiding some OTHER page,
     * never closes the one you are in. The default comes back only when no
     * open panel survives (a rule hid it) or a different form arrived (no
     * page in common).
     */
    set pages(value) {
        const next = value || [];
        const keys = next.map((page, i) => page.id || `pg_${i}`);
        const sameForm = keys.some((key) => this._pageKeys.includes(key));
        if (!sameForm) {
            this._openKeys = undefined;
        } else if (this._openKeys !== undefined) {
            const kept = this._openKeys.filter((key) => keys.includes(key));
            this._openKeys =
                this._openKeys.length && !kept.length ? undefined : kept;
        }
        this._pages = next;
        this._pageKeys = keys;
        this._openForFocus(keys);
    }

    /** A blocked click's jump target sits in a panel (`focusRequest` on one
     *  question): open that panel so the question renders and takes the
     *  cursor. Alongside the others with "Allow multiple", instead of them
     *  without. Once per number, remembered beyond this component's life. */
    _openForFocus(keys) {
        this._pages.forEach((page, i) => {
            const n = focusNumber(page);
            if (!n || panelFocusDone.has(n)) {
                return;
            }
            panelFocusDone.add(n);
            const open = this.openKeys;
            if (!open.includes(keys[i])) {
                this._openKeys = this.opts.allowMultiple
                    ? [...open, keys[i]]
                    : [keys[i]];
            }
        });
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
                // open on the trigger too: the accent marks the expanded
                // panel (owner ruling 2026-07-11 — accordion was the only
                // multi-page layout with no accent-marked position)
                triggerCls:
                    (this.iconTrailing ? 'trigger icon-trailing' : 'trigger') +
                    (isOpen ? ' open' : ''),
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
        this.dispatchEvent(
            new CustomEvent('pagechange', { detail: { index } })
        );
    }

    /** Re-emit the answer intent across this shadow boundary (catalog rule:
     *  plain non-composed events — every hop re-dispatches deliberately). */
    handleValueChange(event) {
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: event.detail })
        );
    }
}
