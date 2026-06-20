import { LightningElement, api } from 'lwc';

/**
 * c/formNav — reusable multi-page navigator display for shells. Driven by the
 * Design panel's "Progress indicator" lever (shell.progress):
 *   "progress" / "bar" → slim progress bar + "Step N / M — Title"
 *   "horizontal"       → clickable horizontal stepper strip
 *   "dots"             → compact clickable step dots
 *   "fraction"         → text-only "01 / 03 — Title"
 *   "none"             → renders nothing (host hides it)
 * clickable=false (linear): future steps are disabled (jump-back only).
 * clickable=true  (free):   any step is clickable.
 * Emits `navrequest` { pageKey } on a step click — the host shell forwards it
 * to the engine (same contract the shells already use).
 *
 * Shared by c/shellSplitHero and c/shellWizard (explicit progress modes).
 */
const MODES = ['progress', 'bar', 'horizontal', 'dots', 'fraction', 'none'];

export default class FormNav extends LightningElement {
    @api pages = [];
    @api nav;
    @api displayMode = 'progress';
    @api clickable = false;
    @api labels;

    get resolvedMode() {
        return MODES.includes(this.displayMode) ? this.displayMode : 'progress';
    }
    get isProgress() {
        const m = this.resolvedMode;
        return m === 'progress' || m === 'bar';
    }
    get showBarText() {
        return this.resolvedMode === 'progress';
    }
    get isHorizontal() {
        return this.resolvedMode === 'horizontal';
    }
    get isDots() {
        return this.resolvedMode === 'dots';
    }
    get isFraction() {
        return this.resolvedMode === 'fraction';
    }
    get fractionText() {
        const word = (this.labels && this.labels.stepWord) || 'Step';
        return `${word} ${this.progressNow} of ${this.progressTotal}`;
    }
    get currentTitle() {
        if (!this.nav) return '';
        const page = (this.pages || []).find((p) => p.pageKey === this.nav.currentPageKey);
        return (page && page.label) || '';
    }

    get progressNow() {
        return this.nav ? this.nav.currentIndex + 1 : 1;
    }
    get progressTotal() {
        return this.nav ? this.nav.total : 1;
    }
    get progressStyle() {
        const total = this.progressTotal || 1;
        return `width: ${Math.round((this.progressNow / total) * 100)}%;`;
    }
    get stepLabel() {
        if (!this.nav) return '';
        const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
        const word = (this.labels && this.labels.stepWord) || 'Step';
        const page = (this.pages || []).find((p) => p.pageKey === this.nav.currentPageKey);
        const title = page && page.label;
        return `${word} ${pad(this.progressNow)} / ${pad(this.progressTotal)}${title ? ` — ${title}` : ''}`;
    }

    get stepItems() {
        if (!this.nav) return [];
        return (this.pages || []).map((p, i) => {
            const state = (this.nav.states && this.nav.states[p.pageKey]) || 'untouched';
            const isActive = p.pageKey === this.nav.currentPageKey;
            const isFuture = i > this.nav.currentIndex;
            let cls = 'fn-step';
            if (isActive) cls += ' is-active';
            else if (state === 'complete') cls += ' is-done';
            else if (state === 'error') cls += ' is-error';
            return {
                key: p.pageKey,
                num: i + 1,
                label: p.label || `Step ${i + 1}`,
                stepClass: cls,
                // free → always clickable; linear → only past/completed steps.
                disabled: this.clickable ? false : isFuture,
                isDone: state === 'complete',
                ariaCurrent: isActive ? 'step' : undefined
            };
        });
    }

    handleStep(e) {
        const key = e.currentTarget.dataset.key;
        if (key) {
            this.dispatchEvent(new CustomEvent('navrequest', { detail: { pageKey: key } }));
        }
    }
}
