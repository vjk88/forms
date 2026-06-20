import { LightningElement, api, track } from 'lwc';

/**
 * c/shellConversational — archetypes/conversational.md
 * One section at a time, full-height, keyboard-first.
 * Enter = advance; Shift+Enter = back; OK button visible.
 */
function extractSections(model) {
    const result = [];
    (model.pages || []).forEach((page) => {
        (page.zones || []).forEach((zone) => {
            (zone.children || []).forEach((child) => {
                if (child.isStack) {
                    (child.sections || []).forEach((s) => result.push(s));
                } else if (child.isColumns) {
                    (child.tracks || []).forEach((trk) =>
                        (trk || []).forEach((s) => result.push(s))
                    );
                }
            });
        });
    });
    return result;
}

export default class ShellConversational extends LightningElement {
    @api model;
    @api nav;
    @api mode;
    @track _sectionIdx = 0;

    _boundKeydown;

    connectedCallback() {
        this._boundKeydown = this._handleKeydown.bind(this);
        this.template.addEventListener('keydown', this._boundKeydown);
    }

    disconnectedCallback() {
        this.template.removeEventListener('keydown', this._boundKeydown);
    }

    renderedCallback() {
        // Keyboard-first: keep focus on the shell as screens change so
        // Enter/Shift+Enter keep working without a click (board §6).
        const sec = this.currentSection;
        const key = sec && sec.key;
        if (key && key !== this._focusedKey) {
            this._focusedKey = key;
            const root = this.template.querySelector('.conv');
            if (root) root.focus();
        }
    }

    get headerStyle() {
        return (this.model && this.model.shell && this.model.shell.header) || 'standard';
    }
    get showHeader() {
        const h = this.model && this.model.header;
        return this.headerStyle !== 'none' && !!(h && (h.title || h.description || h.logo || h.highlight));
    }
    get highlightVariant() {
        return this.headerStyle === 'hero' ? 'banner' : '';
    }
    get headerArrangement() {
        return (this.model && this.model.header && this.model.header.arrangement) || 'stacked';
    }
    get showLogo() {
        const h = (this.model && this.model.header) || {};
        return this.headerArrangement !== 'textOnly' && !!h.logo;
    }
    get headClass() {
        return `conv-head head-${this.headerStyle} arrange-${this.headerArrangement}`;
    }
    get allSections() {
        return this.model ? extractSections(this.model) : [];
    }
    get safeIdx() {
        // Model can shrink under us (harness seed/archetype switch) — clamp.
        const max = this.allSections.length - 1;
        return Math.max(0, Math.min(this._sectionIdx, max));
    }
    get currentSection() {
        return this.allSections[this.safeIdx] || null;
    }
    get currentScreenArr() {
        const s = this.currentSection;
        return s ? [s] : [];
    }
    get totalSections() {
        return this.allSections.length;
    }
    get sectionNum() {
        return this.safeIdx + 1;
    }
    get progressPct() {
        const t = this.totalSections;
        return t > 0 ? Math.round((this.safeIdx / t) * 100) : 0;
    }
    get progressStyle() {
        return `width: ${this.progressPct}%;`;
    }
    get counter() {
        return `${this.sectionNum} / ${this.totalSections}`;
    }
    get eyebrow() {
        return this.currentSection && this.currentSection.title
            ? this.currentSection.title.toUpperCase()
            : '';
    }
    get isLastSection() {
        return this.safeIdx >= this.totalSections - 1;
    }
    get isFirstSection() {
        return this.safeIdx === 0;
    }
    get canGoBack() {
        // A previous section in this page, OR a previous page to step into.
        return !this.isFirstSection || !!(this.nav && !this.nav.isFirst);
    }

    _advance() {
        if (this.isLastSection) {
            this._checkPageBoundary();
        } else {
            this._sectionIdx = this.safeIdx + 1;
        }
    }
    _back() {
        if (this.safeIdx > 0) {
            this._sectionIdx = this.safeIdx - 1;
        } else if (this.nav && !this.nav.isFirst) {
            this.dispatchEvent(new CustomEvent('navrequest', { detail: { dir: 'back' } }));
        }
    }
    _checkPageBoundary() {
        if (this.nav && !this.nav.isLast) {
            this.dispatchEvent(new CustomEvent('navrequest', { detail: { dir: 'next' } }));
            this._sectionIdx = 0;
        }
    }
    _handleKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this._advance();
        } else if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            this._back();
        }
    }

    get submitClass() {
        const a =
            (this.model &&
                this.model.shell &&
                this.model.shell.submit &&
                this.model.shell.submit.alignment) ||
            'left';
        return `submit-wrap align-${a}`;
    }

    handleOk() {
        if (this.isLastSection && this.nav && this.nav.isLast) {
            this.dispatchEvent(new CustomEvent('submitrequest'));
        } else {
            this._advance();
        }
    }
    handleBack() {
        this._back();
    }
    fireSubmit() {
        this.dispatchEvent(new CustomEvent('submitrequest'));
    }
}
