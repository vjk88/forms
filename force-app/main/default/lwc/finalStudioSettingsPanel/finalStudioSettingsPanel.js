import { LightningElement, api } from 'lwc';

const DEFAULT_CLOSED_MESSAGE = 'This form is no longer accepting responses.';

export default class FinalStudioSettingsPanel extends LightningElement {
    @api section = 'availability';
    @api isSurvey;
    @api objectApi;
    @api mappedCount;
    @api pendingObjectChange;
    @api objectError;
    @api objectSaveText;
    @api isPublic;
    @api publicBusy;
    @api publicSaveText;
    @api publicHelp;
    @api mintedLink;
    @api linkBusy;
    @api linkError;
    @api linkNotice;
    @api specSaveText;

    _availability = {};
    dateError = '';

    @api
    get availability() {
        return this._availability;
    }
    set availability(value) {
        this._availability = { ...(value || {}) };
        this.dateError = '';
    }

    get isConnection() {
        return this.section === 'connection';
    }

    get isAvailability() {
        return this.section === 'availability';
    }

    get isAccess() {
        return this.section === 'access';
    }

    get acceptingResponses() {
        return this._availability.status !== 'closed';
    }

    get opensAtValue() {
        return this._availability.opensAt || null;
    }

    get closesAtValue() {
        return this._availability.closesAt || null;
    }

    get responseCapValue() {
        return this._availability.responseCap ?? null;
    }

    get closedMessageValue() {
        return this._availability.closedMessage || DEFAULT_CLOSED_MESSAGE;
    }

    handleAcceptingChange(event) {
        this.commitAvailability({
            status: event.target.checked ? 'active' : 'closed'
        });
    }

    handleOpensAtChange(event) {
        this.commitDate('opensAt', event.target.value);
    }

    handleClosesAtChange(event) {
        this.commitDate('closesAt', event.target.value);
    }

    handleResponseCapChange(event) {
        const value = event.target.value;
        const cap = value === '' || value === null ? null : Number(value);
        if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
            event.target.setCustomValidity(
                'Enter a whole number greater than zero.'
            );
            event.target.reportValidity();
            return;
        }
        event.target.setCustomValidity('');
        event.target.reportValidity();
        this.commitAvailability({ responseCap: cap });
    }

    handleClosedMessageChange(event) {
        this.commitAvailability({
            closedMessage: event.target.value || DEFAULT_CLOSED_MESSAGE
        });
    }

    commitDate(field, localValue) {
        const next = {
            ...this._availability,
            [field]: this.toIsoDateTime(localValue)
        };
        const opensAt = next.opensAt ? new Date(next.opensAt) : null;
        const closesAt = next.closesAt ? new Date(next.closesAt) : null;
        if (opensAt && closesAt && opensAt >= closesAt) {
            this.dateError = 'Closing time must be later than opening time.';
            return;
        }
        this.dateError = '';
        this.commitAvailability({ [field]: next[field] });
    }

    commitAvailability(change) {
        this._availability = {
            status: 'active',
            opensAt: null,
            closesAt: null,
            responseCap: null,
            closedMessage: DEFAULT_CLOSED_MESSAGE,
            ...this._availability,
            ...change
        };
        this.dispatchEvent(
            new CustomEvent('settingschange', {
                detail: { availability: { ...this._availability } }
            })
        );
    }

    toIsoDateTime(value) {
        if (!value) {
            return null;
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    relayObjectPick(event) {
        this.dispatchEvent(
            new CustomEvent('objectpick', { detail: event.detail })
        );
    }

    relaySimpleEvent(event) {
        this.dispatchEvent(new CustomEvent(event.type));
    }

    handlePublicChange(event) {
        const checked = event.target.checked;
        // The parent owns the committed value. Keep the control on that value
        // while confirmation/Apex runs, then let the public API update it.
        event.target.checked = this.isPublic;
        this.dispatchEvent(
            new CustomEvent('publicchange', {
                detail: { checked }
            })
        );
    }

    relayMintLink(event) {
        this.dispatchEvent(
            new CustomEvent('mintlink', { detail: event.detail })
        );
    }
}
