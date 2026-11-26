import { LightningElement, api } from 'lwc';
import { t } from 'c/finalTranslate';

/**
 * Native transport with metadata-only simulated selection in Studio.
 *
 * IMPL_PLAN_UPLOAD_RECORDS_ON_ARRIVAL: the uploader shows straight away. One
 * signed tag per question for this visit (no server record) is handed to the
 * native uploader and stamped on every file it uploads; the server creates the
 * attempt on the first accepted file. File rows come only from the server's
 * status. `uploadfinished` also fires after a refused or cancelled upload, so
 * it is never trusted on its own.
 */
export default class FinalFileUpload extends LightningElement {
    @api elementId;
    @api label;
    @api config = {};
    @api preview = false;
    _rows = [];
    busy = false;
    error;
    /** This question's signed tag for the visit. */
    grant;
    _generation = 0;
    _context;
    _connected = false;
    /** After a removal, move focus to the uploader once it is usable. */
    _refocus = false;

    @api
    get contextVersion() {
        return this._context;
    }
    set contextVersion(value) {
        if (value !== this._context) {
            this._context = value;
            this._generation += 1;
            this.grant = undefined;
            this.error = undefined;
            this.busy = false;
            this._rows = [];
            if (this._connected) this._reserve();
        }
    }

    @api
    get value() {
        return this._rows;
    }
    set value(value) {
        this._rows = Array.isArray(value) ? [...value] : [];
    }
    connectedCallback() {
        this._connected = true;
        this._reserve();
    }
    disconnectedCallback() {
        this._connected = false;
        this._generation += 1;
    }
    renderedCallback() {
        if (!this._refocus || this.busy) return;
        const uploader = this.template.querySelector('lightning-file-upload');
        if (!uploader) {
            this._refocus = false; // no more files allowed: nothing to focus
        } else if (!this.uploaderDisabled) {
            this._refocus = false;
            uploader.focus();
        }
    }

