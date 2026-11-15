import { LightningElement, track, wire } from 'lwc';
import getUpdatableObjects from '@salesforce/apex/FinalFormCreateController.getUpdatableObjects';
import createForm from '@salesforce/apex/FinalFormCreateController.createForm';
import createSurveyFromTemplate from '@salesforce/apex/FinalFormCreateController.createSurveyFromTemplate';
import createFreeformFromTemplate from '@salesforce/apex/FinalFormCreateController.createFreeformFromTemplate';
import { buildSampleSpec } from 'c/finalSampleSpec';
import { listBuiltinThemes } from 'c/finalThemeCatalog';
import { LAYOUT_GROUPS } from 'c/finalLayoutCards';
import { layoutArt } from 'c/finalDesignArt';
import { studioUrl } from 'c/finalStudioLink';

// A new survey's One at a time block, exactly as createSurveyFromTemplate
// writes it when the default is kept (any other layout gets the form block)
const SURVEY_LAYOUT = Object.freeze({
    type: 'oneAtATime',
    options: Object.freeze({})
});

/** The layout each type opens on (owner 2026-11-14). */
const DEFAULT_LAYOUT = {
    form: 'scroll',
    survey: 'oneAtATime',
    freeform: 'scroll'
};

/**
 * finalCreationGallery — the guided creation flow, replicating the OLD
 * formCreationGallery's UI exactly (owner 2026-07-05) with the REBUILD's
 * layout + theme rosters:
 *
 * One page picks the layout and the theme (owner 2026-11-14,
 * IMPL_PLAN_CREATION_LAYOUT_THEME): layout picture tiles over the theme
 * gallery, whose previews follow the tiles. Clicking a theme opens the detail
 * screen: config card left (name / object / APPEARANCE: Layout and Theme
 * chips, each with Change) beside the LIVE PREVIEW card (finalFormViewer on an
 * inline c/finalSampleSpec, device toggle at real device widths).
 * Emits `formcreated` { formId, versionId } + `close`.
 */

// The 8 layout choices live in c/finalLayoutCards (shared with the Design
// panel's layout picker).

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
        blurb: 'An empty one-question-per-screen survey. Build it yourself from the Questions palette.'
    },
    {
        key: 'csat',
        name: 'CSAT Pulse',
        icon: 'utility:smiley_and_people',
        blurb: 'How satisfied are customers? One score, one comment, charted by the Satisfaction topic.'
    },
    {
        key: 'nps',
        name: 'NPS Pulse',
        icon: 'utility:metrics',
        blurb: 'The classic 0–10 "would you recommend us?" plus the why, charted by the Loyalty topic.'
    },
    {
        key: 'event',
        name: 'Event Feedback',
        icon: 'utility:event',
        blurb: 'Rating, agreement, would-you-return, comments. Anonymous by default, for honest answers.'
    }
];

/** The Freeform shelf (FREEFORM_SPEC D5). */
const FREEFORM_TEMPLATES = [
    {
        key: 'blank',
        name: 'Blank freeform',
        icon: 'utility:add',
        blurb: 'An empty canvas. Ask anything, then decide later where the answers go in Salesforce.'
    },
    {
        key: 'contact',
        name: 'Contact Request',
        icon: 'utility:email',
        blurb: 'Collect a visitor’s details and what they need help with.'
    },
    {
        key: 'eventRegistration',
        name: 'Event Registration',
        icon: 'utility:event',
        blurb: 'Gather attendee details and registration preferences.'
    },
    {
        key: 'support',
        name: 'Support Request',
        icon: 'utility:help',
        blurb: 'Capture an issue and how to reach the requester.'
    },
    {
        key: 'partner',
        name: 'Partner Application',
        icon: 'utility:groups',
        blurb: 'Learn about an organization and its partnership goals.'
    }
];

