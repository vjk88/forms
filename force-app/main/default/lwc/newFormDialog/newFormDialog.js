import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createForm from '@salesforce/apex/FormDesignerController.createForm';

export default class NewFormDialog extends LightningElement {
    @api objectOptions = [];
    @api initialMode = 'forms';

    @track formName = '';
    @track objectApiName = '';
    @track formType = 'Form';
    @track layoutMode = 'Single_Page';
    @track submissionStorage = 'Primary_Object';
    @track allowedAdapters = ['Internal_Record_Page'];

    isCreating = false;

    connectedCallback() {
        if (this.initialMode === 'surveys') {
            this.formType = 'Survey';
            this.submissionStorage = 'Form_Response';
            this.objectApiName = '';
        } else {
            this.formType = 'Form';
            this.submissionStorage = 'Primary_Object';
        }
    }

    get isSurveyMode() {
        return this.initialMode === 'surveys';
    }

    get modalTitle() {
        return this.isSurveyMode ? 'New Survey' : 'New Form';
    }

    get formTypeOptions() {
        return [
            { label: 'Form', value: 'Form' },
            { label: 'Survey', value: 'Survey' }
        ];
    }

    get layoutModeOptions() {
        return [
            { label: 'Single Page', value: 'Single_Page' },
            { label: 'Vertical Navigation', value: 'Vertical_Navigation' },
            { label: 'Multi-Page Wizard', value: 'Multi_Page_Wizard' }
        ];
    }

    get submissionStorageOptions() {
        return [
            { label: 'Primary Object (write to SObject)', value: 'Primary_Object' },
            { label: 'Form Response (for surveys)', value: 'Form_Response' },
            { label: 'Both (write to SObject + audit)', value: 'Both' }
        ];
    }

    get submissionStorageHelp() {
        return 'Primary Object creates records on a Salesforce object. Form Response stores answers separately (use for surveys). Both does both.';
    }

    get adapterOptions() {
        const all = [
            { label: 'Internal Record Page', value: 'Internal_Record_Page' },
            { label: 'Flow Screen', value: 'Flow_Screen' },
            { label: 'Public / Guest', value: 'Public_Guest' },
            { label: 'Embedded', value: 'Embedded' }
        ];
        return all.map(o => ({ ...o, checked: this.allowedAdapters.includes(o.value) }));
    }

    get requiresPrimaryObject() {
        return this.submissionStorage === 'Primary_Object' || this.submissionStorage === 'Both';
    }

    get createDisabled() {
        if (this.isCreating || !this.formName.trim()) return true;
        if (this.requiresPrimaryObject && !this.objectApiName) return true;
        return false;
    }

    handleNameChange(event) { this.formName = event.detail.value; }
    handleObjectChange(event) { this.objectApiName = event.detail.value; }
    handleTypeChange(event) {
        this.formType = event.detail.value;
        // Default surveys to Form_Response storage
        if (this.formType === 'Survey' && this.submissionStorage === 'Primary_Object') {
            this.submissionStorage = 'Form_Response';
        }
        // Default forms to Primary_Object storage
        if (this.formType === 'Form' && this.submissionStorage === 'Form_Response') {
            this.submissionStorage = 'Primary_Object';
        }
    }
    handleLayoutChange(event) { this.layoutMode = event.detail.value; }
    handleStorageChange(event) {
        this.submissionStorage = event.detail.value;
        if (!this.requiresPrimaryObject) {
            this.objectApiName = '';
        }
    }

    handleAdapterToggle(event) {
        const value = event.target.value;
        if (event.target.checked) {
            if (!this.allowedAdapters.includes(value)) {
                this.allowedAdapters = [...this.allowedAdapters, value];
            }
        } else {
            this.allowedAdapters = this.allowedAdapters.filter(a => a !== value);
        }
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleCreate() {
        if (this.createDisabled) return;

        this.isCreating = true;
        createForm({
            formName: this.formName.trim(),
            objectApiName: this.objectApiName || null,
            formType: this.formType,
            layoutMode: this.layoutMode,
            submissionStorage: this.submissionStorage,
            allowedAdapters: this.allowedAdapters.join(';')
        })
            .then(result => {
                this.isCreating = false;
                this.dispatchEvent(new CustomEvent('formcreated', {
                    detail: {
                        formId: result.formId,
                        versionId: result.versionId
                    }
                }));
            })
            .catch(error => {
                this.isCreating = false;
                const msg = error.body ? error.body.message : error.message;
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error creating form',
                    message: msg,
                    variant: 'error'
                }));
            });
    }
}