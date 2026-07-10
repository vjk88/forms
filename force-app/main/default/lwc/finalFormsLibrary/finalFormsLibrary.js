import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import listForms from '@salesforce/apex/FinalStudioController.listForms';

/**
 * finalFormsLibrary — the Forms tab (FORM_STUDIO_IA §1/§2).
 *
 * The library IS the picker: Open in Studio navigates to the full-page VF
 * host with `c__formId` — the ONLY way a form reaches the builder. Creation
 * is gallery-first and lands in P6; this slice lists and opens.
 */

const STUDIO_PAGE = '/apex/FinalStudio';

export default class FinalFormsLibrary extends NavigationMixin(
    LightningElement
) {
    rows;
    error;
    _wired;

    @wire(listForms)
    wiredForms(result) {
        this._wired = result;
        if (result.data) {
            this.rows = result.data.map((r) => ({
                ...r,
                versionLabel: r.hasDraft
                    ? r.activeVersion
                        ? `v${r.activeVersion} + draft`
                        : 'Draft'
                    : r.activeVersion
                      ? `v${r.activeVersion} · Published`
                      : '—',
                objectLabel: r.objectApi || '—'
            }));
            this.error = undefined;
        } else if (result.error) {
            this.error = 'Forms could not be loaded.';
        }
    }

    get empty() {
        return this.rows && this.rows.length === 0;
    }

    handleOpen(event) {
        // Full-page studio (owner 2026-07-10): the VF host escapes LEX
        // chrome; standard__webPage opens it in its own browser tab.
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: `${STUDIO_PAGE}?c__formId=${event.currentTarget.dataset.id}`
            }
        });
    }

    handleRefresh() {
        refreshApex(this._wired);
    }
}
