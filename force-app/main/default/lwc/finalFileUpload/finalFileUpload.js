import { LightningElement, api } from 'lwc';
import { t } from 'c/finalTranslate';

/** Native transport with metadata-only simulated selection in Studio. */
export default class FinalFileUpload extends LightningElement {
    @api elementId;
    @api label;
    @api config = {};
    @api preview = false;
    _rows = [];
    busy = false;
    error;
    grant;
    _generation = 0;
    _context;
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
        }
    }

    @api
    get value() {
        return this._rows;
    }
    set value(value) {
        this._rows = Array.isArray(value) ? [...value] : [];
    }
    disconnectedCallback() {
        this._generation += 1;
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
        return this.busy
            ? t('Final_Run_UploadPreparing')
            : t('Final_Run_AddFile');
    }
    get checkLabel() {
        return t('Final_Run_Retry');
    }
    get cancelLabel() {
        return t('Final_Run_UploadCancel');
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
    get addDisabled() {
        return (
            this.busy ||
            !!this.grant ||
            (!this.multiple && this._rows.length > 0)
        );
    }
    get hasPending() {
        return this._rows.some((row) => row.state !== 'ready');
    }
    get instances() {
        return this.grant
            ? [{ ...this.grant, generation: this._generation }]
            : [];
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
    async handleAdd() {
        if (this.preview) {
            this.template.querySelector('input[type="file"]')?.click();
            return;
        }
        const generation = this._generation;
        this.busy = true;
        this.error = undefined;
        try {
            const grant = await this._request({ action: 'reserve' });
            if (generation !== this._generation) return;
            this.grant = grant;
            this._emit([
                ...this._rows,
                {
                    kind: 'stagedV1',
                    key: grant.slotKey,
                    slotToken: grant.slotToken,
                    state: 'pending',
                    name: ''
                }
            ]);
        } catch (error) {
            if (generation === this._generation)
                this.error =
                    error.body?.message ||
                    error.message ||
                    t('Final_Run_UploadUnavailable');
        } finally {
            if (generation === this._generation) this.busy = false;
        }
    }
    async handleFinished(event) {
        if (
            !this.grant ||
            event.currentTarget.dataset.key !== this.grant.slotKey
        )
            return;
        await this.handleCheck();
    }
    async handleCheck() {
        const generation = this._generation;
        this.busy = true;
        this.error = undefined;
        try {
            const result = await this._request({ action: 'status' });
            if (generation !== this._generation) return;
            const receipts = new Map(
                (result.files || []).map((row) => [row.key, row])
            );
            const next = this._rows.flatMap((row) => {
                const receipt = receipts.get(row.key);
                if (
                    !receipt ||
                    ['REMOVED', 'CANCELLED', 'EXPIRED'].includes(receipt.state)
                )
                    return [];
                return [
                    {
                        ...row,
                        name: receipt.name || row.name,
                        sizeBytes: receipt.sizeBytes,
                        state: receipt.state === 'READY' ? 'ready' : 'pending'
                    }
                ];
            });
            this._emit(next);
            if (
                !next.some(
                    (row) =>
                        row.key === this.grant?.slotKey && row.state !== 'ready'
                )
            )
                this.grant = undefined;
            if (next.some((row) => row.state !== 'ready'))
                this.error = t('Final_Run_UploadStatusFailed');
        } catch (error) {
            if (generation === this._generation)
                this.error =
                    error.body?.message || t('Final_Run_UploadStatusFailed');
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
            if (this.grant?.slotKey === key) this.grant = undefined;
            this.template.querySelector('[data-add]')?.focus();
        } catch (error) {
            if (generation === this._generation)
                this.error =
                    error.body?.message || t('Final_Run_UploadUnavailable');
        } finally {
            if (generation === this._generation) this.busy = false;
        }
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