export default class FinalCreationGallery extends LightningElement {
    // type → (form) look → details → done
    // type → (survey | freeform) templates → look → details → done
    // "look" = the one page for layout and theme (step key 'theme').
    // (owner 2026-07-31: ask form type FIRST; 2026-11-14: Forms have no
    // templates, and every type picks its layout beside its theme)
    @track step = 'type';
    @track formType = ''; // form | survey | freeform
    @track chosenLayout = '';
    /** The look page was opened by a Change on Details. */
    @track _fromDetails = false;
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
    // shrink-to-fit of the live preview (_fitPreview): scale + real size
    _pvScale = 1;
    _pvWidth = 0;
    _pvHeight = 0;

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
    get isTypeStep() {
        return this.step === 'type';
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
    get isFreeformDetailsStep() {
        return this.step === 'freeformDetails';
    }
    get isDone() {
        return this.step === 'done';
    }

    // ---- type chooser (screen 0) ----
    get isSurveyType() {
        return this.formType === 'survey';
    }
    get isFreeformType() {
        return this.formType === 'freeform';
    }
    /** Both answer-store types start at the template shelf. */
    get isTemplateType() {
        return this.isSurveyType || this.isFreeformType;
    }
    /** Choosing a type resets the layout to that type's default. */
    _startType(type) {
        this.formType = type;
        this._fromDetails = false;
        const [layout, paneFlow] = DEFAULT_LAYOUT[type].split(':');
        this.chosenLayout = layout;
        this.chosenPaneFlow = paneFlow || '';
    }
    handleTypeForm() {
        this._startType('form');
        this.step = 'theme';
    }
    handleTypeSurvey() {
        this._startType('survey');
        this.step = 'templates';
    }
    handleTypeFreeform() {
        this._startType('freeform');
        this.step = 'templates';
    }
    handleBackToType() {
        this.step = 'type';
        this.errorMessage = '';
    }

    // ---- the survey path: templates → look → details (owner 2026-07-31:
    // the object is OPTIONAL and picked on the details screen, where
    // questions can later map to its fields) ----
    @track chosenTemplate = '';
    @track surveyName = '';

    /** The shelf for whichever answer-store type is being created. */
    get templateCards() {
        const shelf = this.isFreeformType
            ? FREEFORM_TEMPLATES
            : SURVEY_TEMPLATES;
        return shelf.map((t) => ({
            ...t,
            cls:
                t.key === this.chosenTemplate
                    ? 'tpl-card is-selected'
                    : 'tpl-card'
        }));
    }
    get templatesTitle() {
        return this.isFreeformType
            ? 'Start your freeform'
            : 'Pick a survey template';
    }
    get templatesSub() {
        return this.isFreeformType
            ? 'Answers are kept with the submission. You pick the layout and theme next, and can map answers to Salesforce later.'
            : 'Complete and ready: answers land in the answer store. You pick the layout and theme next.';
    }

    get chosenTemplateName() {
        const shelf = this.isFreeformType
            ? FREEFORM_TEMPLATES
            : SURVEY_TEMPLATES;
        const t = shelf.find((x) => x.key === this.chosenTemplate);
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
            objectApiName: this.chosenObject || null,
            layoutType: this.chosenLayout || null,
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
                    'Could not create the survey.';
            });
    }

    // ---- the look page: layout tiles over the theme gallery ----
    get chosenLayoutKey() {
        return cardKey({
            layout: this.chosenLayout,
            paneFlow: this.chosenPaneFlow
        });
    }
    /** The 8 layout choices as picture tiles (DESIGN_SYSTEM 5.24). */
    get layoutTiles() {
        const out = [];
        LAYOUT_GROUPS.forEach((g) => {
            g.cards.forEach((c) => {
                const value = cardKey(c);
                out.push({ value, label: c.name, drawing: layoutArt(value) });
            });
        });
        return out;
    }
    handleLayoutTile(e) {
        const [layout, paneFlow] = String(e.detail.value).split(':');
        this.chosenLayout = layout;
        this.chosenPaneFlow = paneFlow || '';
    }
    get chosenLayoutLabel() {
        const hit = this.layoutTiles.find(
            (o) => o.value === this.chosenLayoutKey
        );
        return hit ? hit.label : 'Pick a layout';
    }
    get lookSub() {
        const what = this.isSurveyType
            ? 'survey'
            : this.isFreeformType
              ? 'freeform'
              : 'form';
        return `Choose how your ${what} moves, then click a theme to use it.`;
    }

    get chosenThemeLabel() {
        const t = listBuiltinThemes().find(
            (x) => x.key === this.chosenThemeKey
        );
        return t ? t.name : 'Pick a theme';
    }
    /** Both Details chips come back to the look page. */
    handleChangeLook() {
        this._fromDetails = true;
        this.step = 'theme';
    }
    /** Details names what each chip changes, not just its value. */
    get layoutChipAria() {
        return `Layout: ${this.chosenLayoutLabel}. Change`;
    }
    get themeChipAria() {
        return `Theme: ${this.chosenThemeLabel}. Change`;
    }
    get lookBackLabel() {
        return this._fromDetails ? 'Back to details' : 'Back';
    }
    get _detailsStep() {
        if (this.isSurveyType) {
            return 'surveyDetails';
        }
        return this.isFreeformType ? 'freeformDetails' : 'details';
    }

    /**
     * What the theme previews draw: a survey left on One at a time is written
     * with nothing set; any other new form starts as newLayoutDefaults (null).
     */
    get themeGalleryFormLayout() {
        const surveyDefault =
            this.isSurveyType &&
            this.chosenLayout === 'oneAtATime' &&
            !this.chosenPaneFlow;
        return surveyDefault ? SURVEY_LAYOUT : null;
    }

    // ---- live preview ----
    /**
     * The inline spec the preview viewer renders. Memoized on its real inputs
     * so unrelated re-renders (object search keystrokes) don't re-apply it.
     */
    get previewSpec() {
        const name = this.isSurveyType
            ? this.surveyName.trim() || this.chosenTemplateName
            : this.isFreeformType
              ? this.formName.trim() || this.chosenTemplateName
              : this.formName.trim();
        const layout = this.chosenLayout;
        const paneFlow = this.chosenPaneFlow;
        const key = `${this.formType}|${layout}|${paneFlow}|${this.chosenThemeKey}|${name}`;
        if (key !== this._specCacheKey) {
            this._specCacheKey = key;
            this._specCache = buildSampleSpec({
                layout,
                paneFlow: paneFlow || undefined,
                themeKey: this.chosenThemeKey,
                title: name || undefined,
                survey: this.isSurveyType
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
    /**
     * The frame lays out at its real device width, then shrinks as a
     * picture when the pane is narrower (owner 2026-10-31: shrink to fit,
     * nothing cut off). The transform leaves the frame's own layout width
     * alone, so the form's container queries still see a true desktop.
     */
    get previewFrameStyle() {
        const width = `width:${DEVICE_WIDTHS[this.previewDevice] || 1024}px;`;
        return this._pvScale < 1
            ? `${width} transform:scale(${this._pvScale}); transform-origin:0 0;`
            : width;
    }
    /** The box the shrunk picture takes up (a transform frees no space). */
    get previewFitStyle() {
        if (this._pvScale >= 1 || !this._pvWidth) {
            return '';
        }
        const w = Math.round(this._pvWidth * this._pvScale);
        const h = Math.round(this._pvHeight * this._pvScale);
        // no clipping here: the tablet/phone frame's shadow must show, and
        // the browser sizes scroll overflow by the shrunk picture
        return `width:${w}px; height:${h}px;`;
    }

    renderedCallback() {
        this._watchPreview();
    }

    /** Follow the pane's width and the form's height while a preview shows. */
    _watchPreview() {
        const stage = this.template.querySelector('.d-stage');
        const frame = stage ? stage.querySelector('.pv-fit > div') : null;
        if (stage === this._pvStage && frame === this._pvFrame) {
            return;
        }
        this._unwatchPreview();
        if (!stage || !frame || typeof ResizeObserver === 'undefined') {
            return;
        }
        this._pvStage = stage;
        this._pvFrame = frame;
        this._pvObserver = new ResizeObserver(() => this._fitPreview());
        this._pvObserver.observe(stage);
        this._pvObserver.observe(frame);
        this._fitPreview();
    }

    _unwatchPreview() {
        if (this._pvObserver) {
            this._pvObserver.disconnect();
        }
        this._pvObserver = null;
        this._pvStage = null;
        this._pvFrame = null;
    }

    _fitPreview() {
        const stage = this._pvStage;
        const frame = this._pvFrame;
        if (!stage || !frame) {
            return;
        }
        const cs = window.getComputedStyle(stage);
        const room =
            stage.clientWidth -
            (parseFloat(cs.paddingLeft) || 0) -
            (parseFloat(cs.paddingRight) || 0);
        // offsetWidth/Height ignore the transform: the frame's real size
        const width = frame.offsetWidth;
        const height = frame.offsetHeight;
        const scale =
            room > 0 && width > room
                ? Math.floor((room / width) * 1000) / 1000
                : 1;
        if (
            scale !== this._pvScale ||
            width !== this._pvWidth ||
            height !== this._pvHeight
        ) {
            this._pvScale = scale;
            this._pvWidth = width;
            this._pvHeight = height;
        }
    }
    /** Preview width: the shared button group (DESIGN_SYSTEM 5.7). */
    get deviceGroupOptions() {
        return DEVICES.map((d) => ({ label: d.title, value: d.value }));
    }

    handleDevice(e) {
        this.previewDevice = e.detail
            ? e.detail.value
            : e.currentTarget.dataset.value;
    }

    get createFormLabel() {
        return this.isCreating ? 'Creating…' : 'Create form';
    }
    get createSurveyLabel() {
        return this.isCreating ? 'Creating…' : 'Create survey';
    }
    get createFreeformLabel() {
        return this.isCreating ? 'Creating…' : 'Create freeform';
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
    handleThemeSelect(e) {
        this.chosenThemeKey = e.detail.themeKey;
        this._fromDetails = false;
        this.step = this._detailsStep;
    }
    /** After a Change on Details, Back keeps both picks and returns there. */
    handleBackFromTheme() {
        if (this._fromDetails) {
            this._fromDetails = false;
            this.step = this._detailsStep;
            return;
        }
        this.step = this.isTemplateType ? 'templates' : 'type';
        this.errorMessage = '';
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
        this._unwatchPreview();
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

    /** Freeform create: template + layout + theme + name, no object. */
    handleCreateFreeform() {
        if (this.isCreating) {
            return;
        }
        this.isCreating = true;
        this.errorMessage = '';
        createFreeformFromTemplate({
            templateKey: this.chosenTemplate || 'blank',
            formName: this.formName.trim() || null,
            themeName: this.chosenThemeKey || null,
            layoutType: this.chosenLayout || null,
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
                    'Could not create the freeform.';
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
        if (this.isSurveyType) {
            return 'Your survey is ready';
        }
        return this.isFreeformType
            ? 'Your freeform is ready'
            : 'Your form is ready';
    }

    handleStartOver() {
        this.step = 'type';
        this._fromDetails = false;
        this.formType = '';
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
