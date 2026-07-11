import { LightningElement, wire } from 'lwc';
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

/**
 * The lightning.force.com host serves /apex pages WRAPPED in LEX chrome
 * (tabs + search bar) — the raw page lives on the enhanced-domain VF host:
 * {mydomain}--c.{partition}.vf.force.com. Salesforce bounce-authenticates
 * the VF domain automatically, so a direct absolute URL is safe. On any
 * other host (VF itself, my.salesforce.com) the relative URL serves raw.
 */
export function studioUrl(formId) {
    const m = window.location.hostname.match(
        /^([^.]+)\.(.*)lightning\.force\.com$/
    );
    const base = m ? `https://${m[1]}--c.${m[2]}vf.force.com` : '';
    return `${base}${STUDIO_PAGE}?c__formId=${formId}`;
}

export default class FinalFormsLibrary extends LightningElement {
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
