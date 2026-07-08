import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';
import listForms from '@salesforce/apex/FinalStudioController.listForms';

/**
 * finalFormsLibrary — the Forms tab (FORM_STUDIO_IA §1/§2).
 *
 * The library IS the picker: Open in Studio navigates to the studio tab with
 * `c__formId` state — the ONLY way a form reaches the builder. Creation is
 * gallery-first and lands in P6; this slice lists and opens.
 */

const STUDIO_TAB = 'Final_Studio';

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
        this[NavigationMixin.Navigate]({
            type: 'standard__navItemPage',
            attributes: { apiName: STUDIO_TAB },
            state: { c__formId: event.currentTarget.dataset.id }
        });
    }

    handleRefresh() {
        refreshApex(this._wired);
    }
}
