import { LightningElement, api } from 'lwc';

/**
 * c/shellWizard — the Stepper layout (archetypes/wizard-stepper.md + T3.4).
 *
 * ONE responsive shell, three displays via `shell.stepperMode`:
 *   vertical    — sticky numbered rail on the left (default)
 *   horizontal  — numbered steps in a row across the top
 *   progress    — a slim progress bar + "Step N of M" (no per-step nodes)
 * Container-responsive (spec §5.1/§9.8): below a ~520px CONTAINER width the
 * text-heavy vertical/horizontal modes auto-collapse to the progress bar — a
 * CSS container query (not a viewport media query), since forms render in
 * variable-width regions. The shell sets container-type on :host; the CSS does
 * the swap, so it needs no JS resize wiring.
 */
const STEPPER_MODES = ['vertical', 'horizontal', 'progress'];

export default class ShellWizard extends LightningElement {
    @api model;
    @api nav;
    @api mode;

    get stepperMode() {
        const s = (this.model && this.model.shell) || {};
        if (STEPPER_MODES.includes(s.stepperMode)) return s.stepperMode;
        // back-compat: derive from the old stepperPlacement (top→horizontal).
        if (s.stepperPlacement === 'top') return 'horizontal';
        return 'vertical';
    }
    get wizardClass() {
        // mode-* drives the layout; container queries handle the narrow collapse.
        return `wizard mode-${this.stepperMode}`;
    }

    // ---- progress display (progress mode + the narrow-container fallback) ----
    get progressNow() {
        return this.nav ? this.nav.currentIndex + 1 : 1;
    }
    get progressTotal() {
        return this.nav ? this.nav.total : 1;
    }
    get progressStyle() {
        const total = this.progressTotal || 1;
        const pct = Math.round((this.progressNow / total) * 100);
        return `width: ${pct}%;`;
    }
    get railItems() {
        if (!this.model || !this.nav) return [];
        return this.model.pages.map((p, i) => {
            const state = (this.nav.states && this.nav.states[p.pageKey]) || 'untouched';
            const isActive = p.pageKey === this.nav.currentPageKey;
            let cls = 'rail-node';
            if (isActive) cls += ' is-active';
            else if (state === 'complete') cls += ' is-done';
            else if (state === 'error') cls += ' is-error';
            return {
                key: p.pageKey,
                num: i + 1,
                label: p.label || `Step ${i + 1}`,
                nodeClass: cls,
                isFirst: i === 0,
                isDone: state === 'complete',
                // Board §6: completed steps jump back; future steps not clickable.
                isFuture: i > this.nav.currentIndex,
                ariaCurrent: isActive ? 'step' : undefined
            };
        });
    }
    get currentPage() {
        if (!this.model || !this.nav) return null;
        const key = this.nav.currentPageKey;
        return this.model.pages.find((p) => p.pageKey === key) || this.model.pages[0];
    }
    get showHeader() {
        const h = this.model && this.model.header;
        return !!(h && (h.title || h.description || h.logo));
    }
    get metaStepLabel() {
        if (!this.nav) return '';
        const idx = this.nav.currentIndex + 1;
        const total = this.nav.total;
        const pad = idx < 10 ? `0${idx}` : `${idx}`;
        const totalPad = total < 10 ? `0${total}` : `${total}`;
        const title = this.currentPage && this.currentPage.label;
        const stepWord = (
            (this.model && this.model.labels && this.model.labels.stepWord) || 'Step'
        ).toUpperCase();
        return `${stepWord} ${pad}/${totalPad}${title ? ` — ${title.toUpperCase()}` : ''}`;
    }
    get panePages() {
        const p = this.currentPage;
        return p ? [p] : [];
    }
    get showBack() {
        return !!(this.nav && !this.nav.isFirst);
    }
    get showNext() {
        return !!(this.nav && !this.nav.isLast);
    }
    get showSubmit() {
        return !!(this.nav && this.nav.isLast);
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
    handleRailClick(e) {
        const key = e.currentTarget.dataset.key;
        if (key) this.dispatchEvent(new CustomEvent('navrequest', { detail: { pageKey: key } }));
    }
}