    get rows() {
        return this._rows.map((row) => ({
            ...row,
            removeLabel: t('Final_Run_RemoveFile', row.name || this.label),
            size: row.sizeBytes
                ? `${(row.sizeBytes / 1048576).toFixed(2)} MiB`
                : '',
            pending: row.state !== 'ready',
            status:
                row.state === 'ready'
                    ? t('Final_Run_UploadReady')
                    : t('Final_Run_UploadChecking')
        }));
    }
    get addLabel() {
        return t('Final_Run_AddFile');
    }
    get checkLabel() {
        return t('Final_Run_Retry');
    }
    get previewText() {
        return t('Final_Run_UploadPreview');
    }
    get accept() {
        return this.config?.accept || undefined;
    }
    get multiple() {
        return this.config?.multiple !== false;
    }
    /** Whether this question can take another file. */
    get canAddMore() {
        if (!this.multiple) return this._rows.length === 0;
        const max = Number(this.config?.maxFiles);
        return !(max > 0 && this._rows.length >= max);
    }
    get showUploader() {
        return !this.preview && this.canAddMore;
    }
    /** Shown but unusable until the tag is ready, so no file goes up unsigned. */
    get uploaderDisabled() {
        return !this.grant || this.hasPending;
    }
    /** Waiting for the tag (guests: the page's bot check): say so. */
    get preparing() {
        return this.showUploader && !this.grant && !this.error;
    }
    get preparingText() {
        return t('Final_Run_UploadPreparing');
    }
    get groupBusy() {
        return this.preparing ? 'true' : 'false';
    }
    /** While the uploader is disabled its file input cannot take a drop, so
     *  the browser would open the dropped file and leave the form. */
    handleDisabledDrop(event) {
        if (this.uploaderDisabled) event.preventDefault();
    }
    get markerField() {
        return this.grant?.markerField;
    }
    get tag() {
        return this.grant?.tag;
    }
    get uploadAccept() {
        return this.grant?.accept || this.accept;
    }
    get hasPending() {
        return this._rows.some((row) => row.state !== 'ready');
    }
    /** Retry re-checks pending files, or asks for the tag again after a failure. */
    get showRetry() {
        return (
            !this.preview &&
            (this.hasPending ||
                (this.canAddMore && !this.grant && !!this.error))
        );
    }
    get guidance() {
        const types = this.accept || '';
        const size =
            this.grant?.maxBytes == null
                ? ''
                : t(
                      'Final_Run_FileUpTo',
                      `${(this.grant.maxBytes / 1048576).toFixed(2)} MiB`
                  );
        return [types, size].filter(Boolean).join(' · ');
    }
    _emit(rows) {
        this._rows = rows;
        this.dispatchEvent(
            new CustomEvent('valuechange', { detail: { value: rows } })
        );
    }
    _request(operation) {
        return new Promise((resolve, reject) => {
            this.dispatchEvent(
                new CustomEvent('uploadoperation', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        operation: { ...operation, elementId: this.elementId },
                        resolve,
                        reject
                    }
                })
            );
        });
    }
    /** Ask once for this question's signed tag. The server saves nothing. */
    async _reserve() {
        if (this.preview || this.grant || !this.elementId) return;
        const generation = this._generation;
        this.error = undefined;
        try {
            const grant = await this._request({ action: 'reserve' });
            if (generation !== this._generation) return;
            this.grant = grant;
        } catch (error) {
            if (generation === this._generation)
                this.error =
                    error?.body?.message ||
                    error?.message ||
                    t('Final_Run_UploadUnavailable');
        }
    }
    handleFinished(event) {
        // Fires after success, refusal and cancel alike, so the server's status
        // decides. Until it answers, one pending row per reported file holds
        // Submit: otherwise a fast Submit could go without files that did
        // arrive (and the server would then clean them up as unselected).
        const reported = event?.detail?.files || [];
        const pending = (reported.length ? reported : [{}]).map(
            (file, index) => ({
                kind: 'stagedV1',
                key: `checking-${Date.now()}-${index}`,
                name: file?.name || '',
                state: 'pending'
            })
        );
        this._emit([...this._rows, ...pending]);
        return this.handleCheck();
    }
    handleRetry() {
        return this.hasPending ? this.handleCheck() : this._reserve();
    }
    /** Rows are exactly the server's live files for this question. */
    async handleCheck() {
        const generation = this._generation;
        this.busy = true;
        try {
            const result = await this._request({ action: 'status' });
            if (generation !== this._generation) return;
            const next = (result.files || [])
                .filter(
                    (row) =>
                        row.elementId === this.elementId &&
                        row.state === 'READY'
                )
                .map((receipt) => ({
                    kind: 'stagedV1',
                    key: receipt.key,
                    name: receipt.name,
                    sizeBytes: receipt.sizeBytes,
                    state: 'ready'
                }));
            this._emit(next);
            this.error = undefined;
        } catch (error) {
            if (generation === this._generation)
                this.error =
                    error?.body?.message || t('Final_Run_UploadStatusFailed');
        } finally {
            if (generation === this._generation) this.busy = false;
        }
    }
    async handleRemove(event) {
        const key = event.currentTarget.dataset.key;
        const row = this._rows.find((file) => file.key === key);
        if (!row) return;
        const generation = this._generation;
        this.busy = true;
        this.error = undefined;
        try {
            if (!this.preview)
                await this._request({ action: 'remove', fileKey: row.key });
            if (generation !== this._generation) return;
            this._emit(this._rows.filter((file) => file.key !== key));
            this._refocus = true;
        } catch (error) {
            if (generation === this._generation)
                this.error =
                    error?.body?.message || t('Final_Run_UploadUnavailable');
        } finally {
            if (generation === this._generation) this.busy = false;
        }
    }
    handlePreviewAdd() {
        this.template.querySelector('input[type="file"]')?.click();
    }
    handlePreviewPick() {
        const input = this.template.querySelector('input[type="file"]');
        const picked = [...(input?.files || [])];
        const files = this.multiple ? picked : picked.slice(0, 1);
        // Metadata only: no FileReader, Base64, Apex request or Salesforce File.
        const rows = files.map((file, index) => ({
            kind: 'preview',
            key: `preview-${Date.now()}-${index}`,
            name: file.name,
            sizeBytes: file.size,
            state: 'ready'
        }));
        const maxBytes = this.config?.maxSizeBytes;
        if (maxBytes && rows.some((row) => row.sizeBytes > maxBytes)) {
            this.error = t('Final_Run_UploadSize');
            return;
        }
        this._emit(this.multiple ? [...this._rows, ...rows] : rows);
        if (input) input.value = '';
    }
}
