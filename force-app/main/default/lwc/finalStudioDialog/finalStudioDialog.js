import { LightningElement, api } from 'lwc';

/**
 * finalStudioDialog — the Studio's own dialog (IMPL_PLAN_F2_AUTOFILL 5.1).
 *
 * Why not `lightning/modal`: its `full` size is `large` on any screen wider
 * than 480px, and its Escape and ✕ close it at once, with no chance to ask
 * first. This one fills the window when asked to, and every way out (Cancel,
 * Escape, ✕) asks "Discard your changes?" while `dirty`.
 *
 * The question is asked inside the dialog, not with `lightning/confirm`: in
 * the VF-hosted Studio its promise never settled after Cancel (org,
 * 2026-09-25), which left the dialog unable to ask again.
 *
 * Content comes in through the `body` slot (and `footer-start`). Emits
 * `confirm` for the brand button and `dismiss` once leaving is agreed; the
 * host decides what either means and removes the dialog. sd- classes.
 */
export default class FinalStudioDialog extends LightningElement {
    /** 'full' (fills the window) or 'large'. */
    @api size = 'large';
    @api label;
    /** The brand button, e.g. "Done" or "Apply". */
    @api confirmLabel = 'Done';
    /** Unsaved changes: leaving asks first. */
    @api dirty = false;

    /** The "Discard your changes?" question is showing. */
    confirming = false;
    _focused = false;
    _focusNext = null;

    /**
     * Escape is heard on the window while the dialog is open, so it works
     * wherever focus has ended up. The dialog stops the key it handles, so
     * the window never hears it twice.
     */
    _onWindowKeydown = (event) => this.handleKeydown(event);

    connectedCallback() {
        window.addEventListener('keydown', this._onWindowKeydown);
    }

    disconnectedCallback() {
        window.removeEventListener('keydown', this._onWindowKeydown);
    }

    get sectionClass() {
        return `sd ${this.size === 'full' ? 'sd--full' : 'sd--large'}`;
    }

    renderedCallback() {
        // Into the dialog on open, so the keyboard starts where the eye does.
        if (!this._focused) {
            this._focused = true;
            this._focus('.sd-title');
        }
        if (this._focusNext) {
            const selector = this._focusNext;
            this._focusNext = null;
            this._focus(selector);
        }
    }

    _focus(selector) {
        const target = this.template.querySelector(selector);
        if (target) {
            target.focus();
        }
    }

    handleKeydown(event) {
        if (event.key !== 'Escape' || event.defaultPrevented) {
            return;
        }
        if (this.confirming) {
            // Escape answers the question the safe way.
            event.stopPropagation();
            this.handleKeep();
            return;
        }
        // An open list inside (a combobox) closes itself first.
        const open = event
            .composedPath()
            .some(
                (n) =>
                    n &&
                    typeof n.getAttribute === 'function' &&
                    n.getAttribute('aria-expanded') === 'true'
            );
        if (open) {
            return;
        }
        event.stopPropagation();
        this.handleDismiss();
    }

    handleFocusStart() {
        this._focus(this.confirming ? '.sd-discard' : '.sd-confirm');
    }

    handleFocusEnd() {
        this._focus(this.confirming ? '.sd-keep' : '.sd-close');
    }

    handleConfirm() {
        if (this.confirming) {
            return;
        }
        this.dispatchEvent(new CustomEvent('confirm'));
    }

    handleDismiss() {
        if (this.confirming) {
            return;
        }
        if (this.dirty) {
            this.confirming = true;
            this._focusNext = '.sd-keep';
            return;
        }
        this.dispatchEvent(new CustomEvent('dismiss'));
    }

    handleKeep() {
        this.confirming = false;
        this._focusNext = '.sd-title';
    }

    handleDiscard() {
        this.confirming = false;
        this.dispatchEvent(new CustomEvent('dismiss'));
    }
}
