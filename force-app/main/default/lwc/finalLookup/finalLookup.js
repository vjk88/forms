import { LightningElement, api } from 'lwc';
import isGuest from '@salesforce/user/isGuest';

/**
 * Forms adapter over the reusable `c/finalRecordLookup` core.
 *
 * It renders nothing of its own. Its whole job is translation: Forms speaks
 * `elementId` / `targetObject` / `valuechange`, the core speaks
 * `objectApiName` / `selectionchange`. Keeping the two vocabularies apart is
 * what lets the core be dropped into a Flow or any other LWC without dragging
 * Forms concepts along.
 *
 * The outward contract is FROZEN: `valuechange` carries exactly
 * `{ elementId, value }`, bubbling and composed. Extra fields the core learns
 * to emit must never leak into a Forms answer.
 */
export default class FinalLookup extends LightningElement {
    @api elementId;
    @api label = 'Lookup';
    @api value = null;
    @api targetObject;
    @api placeholder = 'Search...';
    @api required = false;
    @api disabled = false;
    @api readOnly = false;

    /** Resolved lookup policy, forwarded verbatim. The adapter never composes
     *  or interprets these — a caller that resolved answer tokens into a
     *  native filter owns their meaning. */
    @api filter;
    @api matchingInfo;
    @api displayInfo;
    @api pending = false;

    /**
     * Identity of the configuration generation this instance belongs to. A
     * selection stamped with anything else is a late event from a retired
     * configuration and is dropped rather than written into an answer.
     */
    @api contextKey;

    get isGuestUser() {
        return Boolean(isGuest);
    }

    get isLookupDisabled() {
        return Boolean(this.disabled || this.readOnly);
    }

    get unavailableMessage() {
        return this.isGuestUser
            ? 'Lookup selection is unavailable for guest respondents. Enter details directly if applicable.'
            : undefined;
    }

    handleSelectionChange(event) {
        const detail = event.detail || {};
        if (!this._isCurrentContext(detail.contextKey)) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: {
                    elementId: this.elementId,
                    value: detail.recordId || null
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleLookupError(event) {
        // Preserved for compatibility with the original picker passthrough.
        this.dispatchEvent(
            new CustomEvent('pickererror', {
                detail: event.detail,
                bubbles: true,
                composed: true
            })
        );
    }

    /** `undefined` and `null` both mean "no generation in play" — normalize,
     *  or an unconfigured adapter would reject every selection the core makes. */
    _isCurrentContext(incoming) {
        return (incoming || null) === (this.contextKey || null);
    }

    @api
    reportValidity() {
        const core = this._core();
        return core && typeof core.reportValidity === 'function'
            ? core.reportValidity()
            : true;
    }

    @api
    checkValidity() {
        const core = this._core();
        return core && typeof core.checkValidity === 'function'
            ? core.checkValidity()
            : true;
    }

    @api
    focus() {
        const core = this._core();
        if (core && typeof core.focus === 'function') {
            core.focus();
        }
    }

    _core() {
        return this.template.querySelector('[data-id="core"]');
    }
}
