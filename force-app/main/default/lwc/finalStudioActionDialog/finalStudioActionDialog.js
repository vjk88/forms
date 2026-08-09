import { LightningElement, api } from 'lwc';

const MAX_NAME_LENGTH = 80;
const MAX_PACKAGE_BYTES = 393216;
const CLONE_SUFFIX = ' — Copy';

/** Focused, action-specific modal for Studio Actions. */
export default class FinalStudioActionDialog extends LightningElement {
    @api busyLabel = '';
    @api error = '';
    @api exportResult;
    @api exportFallbackText = '';
    @api actionSummary;
    /** Set by the studio when a preflight/prepare call failed. */
    @api loadFailed = false;
    /** Whether the form is currently public — gates the archive acknowledgement. */
    @api sourcePublic = false;

    cloneName = '';
    importName = '';
    deleteName = '';
    packageJson = '';
    selectedFileName = '';
    fileError = '';
    warningsAccepted = false;
    archiveAck = false;
    showExportFallback = false;
    copied = false;

    _action = 'clone';
    _sourceName = '';
    _inspection;
    _focused = false;
    _busy = false;

    @api
    get busy() {
        return this._busy;
    }

    set busy(value) {
        const next = Boolean(value);
        if (this._busy !== next) this._focused = false;
        this._busy = next;
    }

    @api
    get action() {
        return this._action;
    }

    set action(value) {
        this._action = value || 'clone';
        this._focused = false;
    }

    @api
    get sourceName() {
        return this._sourceName;
    }

    set sourceName(value) {
        this._sourceName = value || '';
        const source = this._sourceName.trim() || 'Untitled form';
        this.cloneName = `${source.slice(
            0,
            MAX_NAME_LENGTH - CLONE_SUFFIX.length
        )}${CLONE_SUFFIX}`;
        this._focused = false;
    }

    @api
    get inspection() {
        return this._inspection;
    }

    set inspection(value) {
        this._inspection = value;
        if (value?.valid) {
            this.importName = (value.name || '').slice(0, MAX_NAME_LENGTH);
        }
    }

    renderedCallback() {
        if (this._focused) return;
        this._focused = true;
        Promise.resolve().then(() => this.initialFocusControl?.focus());
    }

    get isClone() {
        return this.action === 'clone';
    }

    get isExport() {
        return this.action === 'export';
    }

    get isImport() {
        return this.action === 'import';
    }

    get isDelete() {
        return this.action === 'delete';
    }

    get title() {
        return {
            clone: 'Clone form',
            export: 'Export form',
            import: 'Import form',
            delete:
                !this.hasSummary || this.canHardDelete
                    ? 'Delete form'
                    : 'Archive form'
        }[this.action];
    }

    get description() {
        if (this.needsRetry) {
            return this.isExport
                ? "We couldn't prepare the export. Retry to try again."
                : "We couldn't load this form's details. Retry to try again.";
        }
        return {
            clone: "Create a private draft from the form's current Studio state, including unsaved changes.",
            export: 'Download the current authoring state as a portable Final Form JSON package.',
            import: 'Choose a Final Form JSON package. Import always creates a new private draft.',
            delete: !this.hasSummary
                ? 'Checking responses and related data before choosing the safe action.'
                : this.canHardDelete
                  ? 'Permanently remove this form configuration. Salesforce records created by the form are never deleted.'
                  : 'This form has stored survey responses, so it cannot be deleted. Archive preserves every response for reporting.'
        }[this.action];
    }

    get cancelLabel() {
        return `Cancel ${this.title.toLowerCase()}`;
    }

    get preferredControl() {
        const selector = {
            clone: '[data-id="clone-name"]',
            export: '[data-id="action-confirm"]',
            import: '[data-id="import-file"]',
            delete: this.canHardDelete
                ? '[data-id="delete-name"]'
                : '[data-id="action-confirm"]'
        }[this.action];
        return this.template.querySelector(selector);
    }

    get initialFocusControl() {
        if (this.busy) return this.dialogControl;
        const preferred = this.preferredControl;
        return this.isEnabled(preferred) ? preferred : this.firstEnabledControl;
    }

