import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import listForms from '@salesforce/apex/FinalStudioController.listForms';
import { studioUrl } from 'c/finalStudioLink';

/**
 * finalFormsLibrary — the Forms tab (FORM_STUDIO_IA §1/§2).
 *
 * The library IS the picker: Open in Studio navigates to the full-page VF
 * host with `c__formId` — the ONLY way a form reaches the builder. Creation
 * is gallery-first and lands in P6; this slice lists and opens.
 *
 * studioUrl moved to c/finalStudioLink (2026-07-31): this template hosts
 * the creation gallery, so the gallery importing it from HERE was a module
 * cycle — the export didn't exist yet when the gallery evaluated, crashing
 * the creation done-screen. Re-exported for back-compat.
 */
export { studioUrl } from 'c/finalStudioLink';

export default class FinalFormsLibrary extends LightningElement {
    rows;
    error;
    _wired;

    /** Creation overlay (S5 wiring — the gallery finally has a HOST). */
    showGallery = false;

    handleNew() {
        this.showGallery = true;
    }

    handleGalleryClose() {
        this.showGallery = false;
        refreshApex(this._wired);
    }

    /** Created → refresh the list; the gallery's done screen owns the
     *  "Open in Studio" gesture (popup-safe). */
    handleFormCreated() {
        refreshApex(this._wired);
    }

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
        // Full-page studio (owner 2026-07-10). window.open, NOT the nav
        // service: the LEX router intercepts standard__webPage for ANY
        // salesforce-domain URL and wraps it in one:alohaPage — LEX chrome
        // around an iframe. A user-gesture window.open to the VF domain is
        // the only path the router never touches.
        window.open(studioUrl(event.currentTarget.dataset.id), '_blank');
    }

    handleRefresh() {
        refreshApex(this._wired);
    }
}
