import { LightningElement, api } from 'lwc';

const MAX_NAME_LENGTH = 80;
const CLONE_SUFFIX = ' — Copy';

/** Focused dialog for the Studio action currently being performed. */
export default class FinalStudioActionDialog extends LightningElement {
    @api busy = false;
    @api error = '';

    cloneName = '';
    _sourceName = '';
    _focused = false;

    @api
    get sourceName() {
        return this._sourceName;
    }

    set sourceName(value) {
        this._sourceName = value || '';
        const source = this._sourceName.trim() || 'Untitled form';
        this.cloneName = `${source.slice(
            0,
            MAX_NAME_LENGTH - CLONE_SUFFIX.length
        )}${CLONE_SUFFIX}`;
        this._focused = false;
    }

    renderedCallback() {
        if (this._focused) {
            return;
        }
        this._focused = true;
        Promise.resolve().then(() => {
            const input = this.template.querySelector('[data-id="clone-name"]');
            input?.focus();
            input?.select?.();
        });
    }

    get confirmDisabled() {
        const name = this.cloneName.trim();
        return this.busy || !name || name.length > MAX_NAME_LENGTH;
    }

    get confirmLabel() {
        return this.busy ? 'Cloning…' : 'Clone form';
    }

    handleNameChange(event) {
        this.cloneName = event.target.value;
    }

    handleKeydown(event) {
        if (event.key === 'Escape' && !this.busy) {
            event.preventDefault();
            this.dispatchCancel();
        } else if (
            event.key === 'Enter' &&
            event.target ===
                this.template.querySelector('[data-id="clone-name"]')
        ) {
            event.preventDefault();
            this.handleConfirm();
        }
    }

    handleBackdrop() {
        if (!this.busy) {
            this.dispatchCancel();
        }
    }

    handleCancel() {
        if (!this.busy) {
            this.dispatchCancel();
        }
    }

    handleConfirm() {
        const input = this.template.querySelector('[data-id="clone-name"]');
        if (!input?.reportValidity() || this.confirmDisabled) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('confirm', {
                detail: { name: this.cloneName.trim() }
            })
        );
    }

    handleFocusStart() {
        this.template.querySelector('[data-id="clone-confirm"]')?.focus();
    }

    handleFocusEnd() {
        this.template.querySelector('[data-id="clone-close"]')?.focus();
    }

    dispatchCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