    get dialogControl() {
        return this.template.querySelector('[data-id="action-dialog"]');
    }

    get firstEnabledControl() {
        return this.enabledControls[0] || this.dialogControl;
    }

    get lastEnabledControl() {
        const controls = this.enabledControls;
        return controls[controls.length - 1] || this.dialogControl;
    }

    get enabledControls() {
        return [
            '[data-id="action-close"]',
            '[data-id="clone-name"]',
            '[data-id="import-file"]',
            '[data-id="import-name"]',
            '[data-id="warning-accept"]',
            '[data-id="delete-name"]',
            '[data-id="action-cancel"]',
            '[data-id="action-confirm"]'
        ]
            .map((selector) => this.template.querySelector(selector))
            .filter((control) => this.isEnabled(control));
    }

    isEnabled(control) {
        return Boolean(control && !control.disabled);
    }

    get canHardDelete() {
        return Boolean(this.actionSummary?.hardDeleteAllowed);
    }

    get hasSummary() {
        return Boolean(this.actionSummary);
    }

    get hasInspection() {
        return Boolean(this.inspection);
    }

    get inspectionValid() {
        return Boolean(this.inspection?.valid);
    }

    get inspectionWarnings() {
        return (this.inspection?.warnings || []).map((warning) => ({
            ...warning,
            key: warning.code || warning.message
        }));
    }

    get inspectionErrors() {
        return (this.inspection?.errors || []).map((message, index) => ({
            message,
            key: `error-${index}`
        }));
    }

    get exportWarnings() {
        return (this.exportResult?.warnings || []).map((warning) => ({
            ...warning,
            key: warning.code || warning.message
        }));
    }

    get exportFileName() {
        return this.exportResult?.fileName || '';
    }

    get hasImportWarnings() {
        return this.inspectionWarnings.length > 0;
    }

    get requiresWarningAcceptance() {
        return this.inspectionWarnings.some(
            (warning) => warning.requiresConfirmation
        );
    }

    get importTypeLabel() {
        return this.inspection?.type === 'survey' ? 'Survey' : 'Form';
    }

    get connectedObjectLabel() {
        return this.inspection?.connectedObject || 'Disconnected';
    }

    get themeLabel() {
        return this.inspection?.themeName || 'Default';
    }

    get confirmDisabled() {
        if (this.busy) return true;
        if (this.isClone) {
            const name = this.cloneName.trim();
            return !name || name.length > MAX_NAME_LENGTH;
        }
        if (this.isExport) return !this.exportResult?.packageJson;
        if (this.isImport) {
            const name = this.importName.trim();
            return (
                !this.inspectionValid ||
                !name ||
                name.length > MAX_NAME_LENGTH ||
                (this.requiresWarningAcceptance && !this.warningsAccepted)
            );
        }
        if (this.isDelete) {
            if (!this.hasSummary) return true;
            if (this.canHardDelete) {
                return this.deleteName.trim() !== this.actionSummary.formName;
            }
            // archive path — require acknowledgement when the form is live
            return this.archiveNeedsAck && !this.archiveAck;
        }
        return true;
    }

    get archiveNeedsAck() {
        return (
            this.isDelete &&
            this.hasSummary &&
            !this.canHardDelete &&
            this.sourcePublic
        );
    }

    get needsRetry() {
        return this.loadFailed && !this.busy;
    }

    get exportFallbackAvailable() {
        return Boolean(this.exportFallbackText);
    }

    get copyLabel() {
        return this.copied ? 'Copied!' : 'Copy the package';
    }

    get confirmLabel() {
        if (this.busy) {
            return {
                clone: 'Cloning…',
                export: 'Preparing…',
                import: 'Importing…',
                delete: !this.hasSummary
                    ? 'Checking…'
                    : this.canHardDelete
                      ? 'Deleting…'
                      : 'Archiving…'
            }[this.action];
        }
        return {
            clone: 'Clone form',
            export: this.exportFallbackText
                ? 'Download again'
                : 'Download export',
            import: 'Import as new form',
            delete: this.canHardDelete ? 'Delete form' : 'Archive form'
        }[this.action];
    }

