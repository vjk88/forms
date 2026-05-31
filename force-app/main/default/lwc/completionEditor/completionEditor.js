import { LightningElement, api } from 'lwc';

export default class CompletionEditor extends LightningElement {
    @api settings = {};

    get redirectDisabled() {
        return !this.settings.autoRedirect;
    }

    get returnLabelDisabled() {
        return !this.settings.showReturnButton;
    }

    get submitLabel() {
        return this.settings.submitLabel || 'Submit Form';
    }

    fire(property, value) {
        this.dispatchEvent(new CustomEvent('completionchange', {
            detail: { property, value }
        }));
    }

    handleThankYouChange(event) {
        this.fire('thankYouMessage', event.detail.value);
    }

    handleAutoRedirectChange(event) {
        this.fire('autoRedirect', event.detail.checked);
    }

    handleRedirectUrlChange(event) {
        this.fire('redirectUrl', event.detail.value);
    }

    handleDelayChange(event) {
        this.fire('redirectDelay', event.detail.value);
    }

    handleShowReturnChange(event) {
        this.fire('showReturnButton', event.detail.checked);
    }

    handleReturnLabelChange(event) {
        this.fire('returnButtonLabel', event.detail.value);
    }
}
