import { LightningElement, track, wire } from 'lwc';
import getUpdatableObjects from '@salesforce/apex/FinalFormCreateController.getUpdatableObjects';
import createForm from '@salesforce/apex/FinalFormCreateController.createForm';
import createSurveyFromTemplate from '@salesforce/apex/FinalFormCreateController.createSurveyFromTemplate';
import { buildSampleSpec } from 'c/finalSampleSpec';
import { listBuiltinThemes } from 'c/finalThemeCatalog';
import { studioUrl } from 'c/finalStudioLink';

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
        hint: 'Steps, side panels, one section at a time',
        cards: [
            { layout: 'stepper', themeKey: 'mintStepper', name: 'Stepper' },
            {
                layout: 'splitHero',
                themeKey: 'marbleSplit',
                name: 'Split Hero'
            },
            {
                layout: 'splitHero',
                paneFlow: 'oneAtATime',
                themeKey: 'auraSplit',
                name: 'Split Hero · Conversational',
                description:
                    'Start from the Split Hero layout, one section at a time.'
            },
            { layout: 'rail', themeKey: 'execNav', name: 'Side Nav' },
            {
                layout: 'oneAtATime',
                themeKey: 'lavender',
                name: 'One at a Time'
            }
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

/** The Surveys shelf (S5 — creation-flow ruling: complete bundles, no
 *  wizard). Each card = one server-side template; answers land in the
 *  answer store, one question per screen. */
const SURVEY_TEMPLATES = [
    {
        key: 'blank',
        name: 'Blank survey',
        icon: 'utility:add',
        blurb: 'An empty one-question-per-screen survey — build it yourself from the Questions palette.'
    },
    {
        key: 'csat',
        name: 'CSAT Pulse',
        icon: 'utility:smiley_and_people',
        blurb: 'How satisfied are customers? One score, one comment — charted by the Satisfaction topic.'
    },
    {
        key: 'nps',
        name: 'NPS Pulse',
        icon: 'utility:metrics',
        blurb: 'The classic 0–10 "would you recommend us?" plus the why — charted by the Loyalty topic.'
    },
    {
        key: 'event',
        name: 'Event Feedback',
        icon: 'utility:event',
        blurb: 'Rating, agreement, would-you-return, comments. Anonymous by default — honest answers.'
    }
];

export default class FinalCreationGallery extends LightningElement {
    // kind → (form) layout → theme → details → done
    // kind → (survey) templates → theme → surveyDetails → done
    // (owner 2026-07-31: ask Form-or-Survey FIRST; surveys never pick a
    // layout — templates and themes only)
    @track step = 'kind';
    @track kind = ''; // form | survey
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
    get isKindStep() {
        return this.step === 'kind';
    }
    get isLayoutStep() {
        return this.step === 'layout';
    }
    get isTemplatesStep() {
        return this.step === 'templates';
    }
    get isThemeStep() {
        return this.step === 'theme';
    }
    get isDetailsStep() {
        return this.step === 'details';
    }
    get isSurveyDetailsStep() {
        return this.step === 'surveyDetails';
    }
    get isDone() {
        return this.step === 'done';
    }

    // ---- kind chooser (screen 0) ----
    get isSurveyKind() {
        return this.kind === 'survey';
    }
    handleKindForm() {
        this.kind = 'form';
        this.step = 'layout';
    }
    handleKindSurvey() {
        this.kind = 'survey';
        this.step = 'templates';
    }
    handleBackToKind() {
        this.step = 'kind';
        this.errorMessage = '';
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

    // ---- the survey path: templates → theme → details (owner 2026-07-31:
    // no layout step; the object is OPTIONAL and picked on the details
    // screen, where questions can later map to its fields) ----
    @track chosenTemplate = '';
    @track surveyName = '';

    get surveyTemplates() {
        return SURVEY_TEMPLATES.map((t) => ({
            ...t,
            cls:
                t.key === this.chosenTemplate
                    ? 'tpl-card is-selected'
                    : 'tpl-card'
        }));
    }

    get chosenTemplateName() {
        const t = SURVEY_TEMPLATES.find((x) => x.key === this.chosenTemplate);
        return t ? t.name : '';
    }

    handleSurveyName(e) {
        this.surveyName = e.target.value;
    }

    handleTemplatePick(event) {
        this.chosenTemplate = event.currentTarget.dataset.key;
        this.errorMessage = '';
        this.step = 'theme';
    }

    handleCreateSurvey() {
        if (this.isCreating) {
            return;
        }
        this.isCreating = true;
        this.errorMessage = '';
        createSurveyFromTemplate({
            templateKey: this.chosenTemplate,
            surveyName: this.surveyName.trim() || null,
            themeName: this.chosenThemeKey || null,
            objectApiName: this.chosenObject || null
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
                    'Could not create the survey.';
            });
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
        const t = listBuiltinThemes().find(
            (x) => x.key === this.chosenThemeKey
        );
        return t ? t.name : 'Pick a theme';
    }
    handleChangeTheme() {
        this.step = 'theme';
    }

    // Theme previews render the layout the creation will actually use —
    // surveys are always the One-at-a-Time flow (templates ship it).
    get themeGalleryLayout() {
        return this.isSurveyKind ? 'oneAtATime' : this.chosenLayout;
    }
    get themeGalleryPaneFlow() {
        return this.isSurveyKind ? '' : this.chosenPaneFlow;
    }
    get themeSub() {
        return this.isSurveyKind
            ? 'Each preview uses the survey flow — one question at a time.'
            : 'Each preview uses your chosen layout.';
    }

    // ---- live preview ----
    /**
     * The inline spec the preview viewer renders. Memoized on its real inputs
     * so unrelated re-renders (object search keystrokes) don't re-apply it.
     */
    get previewSpec() {
        const name = this.isSurveyKind
            ? this.surveyName.trim() || this.chosenTemplateName
            : this.formName.trim();
        const layout = this.isSurveyKind ? 'oneAtATime' : this.chosenLayout;
        const paneFlow = this.isSurveyKind ? '' : this.chosenPaneFlow;
        const key = `${this.kind}|${layout}|${paneFlow}|${this.chosenThemeKey}|${name}`;
        if (key !== this._specCacheKey) {
            this._specCacheKey = key;
            this._specCache = buildSampleSpec({
                layout,
                paneFlow: paneFlow || undefined,
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
                cls:
                    o.value === this.chosenObject
                        ? 'obj-item is-on'
                        : 'obj-item'
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
        this.step = this.isSurveyKind ? 'surveyDetails' : 'details';
    }
    handleBackFromTheme() {
        this.step = this.isSurveyKind ? 'templates' : 'layout';
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
        this._blurTimer = setTimeout(() => {
            this.objectOpen = false;
        }, 150);
    }

    disconnectedCallback() {
        clearTimeout(this._blurTimer);
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

    /** Done screen's primary action is a real ANCHOR — browsers never block
     *  anchor navigation, unlike window.open (which Brave & friends eat even
     *  on gestures; owner report 2026-07-31). */
    get createdStudioHref() {
        return this.createdInfo ? studioUrl(this.createdInfo.formId) : '#';
    }
    get doneTitle() {
        return this.isSurveyKind
            ? 'Your survey is ready'
            : 'Your form is ready';
    }

    handleStartOver() {
        this.step = 'kind';
        this.kind = '';
        this.entryMode = 'scratch';
        this.chosenLayout = '';
        this.chosenPaneFlow = '';
        this.chosenThemeKey = '';
        this.chosenTemplate = '';
        this.surveyName = '';
        this.formName = '';
        this.chosenObject = '';
        this.objectSearch = '';
        this.createdInfo = null;
        this.errorMessage = '';
        this.previewDevice = 'desktop';
    }
}
