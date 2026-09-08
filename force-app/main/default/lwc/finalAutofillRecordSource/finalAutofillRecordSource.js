import { LightningElement, api, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';

/**
 * finalAutofillRecordSource — Renderless LWC using LDS getRecord (IMPL_PLAN_AUTOFILL_RULES §5).
 * Reads source record values under the running user's own access.
 */
export default class FinalAutofillRecordSource extends LightningElement {
    @api ruleId;
    @api recordId;
    @api objectApiName;
    @api fields = [];
    @api generation;
    @api sessionId;

    /** REQUIRED by the getRecord contract — `fields` or `layoutTypes` must be
     *  present, and Id is the one field every readable record has. Putting the
     *  mapped fields here instead would fail the WHOLE read whenever a single
     *  field is unreadable; they belong in optionalFields (§5: "so unavailable
     *  optional fields are omitted rather than failing every mapping"). */
    get wireRequiredFields() {
        if (!this.objectApiName) {
            return [];
        }
        return [`${this.objectApiName}.Id`];
    }

    /** Mapped source fields — optional so an unreadable one is omitted, which
     *  is what preserves "omitted" as distinct from "null". */
    get wireOptionalFields() {
        if (!this.objectApiName || !Array.isArray(this.fields)) {
            return [];
        }
        const set = new Set();
        for (const f of this.fields) {
            if (f) {
                set.add(`${this.objectApiName}.${f}`);
            }
        }
        return Array.from(set);
    }

    @wire(getRecord, {
        recordId: '$recordId',
        fields: '$wireRequiredFields',
        optionalFields: '$wireOptionalFields'
    })
    wiredRecord({ error, data }) {
        if (!this.recordId) {
            return;
        }
        if (data) {
            // A queued response must never be labelled as a different record.
            if (data.id && data.id.slice(0, 15) !== this.recordId.slice(0, 15))
                return;
            const values = {};
            const recordFields = data.fields || {};
            for (const fieldName of this.fields) {
                if (recordFields[fieldName] !== undefined) {
                    values[fieldName] = recordFields[fieldName].value;
                }
            }
            this.dispatchEvent(
                new CustomEvent('recordsuccess', {
                    detail: {
                        ruleId: this.ruleId,
                        recordId: this.recordId,
                        generation: this.generation,
                        sessionId: this.sessionId,
                        values
                    },
                    bubbles: true,
                    composed: true
                })
            );
        } else if (error) {
            this.dispatchEvent(
                new CustomEvent('recorderror', {
                    detail: {
                        ruleId: this.ruleId,
                        recordId: this.recordId,
                        generation: this.generation,
                        sessionId: this.sessionId,
                        error
                    },
                    bubbles: true,
                    composed: true
                })
            );
        }
    }
}
