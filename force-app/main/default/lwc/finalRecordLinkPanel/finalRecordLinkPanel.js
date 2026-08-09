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

    _mintedLink;
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
        return this.linkBusy
            ? 'Creating invitation…'
            : 'Create invitation link';
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

    handleInvalidate() {
        this.dispatchEvent(new CustomEvent('invalidatelinks'));
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
