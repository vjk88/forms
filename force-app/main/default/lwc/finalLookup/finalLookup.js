import { LightningElement, api } from 'lwc';
import isGuest from '@salesforce/user/isGuest';

export default class FinalLookup extends LightningElement {
    @api elementId;
    @api label = 'Lookup';
    @api value = null;
    @api targetObject;
    @api placeholder = 'Search...';
    @api required = false;
    @api disabled = false;
    @api readOnly = false;

    get isGuestUser() {
        return Boolean(isGuest);
    }

    get isLookupDisabled() {
        return Boolean(this.disabled || this.readOnly);
    }

    get unavailableMessage() {
        return 'Lookup selection is unavailable for guest respondents. Enter details directly if applicable.';
    }

    handleChange(event) {
        const recordId = (event.detail && event.detail.recordId) || null;
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: {
                    elementId: this.elementId,
                    value: recordId
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleError(event) {
        this.dispatchEvent(
            new CustomEvent('pickererror', {
                detail: event.detail,
                bubbles: true,
                composed: true
            })
        );
    }

    @api
    reportValidity() {
        if (this.isGuestUser) {
            return !this.required;
        }
        const picker = this.template.querySelector('[data-id="picker"]');
        return picker && typeof picker.reportValidity === 'function'
            ? picker.reportValidity()
            : true;
    }

    @api
    checkValidity() {
        if (this.isGuestUser) {
            return !this.required;
        }
        const picker = this.template.querySelector('[data-id="picker"]');
        return picker && typeof picker.checkValidity === 'function'
            ? picker.checkValidity()
            : true;
    }

    @api
    focus() {
        const picker = this.template.querySelector('[data-id="picker"]');
        if (picker && typeof picker.focus === 'function') {
            picker.focus();
        }
    }
}
