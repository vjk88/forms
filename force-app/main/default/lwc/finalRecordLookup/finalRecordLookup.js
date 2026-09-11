import { LightningElement, api } from 'lwc';

/**
 * Reusable single-record lookup. Wraps `lightning-record-picker` and NOTHING
 * else: it imports no Forms controller, reads no spec, knows no element id and
 * runs no Autofill. Callers own all policy; this owns rendering, accessible
 * state and one normalized event shape.
 *
 * Slice 1 of IMPL_PLAN_DEPENDENT_LOOKUP. The native contract it relies on was
 * measured, not assumed — see DEPENDENT_LOOKUP_SPIKE_EVIDENCE.md.
 */

/** Safe, caller-facing error codes. Native/Apex detail never escapes. */
const ERROR_CODES = {
    SEARCH_FAILED: 'SEARCH_FAILED'
};

const STATUS = {
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error'
};

export default class FinalRecordLookup extends LightningElement {
    @api objectApiName;
    @api label = 'Lookup';
    @api placeholder = 'Search...';
    @api variant = 'label-hidden';
    @api required = false;
    @api disabled = false;
    @api readOnly = false;
    @api filter;
    @api matchingInfo;
    @api displayInfo;

    /** Caller-controlled blocked/loading state. `pending` means the caller is
     *  still resolving policy; `unavailableMessage` means it cannot be
     *  resolved at all. Neither is a native concept. */
    @api pending = false;
    @api unavailableMessage;

    /**
     * Controlled value. Reading it back always returns what the CALLER set,
     * never what the respondent just picked — otherwise a caller that rejects
     * a selection would find its own property already rewritten behind it.
     * The optimistic paint lives in `_displayValue`, which the template binds.
     */
    @api
    get value() {
        return this._value;
    }
    set value(next) {
        const normalized = next || null;
        this._value = normalized;
        // An input setter is not a user action. Emitting here would make every
        // programmatic hydrate look like a selection to the caller.
        this._displayValue = normalized;
    }

    get displayValue() {
        return this._displayValue;
    }

    /**
     * Opaque identity of the configuration that produced this instance. It is
     * captured ONCE, at connect, and stamped on every outgoing event.
     *
     * Immutable on purpose: native events carry no request identity, so a
     * control that read this live would stamp a late event from an old
     * configuration with the current key and falsely legitimize it. Callers
     * change configuration generations by remounting this component, not by
     * writing a new key onto a live one.
     */
    @api contextKey;

    _value = null;
    _displayValue = null;
    _instanceContext = null;
    _customValidity = '';
    _wrapperError = '';
    _status = STATUS.LOADING;

    connectedCallback() {
        this._instanceContext = this.contextKey || null;
        this._emitStatus(this.isUnavailable ? STATUS.ERROR : STATUS.LOADING);
    }

    // ---------------------------------------------------------------- render

    get isUnavailable() {
        return Boolean(this.unavailableMessage);
    }

    /** `pending` blocks interaction but is not read-only: a caller resolving
     *  policy must not look like a permanently locked field. */
    get isPickerDisabled() {
        return Boolean(this.disabled || this.readOnly || this.pending);
    }

    get hasError() {
        return Boolean(this._wrapperError);
    }

    get errorText() {
        return this._wrapperError;
    }

    /** An externally-labelled control still needs an accessible name, so the
     *  label is always handed to the native control even when visually hidden. */
    get pickerVariant() {
        return this.variant || 'label-hidden';
    }

    get wrapperClass() {
        return this.hasError ? 'record-lookup has-error' : 'record-lookup';
    }

    // ------------------------------------------------------------ native I/O

    handleChange(event) {
        const recordId = (event.detail && event.detail.recordId) || null;
        if (recordId === this._displayValue) {
            return;
        }
        this._displayValue = recordId;
        // A fresh selection retires whatever complaint was on screen.
        this._wrapperError = '';
        this.dispatchEvent(
            new CustomEvent('selectionchange', {
                detail: { recordId, contextKey: this._instanceContext }
            })
        );
    }

    /** Native readiness describes the CONTROL, never the selected record's
     *  membership in the current filter. Callers must not read it as proof. */
    handleReady() {
        this._emitStatus(STATUS.READY);
    }

    handleError() {
        this._emitStatus(STATUS.ERROR);
        this.dispatchEvent(
            new CustomEvent('lookuperror', {
                detail: {
                    code: ERROR_CODES.SEARCH_FAILED,
                    message: 'Search is unavailable right now.',
                    contextKey: this._instanceContext
                }
            })
        );
    }

    _emitStatus(status) {
        this._status = status;
        this.dispatchEvent(
            new CustomEvent('lookupstatechange', {
                detail: { status, contextKey: this._instanceContext }
            })
        );
    }

    // ------------------------------------------------------------ public API

    @api
    focus() {
        const picker = this._picker();
        if (picker && typeof picker.focus === 'function') {
            picker.focus();
        }
    }

    @api
    setCustomValidity(message) {
        this._customValidity = message || '';
    }

    /**
     * Wrapper-defined validity. Deliberately NOT a pass-through: the native
     * control cannot see `pending`, `unavailableMessage` or a caller's custom
     * error, and an unavailable-but-required empty field must fail rather than
     * sail through because no control was rendered.
     */
    @api
    checkValidity() {
        return !this._failureMessage();
    }

    @api
    reportValidity() {
        const failure = this._failureMessage();
        this._wrapperError = failure;
        if (failure) {
            return false;
        }
        const picker = this._picker();
        // Measured on this platform: the native method exists and returns a
        // boolean. Still guarded, because this component is reusable and may
        // outlive that observation.
        if (picker && typeof picker.reportValidity === 'function') {
            return picker.reportValidity() !== false;
        }
        return true;
    }

    // ----------------------------------------------------------------- rules

    _failureMessage() {
        if (this._customValidity) {
            return this._customValidity;
        }
        const empty = !this._displayValue;
        if (this.isUnavailable) {
            // A preserved value survives an unavailable control; an empty
            // required one must say so instead of passing by default.
            return this.required && empty ? this.unavailableMessage : '';
        }
        if (this.pending && this.required && empty) {
            return 'Still loading. Try again in a moment.';
        }
        if (this.required && empty) {
            return `${this.label} is required.`;
        }
        const picker = this._picker();
        if (picker && typeof picker.checkValidity === 'function') {
            return picker.checkValidity() === false
                ? `${this.label} is required.`
                : '';
        }
        return '';
    }

    _picker() {
        return this.template.querySelector('[data-id="picker"]');
    }
}
