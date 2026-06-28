import { LightningElement, api, track } from 'lwc';

/**
 * c/shellAccordion — archetypes/accordion.md
 * All sections as accordion panels (lightning-accordion, single-open).
 * Continue ↓ closes panel + opens next incomplete. Submit always visible.
 */
function extractSections(model) {
    const result = [];
    (model.pages || []).forEach((page) => {
        (page.zones || []).forEach((zone) => {
            (zone.children || []).forEach((child) => {
                if (child.isStack) {
                    (child.sections || []).forEach((s) => result.push({ ...s, _page: page.label }));
                } else if (child.isColumns) {
                    (child.tracks || []).forEach((trk) =>
                        (trk || []).forEach((s) => result.push({ ...s, _page: page.label }))
                    );
                }
            });
        });
    });
    return result;
}

export default class ShellAccordion extends LightningElement {
    @api model;
    @api nav;
    @api mode;
    @track _openSection;

    get allSections() {
        return this.model ? extractSections(this.model) : [];
    }
    get openSection() {
        if (this._openSection === undefined) {
            const s = this.allSections[0];
            return s ? s.key : null;
        }
        return this._openSection;
    }
    get accordionPanels() {
        return this.allSections.map((sec, i) => ({
            ...sec,
            _panelLabel: sec.title || `Section ${i + 1}`,
            _hasNext: i < this.allSections.length - 1
        }));
    }
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
        return ['auto', 'stickyBottom'].includes(this.submitInfo.placement);
    }
    get footerClass() {
        const a = this.submitInfo.alignment || 'right';
        return `card-footer align-${a}${this.isStickySubmit ? ' is-sticky' : ''}`;
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
    get progressLabel() {
        // Completion fraction needs live validation (Phase 2) — until then a
        // hardcoded "0 / N ✓" reads as broken, so show the panel count only.
        if (!this.showProgressFraction || !this.model) return '';
        const total = this.allSections.length;
        return total > 1 ? `${total} sections` : '';
    }

    handleSectionToggle(e) {
        // Single-open accordion reports a string; allow-multiple reports an array.
        const open = e.detail.openSections;
        this._openSection = (Array.isArray(open) ? open[0] : open) || null;
    }
    handleContinue(e) {
        const key = e.currentTarget.dataset.key;
        const sections = this.allSections;
        const idx = sections.findIndex((s) => s.key === key);
        this._openSection = idx >= 0 && idx < sections.length - 1 ? sections[idx + 1].key : null;
    }
    fireSubmit() {
        this.dispatchEvent(new CustomEvent('submitrequest'));
    }
}
