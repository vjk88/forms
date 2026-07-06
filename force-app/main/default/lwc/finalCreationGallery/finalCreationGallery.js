import { LightningElement, track, wire } from 'lwc';
import getUpdatableObjects from '@salesforce/apex/FinalFormCreateController.getUpdatableObjects';
import createForm from '@salesforce/apex/FinalFormCreateController.createForm';
import { buildSampleSpec } from 'c/finalSampleSpec';

/**
 * finalCreationGallery — the guided creation flow (owner: always layout → theme
 * → details, no "start from scratch"). Step 1 picks a layout (8 cards — the 7
 * registry layouts + splitHero's Conversational pane-flow variant); step 2 is
 * the finalThemeGallery, previewing every theme IN that layout; step 3 names
 * the form + picks an object beside a LIVE sample preview (finalFormViewer on
 * an inline c/finalSampleSpec — real engine, canned 3-page form, the typed
 * name becomes the preview title). Emits `formcreated` { formId, versionId }
 * + `close`.
 */

// Step-1 roster. Each card's mockup is tinted by a DISTINCT flattering builtin
// theme (the old gallery's trick — never eight clones of one palette). The
// splitHero Conversational card is the same primitive with
// layout.options.paneFlow = 'oneAtATime' (catalog §2) — NOT a new layout.
const LAYOUT_CARDS = [
    { layout: 'scroll', themeKey: 'terracotta' },
    { layout: 'stepper', themeKey: 'mintStepper' },
    { layout: 'tabs', themeKey: 'nordic' },
    { layout: 'accordion', themeKey: 'sandstone' },
    { layout: 'rail', themeKey: 'execNav' },
    { layout: 'oneAtATime', themeKey: 'lavender' },
    { layout: 'splitHero', themeKey: 'marbleSplit' },
    { layout: 'splitHero', paneFlow: 'oneAtATime', themeKey: 'auraSplit' }
];

const DEVICE_WIDTHS = { desktop: '100%', tablet: '760px', mobile: '400px' };

export default class FinalCreationGallery extends LightningElement {
    @track step = 'layout'; // layout | theme | details | done
    @track chosenLayout = '';
    @track chosenPaneFlow = '';
    @track chosenThemeKey = '';
    @track formName = '';
    @track chosenObject = '';
    @track objectSearch = '';
    @track objectOpen = false;
    @track isCreating = false;
    @track errorMessage = '';
    @track createdInfo = null;
    @track previewDevice = 'desktop';

    _objects = [];
    _specCache = null;
    _specCacheKey = '';

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
        return LAYOUT_CARDS.map((c) => ({
            key: c.paneFlow ? `${c.layout}:${c.paneFlow}` : c.layout,
            layout: c.layout,
            paneFlow: c.paneFlow || '',
            themeKey: c.themeKey,
            selected:
                c.layout === this.chosenLayout &&
                (c.paneFlow || '') === this.chosenPaneFlow
        }));
    }

    // ---- live preview (step 3) ----
    /**
     * The inline spec the preview viewer renders. Memoized on its real inputs
     * so unrelated re-renders (object search keystrokes) don't re-apply it.
     */
    get previewSpec() {
        const name = this.formName.trim();
        const key = `${this.chosenLayout}|${this.chosenPaneFlow}|${this.chosenThemeKey}|${name}`;
        if (key !== this._specCacheKey) {
            this._specCacheKey = key;
            this._specCache = buildSampleSpec({
                layout: this.chosenLayout,
                paneFlow: this.chosenPaneFlow || undefined,
                themeKey: this.chosenThemeKey,
                title: name || undefined
            });
        }
        return this._specCache;
    }
    get deviceOptions() {
        return ['desktop', 'tablet', 'mobile'].map((d) => ({
            value: d,
            label: d.charAt(0).toUpperCase() + d.slice(1),
            cls: this.previewDevice === d ? 'dev-btn is-on' : 'dev-btn'
        }));
    }
    get previewFrameStyle() {
        return `max-width:${DEVICE_WIDTHS[this.previewDevice] || '100%'};`;
    }
    handleDevice(e) {
        this.previewDevice = e.currentTarget.dataset.value;
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
        this.chosenPaneFlow = e.detail.paneFlow || '';
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
            themeName: this.chosenThemeKey,
            paneFlow: this.chosenPaneFlow || null
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
        this.chosenPaneFlow = '';
        this.chosenThemeKey = '';
        this.formName = '';
        this.chosenObject = '';
        this.objectSearch = '';
        this.createdInfo = null;
        this.errorMessage = '';
        this.previewDevice = 'desktop';
    }
}
