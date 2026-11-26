import { LightningElement, api } from 'lwc';
import { t } from 'c/finalTranslate';

/** Refresh an unused slot this long before it expires. */
const REFRESH_LEAD_MS = 60000;

/**
 * Native transport with metadata-only simulated selection in Studio.
 *
 * IMPL_PLAN_UPLOAD_RECORDS_ON_ARRIVAL: the uploader shows straight away. A
 * signed slot is reserved quietly (no server record) and handed to the native
 * uploader; a file row exists only once the server confirms that file arrived.
 * `uploadfinished` also fires after a refused or cancelled upload, so it is
 * never trusted on its own: the server's status decides.
 */
export default class FinalFileUpload extends LightningElement {
    @api elementId;
    @api label;
    @api config = {};
    @api preview = false;
    _rows = [];
    busy = false;
    error;
    /** The current, unused slot handed to the native uploader. */
    grant;
    /** Every slot handed out on this page: slotKey -> slotToken. A file sent
     *  with an older slot (refreshed mid-upload) is still recognised. */
    _issued = new Map();
    _generation = 0;
    _context;
    _refreshTimer;
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
            this._clearRefresh();
            this.grant = undefined;
            this.error = undefined;
            this.busy = false;
            this._rows = [];
            this._issued = new Map();
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
        this._clearRefresh();
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
    /** Shown but unusable until a slot is ready, so no file goes up unsigned. */
    get uploaderDisabled() {
        return !this.grant;
    }
    get markerField() {
        return this.grant?.markerField;
    }
    get slotToken() {
        return this.grant?.slotToken;
    }
    get uploadAccept() {
        return this.grant?.accept || this.accept;
    }
    get hasPending() {
        return this._rows.some((row) => row.state !== 'ready');
    }
    /** Retry re-checks pending files, or asks for a slot again after a failure. */
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
    _clearRefresh() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = undefined;
        }
    }
    _scheduleRefresh(grant) {
        this._clearRefresh();
        const expires = Date.parse(grant?.expiresAt);
        if (Number.isNaN(expires)) return;
        const wait = Math.max(expires - Date.now() - REFRESH_LEAD_MS, 1000);
        const generation = this._generation;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            if (generation === this._generation && this.grant === grant)
                this._reserve();
        }, wait);
    }
    /** Ask for a signed slot. The server saves nothing. */
    async _reserve() {
        if (this.preview || !this.canAddMore || !this.elementId) return;
        const generation = this._generation;
        this.error = undefined;
        try {
            const grant = await this._request({ action: 'reserve' });
            if (generation !== this._generation) return;
            this._issued.set(grant.slotKey, grant.slotToken);
            this.grant = grant;
            this._scheduleRefresh(grant);
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
        // decides. Until it answers, a pending row holds Submit: otherwise a
        // fast Submit could go without a file that did arrive (and the server
        // would then clean that file up as unselected).
        const slot = this.grant;
        if (slot && !this._rows.some((row) => row.key === slot.slotKey)) {
            this._emit([
                ...this._rows,
                {
                    kind: 'stagedV1',
                    key: slot.slotKey,
                    slotToken: slot.slotToken,
                    name: event?.detail?.files?.[0]?.name || '',
                    state: 'pending'
                }
            ]);
        }
        return this.handleCheck();
    }
    handleRetry() {
        return this.hasPending ? this.handleCheck() : this._reserve();
    }
    async handleCheck() {
        const generation = this._generation;
        this.busy = true;
        try {
            const result = await this._request({ action: 'status' });
            if (generation !== this._generation) return;
            const receipts = (result.files || []).filter(
                (row) =>
                    row.elementId === this.elementId &&
                    !['REMOVED', 'CANCELLED', 'EXPIRED'].includes(row.state)
            );
            const byKey = new Map(receipts.map((row) => [row.key, row]));
            const toRow = (row, receipt) => ({
                ...row,
                name: receipt.name || row.name,
                sizeBytes: receipt.sizeBytes,
                state: receipt.state === 'READY' ? 'ready' : 'pending'
            });
            const next = [];
            for (const row of this._rows) {
                if (byKey.has(row.key)) {
                    next.push(toRow(row, byKey.get(row.key)));
                }
            }
            const known = new Set(next.map((row) => row.key));
            for (const receipt of receipts) {
                if (!known.has(receipt.key) && this._issued.has(receipt.key)) {
                    next.push(
                        toRow(
                            {
                                kind: 'stagedV1',
                                key: receipt.key,
                                slotToken: this._issued.get(receipt.key)
                            },
                            receipt
                        )
                    );
                }
            }
            this._emit(next);
            this.error = next.some((row) => row.state !== 'ready')
                ? t('Final_Run_UploadStatusFailed')
                : undefined;
            // The current slot is used up once its file arrived; nothing
            // arrived (refused or cancelled) means the same slot stays ready.
            if (this.grant && byKey.has(this.grant.slotKey)) {
                this.grant = undefined;
                this._clearRefresh();
                this._reserve();
            }
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
                await this._request({
                    action: 'remove',
                    slotToken: row.slotToken
                });
            if (generation !== this._generation) return;
            this._emit(this._rows.filter((file) => file.key !== key));
            this._refocus = true;
            if (!this.grant) this._reserve();
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
