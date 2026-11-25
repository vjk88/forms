import { LightningElement } from 'lwc';
import getUploadSettings from '@salesforce/apex/FinalSettingsController.getUploadSettings';
import saveUploadSettings from '@salesforce/apex/FinalSettingsController.saveUploadSettings';

/** Guest defaults in the existing org settings; never a shared usage record. */
export default class FinalUploadSettings extends LightningElement {
    enabled = false;
    maxFileMiB = 10;
    maxTotalMiB = 25;
    maxFiles = 5;
    maxEntries = 20;
    busy = true;
    canManage = false;
    notice = '';
    failed = false;
    connectedCallback() {
        this.load();
    }
    get disabled() {
        return this.busy || !this.canManage;
    }
    get saveLabel() {
        return this.busy ? 'Saving…' : 'Save upload settings';
    }
    async load() {
        try {
            const settings = await getUploadSettings();
            this.enabled = !!settings.enabled;
            this.maxFileMiB = settings.maxFileBytes / 1048576;
            this.maxTotalMiB = settings.maxTotalBytes / 1048576;
            this.maxFiles = settings.maxFiles;
            this.maxEntries = settings.maxEntries;
            this.canManage = !!settings.canManage;
        } catch (error) {
            this.failed = true;
            this.notice =
                error.body?.message ||
                'Upload settings could not be loaded. Retry loading.';
        } finally {
            this.busy = false;
        }
    }
    handleChange(event) {
        const name = event.target.dataset.setting;
        this[name] =
            name === 'enabled'
                ? event.target.checked
                : Number(event.target.value);
        this.notice = '';
        this.template
            .querySelector('[data-setting="maxEntries"]')
            ?.setCustomValidity('');
    }
    async handleSave() {
        const inputs = [...this.template.querySelectorAll('lightning-input')];
        if (
            !inputs.reduce(
                (valid, input) => input.reportValidity() && valid,
                true
            )
        )
            return;
        const attempts = this.template.querySelector(
            '[data-setting="maxEntries"]'
        );
        attempts.setCustomValidity(
            this.maxEntries < this.maxFiles
                ? 'Upload attempts must be at least the file count.'
                : ''
        );
        if (!attempts.reportValidity()) return;
        this.busy = true;
        this.failed = false;
        this.notice = '';
        try {
            await saveUploadSettings({
                enabled: this.enabled,
                maxFileBytes: Math.round(this.maxFileMiB * 1048576),
                maxTotalBytes: Math.round(this.maxTotalMiB * 1048576),
                maxFiles: this.maxFiles,
                maxEntries: this.maxEntries
            });
            this.notice = 'Saved. Guest upload defaults have been updated.';
        } catch (error) {
            this.failed = true;
            this.notice =
                error.body?.message ||
                'Settings could not be saved. Try again.';
        } finally {
            this.busy = false;
        }
    }
    handleRetry() {
        this.busy = true;
        this.failed = false;
        this.notice = '';
        this.load();
    }
}
