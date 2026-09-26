import { LightningElement, api } from 'lwc';

/**
 * Invitation-link editor for a survey connected to a Salesforce record.
 * The studio owns Apex calls and passes their results back through public APIs.
 */
export default class FinalRecordLinkPanel extends LightningElement {
    @api objectApi;
    @api linkBusy;
    @api linkError;
    @api linkNotice;

    @api
    get mintedLink() {
        return this._mintedLink;
    }
    set mintedLink(value) {
        if (value && value !== this._mintedLink) {
            this.recordId = '';
            this.recipient = '';
        }
        this._mintedLink = value;
    }

    /**
     * What the Studio's busy call is: 'mint', 'stop' or ''. When a stop
     * finishes, hand focus back to the button that started it.
     */
    @api
    get linkAction() {
        return this._linkAction;
    }
    set linkAction(value) {
        if (this._linkAction === 'stop' && value !== 'stop') {
            this._focusNext = '.rl-stop-trigger';
        }
        this._linkAction = value || '';
    }

    _mintedLink;
    _linkAction = '';
    /** The "Stop every link made so far?" question is showing. */
    confirmingStop = false;
    _focusNext = null;
    recordId = '';
    tracked = false;
    recipient = '';
    singleUse = false;
    copied = false;

    get createDisabled() {
        const recordId = this.recordId.trim();
        return this.linkBusy || ![15, 18].includes(recordId.length);
    }

    get createLabel() {
        return this.linkAction === 'mint'
            ? 'Creating invitation…'
            : 'Create invitation link';
    }

    get stopLabel() {
        return this.linkAction === 'stop' ? 'Stopping…' : 'Stop earlier links';
    }

    get stopExpanded() {
        return this.confirmingStop ? 'true' : 'false';
    }

    /** Old results would sit beside the question; hide them while asking. */
    get showError() {
        return Boolean(this.linkError) && !this.confirmingStop;
    }

    get showNotice() {
        return Boolean(this.linkNotice) && !this.confirmingStop;
    }

    get copyLabel() {
        return this.copied ? 'Copied' : 'Copy';
    }

    get recordIdHelp() {
        const recordId = this.recordId.trim();
        if (!recordId || [15, 18].includes(recordId.length)) {
            return '';
        }
        return 'Enter a 15- or 18-character Salesforce record ID.';
    }

    handleRecordId(event) {
        this.recordId = event.target.value;
    }

    handleTracked(event) {
        this.tracked = event.target.checked;
    }

    handleRecipient(event) {
        this.recipient = event.target.value;
    }

    handleSingleUse(event) {
        this.singleUse = event.target.checked;
    }

    handleCreate() {
        const recordId = this.recordId.trim();
        if (![15, 18].includes(recordId.length)) {
            return;
        }
        // One link call at a time: creating closes the stop question.
        this.confirmingStop = false;
        this.dispatchEvent(
            new CustomEvent('mintlink', {
                detail: {
                    recordId,
                    tracked: this.tracked,
                    recipient: this.tracked ? this.recipient : '',
                    singleUse: this.tracked ? this.singleUse : false
                }
            })
        );
    }

    /**
     * The question is asked inline, not with `lightning/confirm`: in the
     * VF-hosted Studio that modal never settles after Cancel (same fix as
     * c/finalAutofillPanel). The Studio still does the stopping.
     */
    handleInvalidate() {
        if (this.linkBusy) {
            return;
        }
        this.confirmingStop = true;
        // Land on the safe choice.
        this._focusNext = '.rl-stop-cancel';
    }

    handleStopCancel() {
        this.confirmingStop = false;
        this._focusNext = '.rl-stop-trigger';
    }

    handleStopKeydown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.handleStopCancel();
        }
    }

    handleStopConfirm() {
        if (this.linkBusy) {
            return;
        }
        this.confirmingStop = false;
        this._focusNext = '.rl-stop-trigger';
        this.dispatchEvent(new CustomEvent('invalidatelinks'));
    }

    renderedCallback() {
        if (this._focusNext) {
            const target = this.template.querySelector(this._focusNext);
            this._focusNext = null;
            target?.focus();
        }
    }

    handleManage() {
        this.dispatchEvent(new CustomEvent('manageinvitations'));
    }

    handleCopy() {
        if (!this.mintedLink) {
            return;
        }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(this.mintedLink);
            this.copied = true;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                this.copied = false;
            }, 1500);
            return;
        }
        const output = this.template.querySelector('.rl-link-output');
        output?.select();
    }
}
