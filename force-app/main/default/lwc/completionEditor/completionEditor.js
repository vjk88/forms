import { LightningElement, api } from 'lwc';

export default class CompletionEditor extends LightningElement {
    @api settings = {};

    // --- Mode ---
    get afterSubmitMode() {
        return this.settings.afterSubmitMode || 'Screen';
    }
    get isScreenMode() {
        return this.afterSubmitMode === 'Screen';
    }
    get isToastMode() {
        return this.afterSubmitMode === 'ToastAndGo';
    }
    get modeOptions() {
        return [
            { label: 'Show a completion screen', value: 'Screen' },
            { label: 'Toast & go straight to record / URL', value: 'ToastAndGo' }
        ];
    }

    get destinationOptions() {
        return [
            { label: 'The new / updated record', value: 'Record' },
            { label: 'Custom URL', value: 'Custom' }
        ];
    }

    get tokenHint() {
        return 'Tip: use {recordId} or {objectApiName} in a custom URL.';
    }

    // --- Toast & go ---
    get toastTarget() {
        return this.settings.toastAndGoTarget || 'Record';
    }
    get toastIsCustom() {
        return this.toastTarget === 'Custom';
    }
    get toastUrl() {
        return this.settings.toastAndGoUrl || '';
    }

    // --- Auto-redirect ---
    get autoRedirect() {
        return this.settings.autoRedirect || false;
    }
    get redirectTarget() {
        return this.settings.redirectTarget || 'Record';
    }
    get redirectIsCustom() {
        return this.redirectTarget === 'Custom';
    }
    get redirectUrl() {
        return this.settings.redirectUrl || '';
    }
    get redirectDelay() {
        return this.settings.redirectDelay;
    }

    // --- Action button ---
    get showActionButton() {
        return this.settings.showActionButton || false;
    }
    get actionButtonLabel() {
        return this.settings.actionButtonLabel || 'Continue';
    }
    get actionTarget() {
        return this.settings.actionButtonTarget || 'Record';
    }
    get actionIsCustom() {
        return this.actionTarget === 'Custom';
    }
    get actionUrl() {
        return this.settings.actionButtonUrl || '';
    }

    fire(property, value) {
        this.dispatchEvent(
            new CustomEvent('completionchange', { detail: { property, value } })
        );
    }

    handleModeChange(e) { this.fire('afterSubmitMode', e.detail.value); }
    handleToastTarget(e) { this.fire('toastAndGoTarget', e.detail.value); }
    handleToastUrl(e) { this.fire('toastAndGoUrl', e.detail.value); }
    handleThankYou(e) { this.fire('thankYouMessage', e.detail.value); }
    handleAutoRedirect(e) { this.fire('autoRedirect', e.detail.checked); }
    handleRedirectTarget(e) { this.fire('redirectTarget', e.detail.value); }
    handleRedirectUrl(e) { this.fire('redirectUrl', e.detail.value); }
    handleDelay(e) { this.fire('redirectDelay', e.detail.value); }
    handleShowAction(e) { this.fire('showActionButton', e.detail.checked); }
    handleActionLabel(e) { this.fire('actionButtonLabel', e.detail.value); }
    handleActionTarget(e) { this.fire('actionButtonTarget', e.detail.value); }
    handleActionUrl(e) { this.fire('actionButtonUrl', e.detail.value); }
}