    get confirmVariant() {
        return this.isDelete && this.hasSummary && this.canHardDelete
            ? 'destructive'
            : 'brand';
    }

    get progressText() {
        return (
            this.busyLabel ||
            {
                clone: 'Creating the private draft…',
                export: 'Preparing the download…',
                import: 'Creating the imported private draft…',
                delete: this.canHardDelete
                    ? 'Deleting the form configuration…'
                    : 'Archiving the form and preserving responses…'
            }[this.action]
        );
    }

    handleNameChange(event) {
        const value = event.target.value;
        if (event.target.dataset.id === 'clone-name') this.cloneName = value;
        if (event.target.dataset.id === 'import-name') this.importName = value;
        if (event.target.dataset.id === 'delete-name') this.deleteName = value;
    }

    handleWarningAcceptance(event) {
        this.warningsAccepted = event.target.checked;
    }

    handleArchiveAck(event) {
        this.archiveAck = event.target.checked;
    }

    handleShowFallback() {
        this.showExportFallback = true;
    }

    handleCopyExport() {
        const text = this.exportFallbackText;
        if (!text) return;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text);
            this.copied = true;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => {
                this.copied = false;
            }, 1500);
            return;
        }
        // clipboard blocked (common inside the VF iframe): select the text so
        // the author can copy it by hand
        this.template.querySelector('[data-id="export-fallback"]')?.select?.();
    }

    handleRetry() {
        this.dispatchEvent(new CustomEvent('retry'));
    }

    async handleFileChange(event) {
        const file = event.target.files?.[0];
        this.packageJson = '';
        this.selectedFileName = file?.name || '';
        this.fileError = '';
        this.warningsAccepted = false;
        this._inspection = undefined;
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.finalform.json')) {
            this.fileError = 'Choose a file ending in .finalform.json.';
            return;
        }
        if (file.size > MAX_PACKAGE_BYTES) {
            this.fileError = 'Package must be 384 KB or smaller.';
            return;
        }
        try {
            const text = await this.readFile(file);
            const parsed = JSON.parse(text);
            if (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                throw new Error('Package must be an object.');
            }
            this.packageJson = text;
            this.dispatchEvent(
                new CustomEvent('inspect', { detail: { packageJson: text } })
            );
        } catch {
            this.fileError = 'The selected file is not valid JSON.';
        }
    }

    readFile(file) {
        if (typeof file.text === 'function') return file.text();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file, 'UTF-8');
        });
    }

    handleKeydown(event) {
        if (this.busy && event.key === 'Tab') {
            event.preventDefault();
            this.dialogControl?.focus();
            return;
        }
        if (event.key === 'Escape' && !this.busy) {
            event.preventDefault();
            this.dispatchCancel();
            return;
        }
        if (
            event.key === 'Enter' &&
            ['clone-name', 'import-name', 'delete-name'].includes(
                event.target.dataset?.id
            )
        ) {
            event.preventDefault();
            this.handleConfirm();
        }
    }

    handleBackdrop() {
        if (!this.busy) this.dispatchCancel();
    }

    handleCancel() {
        if (!this.busy) this.dispatchCancel();
    }

    handleConfirm() {
        if (this.confirmDisabled) return;
        let detail = {};
        if (this.isClone) detail = { name: this.cloneName.trim() };
        if (this.isImport) {
            detail = {
                name: this.importName.trim(),
                packageJson: this.packageJson,
                acceptedWarningCodes: this.inspectionWarnings
                    .filter((warning) => warning.requiresConfirmation)
                    .map((warning) => warning.code)
            };
        }
        if (this.isDelete) {
            detail = this.canHardDelete
                ? {
                      operation: 'delete',
                      confirmationName: this.deleteName.trim()
                  }
                : { operation: 'archive' };
        }
        this.dispatchEvent(new CustomEvent('confirm', { detail }));
    }

    handleFocusStart() {
        this.lastEnabledControl?.focus();
    }

    handleFocusEnd() {
        this.firstEnabledControl?.focus();
    }

    dispatchCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
