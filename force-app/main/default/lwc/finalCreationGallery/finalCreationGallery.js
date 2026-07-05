import { LightningElement, track, wire } from 'lwc';
import getUpdatableObjects from '@salesforce/apex/FinalFormCreateController.getUpdatableObjects';
import createForm from '@salesforce/apex/FinalFormCreateController.createForm';

/**
 * finalCreationGallery — the guided creation flow (owner: always layout → theme
 * → details, no "start from scratch"). Step 1 picks a layout; step 2 is the
 * finalThemeGallery, previewing every theme IN that layout; step 3 names the
 * form + picks an object (searchable, all updatable) and creates it via
 * FinalFormCreateController. Emits `formcreated` { formId, versionId } + `close`.
 */

const LAYOUTS = [
    'scroll',
    'stepper',
    'tabs',
    'accordion',
    'rail',
    'oneAtATime',
    'splitHero'
];

export default class FinalCreationGallery extends LightningElement {
    @track step = 'layout'; // layout | theme | details | done
    @track chosenLayout = '';
    @track chosenThemeKey = '';
    @track formName = '';
    @track chosenObject = '';
    @track objectSearch = '';
    @track objectOpen = false;
    @track isCreating = false;
    @track errorMessage = '';
    @track createdInfo = null;

    _objects = [];

    @wire(getUpdatableObjects)
    wiredObjects({ data }) {
        if (data) {
            this._objects = data;
        }
    }

    // ---- step flags / indicator ----
    get isLayoutStep() {
        return this.step === 'layout';
    }
    get isThemeStep() {
        return this.step === 'theme';
    }
    get isDetailsStep() {
        return this.step === 'details';
    }
    get isDone() {
        return this.step === 'done';
    }
    get step1cls() {
        return this.isLayoutStep
            ? 'cg-step on'
            : this.chosenLayout
            ? 'cg-step done'
            : 'cg-step';
    }
    get step2cls() {
        return this.isThemeStep
            ? 'cg-step on'
            : this.chosenThemeKey
            ? 'cg-step done'
            : 'cg-step';
    }
    get step3cls() {
        return this.isDetailsStep ? 'cg-step on' : 'cg-step';
    }

    get layoutCards() {
        return LAYOUTS.map((l) => ({
            key: l,
            layout: l,
            selected: l === this.chosenLayout
        }));
    }

    // ---- object picker (searchable, all updatable) ----
    get objectOptions() {
        const q = (this.objectSearch || '').toLowerCase().trim();
        return this._objects
            .filter(
                (o) =>
                    !q ||
                    o.label.toLowerCase().includes(q) ||
                    o.value.toLowerCase().includes(q)
            )
            .slice(0, 50)
            .map((o) => ({
                ...o,
                cls: o.value === this.chosenObject ? 'obj-item is-on' : 'obj-item'
            }));
    }
    get hasObjectResults() {
        return this.objectOptions.length > 0;
    }

    get createDisabled() {
        return this.isCreating || !this.formName.trim() || !this.chosenObject;
    }

    // ---- navigation ----
    handleLayoutSelect(e) {
        this.chosenLayout = e.detail.layout;
        this.step = 'theme';
    }
    handleThemeSelect(e) {
        this.chosenThemeKey = e.detail.themeKey;
        this.step = 'details';
    }
    handleBackToLayout() {
        this.step = 'layout';
    }
    handleBackToTheme() {
        this.step = 'theme';
    }

    // ---- details ----
    handleName(e) {
        this.formName = e.target.value;
    }
    handleObjectSearch(e) {
        this.objectSearch = e.target.value;
        this.objectOpen = true;
        this.chosenObject = '';
    }
    handleObjectFocus() {
        this.objectOpen = true;
    }
    handleObjectBlur() {
        // Delay so a mousedown pick lands before the list closes.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.objectOpen = false;
        }, 150);
    }
    handleObjectPick(e) {
        const value = e.currentTarget.dataset.value;
        const label = e.currentTarget.dataset.label;
        this.chosenObject = value;
        this.objectSearch = label;
        this.objectOpen = false;
    }

    handleCreate() {
        if (this.createDisabled) {
            return;
        }
        this.isCreating = true;
        this.errorMessage = '';
        createForm({
            formName: this.formName.trim(),
            objectApiName: this.chosenObject,
            layoutType: this.chosenLayout,
            themeName: this.chosenThemeKey
        })
            .then((res) => {
                this.isCreating = false;
                this.createdInfo = res;
                this.step = 'done';
                this.dispatchEvent(
                    new CustomEvent('formcreated', {
                        detail: {
                            formId: res.formId,
                            versionId: res.versionId
                        }
                    })
                );
            })
            .catch((e) => {
                this.isCreating = false;
                this.errorMessage =
                    (e && e.body && e.body.message) ||
                    'Could not create the form.';
            });
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }
    handleStartOver() {
        this.step = 'layout';
        this.chosenLayout = '';
        this.chosenThemeKey = '';
        this.formName = '';
        this.chosenObject = '';
        this.objectSearch = '';
        this.createdInfo = null;
        this.errorMessage = '';
    }
}
