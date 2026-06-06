import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createForm from '@salesforce/apex/FormDesignerController.createForm';

export default class NewFormDialog extends LightningElement {
    @api objectOptions = [];
    @api initialMode = 'forms';

    @track formName = '';
    @track objectApiName = ''; // Form: write target. Survey: optional context record.
    @track experience = 'single'; // single | multi
    @track allowedAdapters = ['Internal_Record_Page'];

    isCreating = false;

    connectedCallback() {
        // Surveys default to paginated; forms to single page.
        this.experience = this.isSurveyMode ? 'multi' : 'single';
    }

    // --- Mode / labels ---
    get isSurveyMode() {
        return this.initialMode === 'surveys';
    }
    get formType() {
        return this.isSurveyMode ? 'Survey' : 'Form';
    }
    get noun() {
        return this.isSurveyMode ? 'survey' : 'form';
    }
    get modalTitle() {
        return this.isSurveyMode ? 'New Survey' : 'New Form';
    }
    get subtitle() {
        return `Configure your ${this.noun}'s foundation. You can refine these settings later in the builder.`;
    }
    get nameLabel() {
        return this.isSurveyMode ? 'Survey Title' : 'Form Name';
    }
    get namePlaceholder() {
        return this.isSurveyMode
            ? 'e.g. Q4 Customer Satisfaction'
            : 'e.g. Contact Request';
    }
    get createLabel() {
        return this.isSurveyMode ? 'Create Survey' : 'Create Form';
    }

    // --- DATA: object binding (type-aware) ---
    get isForm() {
        return !this.isSurveyMode;
    }
    // A Form must be bound to an object; a Survey's context object is optional.
    get requiresObject() {
        return this.isForm;
    }
    get objectLabel() {
        return this.isForm ? 'Primary Object' : 'Related To (optional)';
    }
    get objectHelp() {
        return this.isForm
            ? 'New records are created or updated on this Salesforce object.'
            : 'Each response links to the Contact respondent and, optionally, this record type.';
    }
    get dataSectionDesc() {
        return this.isForm
            ? 'This form reads and writes a real Salesforce record.'
            : 'Responses are stored as survey answers, always linked to a CRM record for context.';
    }

    // --- EXPERIENCE cards ---
    get experienceCards() {
        return [
            {
                value: 'multi',
                title: 'Multi Page (Paginated)',
                desc: `Better for longer ${this.noun}s. Reduces fatigue.`,
                icon: 'utility:copy',
                selected: this.experience === 'multi',
                cardClass: this.cardClass(this.experience === 'multi'),
                dotClass: this.dotClass(this.experience === 'multi')
            },
            {
                value: 'single',
                title: 'Single Page (Scrolling)',
                desc: 'Best for quick polls or feedback forms.',
                icon: 'utility:page',
                selected: this.experience === 'single',
                cardClass: this.cardClass(this.experience === 'single'),
                dotClass: this.dotClass(this.experience === 'single')
            }
        ];
    }
    // The recommended choice gets the badge: multi-page for surveys.
    get showExperienceBadge() {
        return this.isSurveyMode;
    }

    // --- ADVANCED: allowed adapters ---
    get adapterHelp() {
        return `Choose which surfaces are permitted to render this ${this.noun}.`;
    }
    get adapterItems() {
        const meta = [
            {
                value: 'Internal_Record_Page',
                label: 'Internal',
                desc: 'Lightning record pages & apps for logged-in Salesforce users.'
            },
            {
                value: 'Public_Guest',
                label: 'Public / Guest',
                desc: 'Public link for unauthenticated guests; also makes form images publicly viewable.'
            },
            {
                value: 'Flow_Screen',
                label: 'Flow',
                desc: 'Use as a screen component inside a Salesforce Flow.'
            },
            {
                value: 'Embedded',
                label: 'Embedded',
                desc: 'Embed inside another Lightning component or page.'
            }
        ];
        return meta.map((m) => ({
            ...m,
            checked: this.allowedAdapters.includes(m.value)
        }));
    }

    cardClass(selected) {
        return selected ? 'choice-card is-selected' : 'choice-card';
    }
    dotClass(selected) {
        return selected ? 'choice-dot is-on' : 'choice-dot';
    }

    // --- Derived create payload ---
    // Nav style (top vs side) is chosen later in the builder; multi-page
    // just gets a sensible default here.
    get layoutMode() {
        return this.experience === 'multi' ? 'Multi_Page_Wizard' : 'Single_Page';
    }
    get allowedAdaptersStr() {
        // Always keep at least Internal so a form is renderable somewhere.
        const list = this.allowedAdapters.length
            ? this.allowedAdapters
            : ['Internal_Record_Page'];
        return list.join(';');
    }

    get createDisabled() {
        if (this.isCreating || !this.formName.trim()) return true;
        if (this.requiresObject && !this.objectApiName) return true;
        return false;
    }

    // --- Handlers ---
    handleNameChange(event) {
        this.formName = event.detail.value;
    }
    handleObjectChange(event) {
        this.objectApiName = event.detail.value;
    }
    handleExperienceSelect(event) {
        this.experience = event.currentTarget.dataset.value;
    }
    handleExperienceKey(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.experience = event.currentTarget.dataset.value;
        }
    }
    handleAdapterChange(event) {
        const value = event.target.dataset.value;
        if (event.target.checked) {
            if (!this.allowedAdapters.includes(value)) {
                this.allowedAdapters = [...this.allowedAdapters, value];
            }
        } else {
            this.allowedAdapters = this.allowedAdapters.filter((a) => a !== value);
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
            allowedAdapters: this.allowedAdaptersStr
        })
            .then((result) => {
                this.isCreating = false;
                this.dispatchEvent(
                    new CustomEvent('formcreated', {
                        detail: {
                            formId: result.formId,
                            versionId: result.versionId
                        }
                    })
                );
            })
            .catch((error) => {
                this.isCreating = false;
                const msg = error.body ? error.body.message : error.message;
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error creating ' + this.noun,
                        message: msg,
                        variant: 'error'
                    })
                );
            });
    }
}