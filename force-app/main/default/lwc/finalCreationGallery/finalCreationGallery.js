import { LightningElement, track, wire } from 'lwc';
import getUpdatableObjects from '@salesforce/apex/FinalFormCreateController.getUpdatableObjects';
import createForm from '@salesforce/apex/FinalFormCreateController.createForm';
import { buildSampleSpec } from 'c/finalSampleSpec';
import { listBuiltinThemes } from 'c/finalThemeCatalog';

/**
 * finalCreationGallery — the guided creation flow, replicating the OLD
 * formCreationGallery's UI exactly (owner 2026-07-05) with the REBUILD's
 * layout + theme rosters:
 *
 * Screen 1 = entry toggle ("Start from a template" placeholder | "Start from
 * scratch" default) over the GROUPED layout gallery (Continuous flow /
 * Paginated·Nav-driven / Tabbed & Accordion — old-style short card names).
 * Then theme step (finalThemeGallery) → detail screen: config card left
 * (Form name / Primary object / APPEARANCE / Layout dropdown / Theme chip +
 * Change) beside the LIVE PREVIEW card (finalFormViewer on an inline
 * c/finalSampleSpec, icon device toggle at real device widths).
 * Emits `formcreated` { formId, versionId } + `close`.
 */

// The 8 step-1 choices in the old gallery's 3 groups. Old-style short names
// (owner picked); each card's mockup tinted by a DISTINCT builtin theme.
// The Conversational card = splitHero + layout.options.paneFlow (catalog §2).
const LAYOUT_GROUPS = [
    {
        id: 'continuous',
        title: 'Continuous flow',
        hint: 'One page, scrolls top to bottom',
        cards: [{ layout: 'scroll', themeKey: 'terracotta', name: 'Scroll' }]
    },
    {
        id: 'paginated',
        title: 'Paginated / Nav-driven',
        hint: 'Steps, side panels, one question at a time',
        cards: [
            { layout: 'stepper', themeKey: 'mintStepper', name: 'Stepper' },
            { layout: 'splitHero', themeKey: 'marbleSplit', name: 'Split Hero' },
            {
                layout: 'splitHero',
                paneFlow: 'oneAtATime',
                themeKey: 'auraSplit',
                name: 'Split Hero · Conversational',
                description:
                    'Start from the Split Hero layout, one question at a time.'
            },
            { layout: 'rail', themeKey: 'execNav', name: 'Side Nav' },
            { layout: 'oneAtATime', themeKey: 'lavender', name: 'One at a Time' }
        ]
    },
    {
        id: 'tabbedAcc',
        title: 'Tabbed & Accordion',
        hint: 'Content grouped into panels',
        cards: [
            { layout: 'tabs', themeKey: 'nordic', name: 'Tabbed' },
            { layout: 'accordion', themeKey: 'sandstone', name: 'Accordion' }
        ]
    }
];

// Real device widths (old gallery: the frame renders at device width and the
// form reflows via its own container queries — no scale transform).
const DEVICE_WIDTHS = { desktop: 1024, tablet: 768, mobile: 390 };
const DEVICES = [
    { value: 'desktop', icon: 'utility:desktop', title: 'Desktop' },
    { value: 'tablet', icon: 'utility:tablet_portrait', title: 'Tablet' },
    { value: 'mobile', icon: 'utility:phone_portrait', title: 'Mobile' }
];

function cardKey(c) {
    return c.paneFlow ? `${c.layout}:${c.paneFlow}` : c.layout;
}

export default class FinalCreationGallery extends LightningElement {
    @track step = 'layout'; // layout | theme | details | done
    @track entryMode = 'scratch'; // template (placeholder) | scratch
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

    // ---- step flags ----
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

    // ---- entry toggle (template = placeholder for now) ----
    get isTemplateMode() {
        return this.entryMode === 'template';
    }
    get templateTabClass() {
        return this.isTemplateMode ? 'entry-tab is-active' : 'entry-tab';
    }
    get scratchTabClass() {
        return this.isTemplateMode ? 'entry-tab' : 'entry-tab is-active';
    }
    get templateSelected() {
        return this.isTemplateMode ? 'true' : 'false';
    }
    get scratchSelected() {
        return this.isTemplateMode ? 'false' : 'true';
    }
    handleEntryTemplate() {
        this.entryMode = 'template';
    }
    handleEntryScratch() {
        this.entryMode = 'scratch';
    }

    // ---- grouped layout gallery ----
    get layoutGroups() {
        return LAYOUT_GROUPS.map((g) => ({
            id: g.id,
            title: g.title,
            hint: g.hint,
            cards: g.cards.map((c) => ({
                key: cardKey(c),
                layout: c.layout,
                paneFlow: c.paneFlow || '',
                themeKey: c.themeKey,
                name: `${c.name} layout`,
                description:
                    c.description ||
                    `Start from the ${c.name} layout with an empty form.`,
                selected:
                    c.layout === this.chosenLayout &&
                    (c.paneFlow || '') === this.chosenPaneFlow
            }))
        }));
    }

    // ---- detail: layout dropdown ("Name · Group", old pattern) ----
    get layoutOptions() {
        const current = this.chosenPaneFlow
            ? `${this.chosenLayout}:${this.chosenPaneFlow}`
            : this.chosenLayout;
        const out = [];
        LAYOUT_GROUPS.forEach((g) => {
            g.cards.forEach((c) => {
                const key = cardKey(c);
                out.push({
                    value: key,
                    label: c.name.includes('·')
                        ? c.name
                        : `${c.name} · ${g.title}`,
                    selected: key === current
                });
            });
        });
        return out;
    }
    handleLayoutDropdown(e) {
        const [layout, paneFlow] = e.target.value.split(':');
        this.chosenLayout = layout;
        this.chosenPaneFlow = paneFlow || '';
    }

    get chosenThemeLabel() {
        const t = listBuiltinThemes().find((x) => x.key === this.chosenThemeKey);
        return t ? t.name : 'Pick a theme';
    }
    handleChangeTheme() {
        this.step = 'theme';
    }

    // ---- live preview ----
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
        return DEVICES.map((d) => ({
            ...d,
            cls: this.previewDevice === d.value ? 'dev-btn is-on' : 'dev-btn'
        }));
    }
    get previewFrameClass() {
        return this.previewDevice === 'desktop'
            ? 'pv-frame'
            : `pv-frame pv-frame_${this.previewDevice}`;
    }
    get previewFrameStyle() {
        return `width:${DEVICE_WIDTHS[this.previewDevice] || 1024}px;`;
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
        this.entryMode = 'scratch';
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
