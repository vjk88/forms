import { LightningElement, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import listForms from '@salesforce/apex/FinalStudioController.listForms';
import restoreForm from '@salesforce/apex/FinalFormActionsController.restoreForm';
import { studioUrl } from 'c/finalStudioLink';

/** Forms and Surveys library with current/archived lifecycle filtering. */
export { studioUrl } from 'c/finalStudioLink';

export default class FinalFormsLibrary extends LightningElement {
    rows;
    error;
    _wired;
    showArchived = false;
    restoreBusyId;
    restoreNotice;

    /** Creation overlay (gallery-first flow). */
    showGallery = false;

    handleNew() {
        this.showGallery = true;
    }

    handleGalleryClose() {
        this.showGallery = false;
        refreshApex(this._wired);
    }

    handleFormCreated() {
        refreshApex(this._wired);
    }

    @wire(listForms, { includeArchived: '$showArchived' })
    wiredForms(result) {
        this._wired = result;
        if (result.data) {
            this.rows = result.data.map((row) => ({
                ...row,
                isArchived: row.status === 'Archived',
                versionLabel:
                    row.status === 'Archived'
                        ? 'Archived'
                        : row.hasDraft
                          ? row.activeVersion
                              ? `v${row.activeVersion} + draft`
                              : 'Draft'
                          : row.activeVersion
                            ? `v${row.activeVersion} · Published`
                            : '—',
                objectLabel: row.objectApi || '—',
                typeLabel: row.formType || 'Form'
            }));
            this.error = undefined;
        } else if (result.error) {
            this.error = 'Forms could not be loaded.';
        }
    }

    get empty() {
        return this.rows && this.rows.length === 0;
    }

    /** Rows decorated with per-row restore state so one Restore doesn't
     *  freeze every other row. */
    get decoratedRows() {
        const busyId = this.restoreBusyId;
        return (this.rows || []).map((row) => ({
            ...row,
            restoring: row.id === busyId,
            restoreLabel: row.id === busyId ? 'Restoring…' : 'Restore'
        }));
    }

    get emptyTitle() {
        return this.showArchived ? 'No archived forms' : 'No forms yet';
    }

    get emptyText() {
        return this.showArchived
            ? 'Archived forms will appear here and can be restored as private drafts.'
            : 'Click + New form to start from a survey template or a blank layout.';
    }

    handleStatusFilter(event) {
        this.showArchived = event.target.value === 'archived';
        this.rows = undefined;
        this.error = undefined;
        this.restoreNotice = undefined;
    }

    handleOpen(event) {
        // A user-gesture window.open to the raw VF domain avoids LEX wrapping.
        window.open(studioUrl(event.currentTarget.dataset.id), '_blank');
    }

    handleRefresh() {
        refreshApex(this._wired);
    }

    async handleRestore(event) {
        const formId = event.currentTarget.dataset.id;
        if (!formId || this.restoreBusyId) return;
        this.restoreBusyId = formId;
        this.restoreNotice = undefined;
        this.error = undefined;
        try {
            await restoreForm({ formId });
            this.restoreNotice =
                'Restored as a private draft — switch to Current to open it.';
            await refreshApex(this._wired);
        } catch (error) {
            this.error =
                error?.body?.message || 'The form could not be restored.';
        } finally {
            this.restoreBusyId = undefined;
        }
    }
}
