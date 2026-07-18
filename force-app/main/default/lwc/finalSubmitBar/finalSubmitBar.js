import { LightningElement, api } from 'lwc';

/**
 * finalSubmitBar — THE one button implementation (catalog §1) for the paginated
 * layouts that host it (scroll/stepper/tabs/rail/splitHero). oneAtATime owns its
 * own action row (ownsAdvance) and does NOT host this bar.
 *
 * `submitting` and `blockedMessage` are DATA, engine-set (UIUX review #3):
 * submitting disables everything + spins the primary; blockedMessage renders in a
 * persistent aria-live="polite" row.
 *
 * Button arrangement (LAYOUT_REFINEMENTS_SPEC §3): Back + the primary sit in ONE
 * row; `arrangement` places the pair — together-left / together-right / split.
 * Back is a quiet text link so it always reads as secondary to the filled primary
 * and stays identical wherever it appears.
 */

const ARRANGE_CLASS = {
    'together-left': 'arr-start',
    'together-right': 'arr-end',
    split: 'arr-split',
    // owner QA 2026-07-07 (FormStudio port): buttons share the full row width;
    // Back gains a boxed outline so a stretched text link doesn't float oddly
    stretch: 'arr-stretch'
};

export default class FinalSubmitBar extends LightningElement {
    /** Spec `submit` block: { label, nextLabel, backLabel }.
     *  (`placement: 'sticky'` deleted 2026-07-18 — sweep DELETE ruling.) */
    @api config;
    /** Which buttons this nav context shows. Scroll = submit only (the default). */
    @api showBack = false;
    @api showNext = false;
    @api showSubmit = false;
    /** Engine-set while a submit is in flight. */
    @api submitting = false;
    /** Engine-set while Next/Submit is blocked by invalid fields; '' when clear. */
    @api blockedMessage = '';
    /** Resolved by the viewer: submit.buttonArrangement ?? layout default. */
    @api arrangement = 'split';

    get cfg() {
        return this.config || {};
    }

    get rootClass() {
        const arr = ARRANGE_CLASS[this.arrangement] || ARRANGE_CLASS.split;
        return `bar ${arr}`;
    }

    get submitLabel() {
        return this.cfg.label || 'Submit';
    }

    get nextLabel() {
        return this.cfg.nextLabel || 'Next';
    }

    get backLabel() {
        return this.cfg.backLabel || 'Back';
    }

    get primaryClass() {
        return this.submitting ? 'btn primary busy' : 'btn primary';
    }

    handleBack() {
        this.dispatchEvent(new CustomEvent('back'));
    }

    handleNext() {
        this.dispatchEvent(new CustomEvent('next'));
    }

    handleSubmit() {
        this.dispatchEvent(new CustomEvent('submit'));
    }
}
