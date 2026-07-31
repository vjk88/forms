import { LightningElement, api, wire } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';
import listSurveyTopics from '@salesforce/apex/FinalStudioController.listSurveyTopics';
import createSurveyTopic from '@salesforce/apex/FinalStudioController.createSurveyTopic';
import uploadImage from '@salesforce/apex/FormAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FormAssetController.deleteImage';

/**
 * finalPropertyPanel — the selected node's editor, a direct port of the
 * legacy formStudio inspector surfaces (BUILDER_SURFACES — owner 2026-07-10:
 * "copy the UI and features directly from FormBuilder"). Per-type (§5):
 * Field / Display text / Image / Callout / Divider / Spacer / Consent /
 * File upload / Empty space / Section / Repeating Group / Page — each shows
 * only its own properties. Owner deltas: NO delete button, NO binding
 * re-pick (fixed at drag), NO per-field label styling (global), segmented
 * buttons over dropdowns, prefill controls wait for the Autofill slice.
 *
 * DUMB view: the studio owns the spec. Intents — `propchange` {patch} ·
 * `configchange` {patch} · `repeatchange` {patch} · `blockstylechange`
 * {style} · `validationchange` {entries} · `addchildfield` {field}.
 * `required` is authoring sugar the STUDIO compiles into the validation
 * entry (schema §4); Behavior + the Consent acceptance toggle both ride it.
 *
 * Images upload as Salesforce Files (FormAssetController — the proven
 * legacy path); only URL + versionId land in the spec, never base64.
 *
 * pp- prefixed classes (LEX leak rule).
 */

/** Curated section-header icons (legacy SECTION_ICONS, formStudio.js:36). */
const SECTION_ICONS = [
    'user',
    'groups',
    'people',
    'identity',
    'company',
    'contact_request',
    'info',
    'announcement',
    'knowledge_base',
    'note',
    'description',
    'settings',
    'dashboard',
    'apps',
    'home',
    'location',
    'checkin',
    'world',
    'travel_and_places',
    'call',
    'email',
    'chat',
    'feed',
    'bell',
    'cart',
    'currency',
    'moneybag',
    'products',
    'calendar',
    'event',
    'clock',
    'date_input',
    'file',
    'attach',
    'upload',
    'link',
    'checklist',
    'task',
    'success',
    'approval',
    'contract',
    'lock',
    'shield',
    'privately_shared',
    'case',
    'question',
    'help',
    'priority',
    'warning',
    'flag',
    'favorite',
    'heart',
    'rating',
    'edit',
    'form',
    'list',
    'rows',
    'table',
    'filter',
    'search',
    'picklist_type'
];

const IMAGE_SIZES = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
    { label: 'Full width', value: 'full' },
    { label: 'Fit', value: 'fit' }
];

const CALLOUT_TONES = [
    { label: 'Info', value: 'info' },
    { label: 'Success', value: 'success' },
    { label: 'Warning', value: 'warning' },
    { label: 'Error', value: 'error' }
];

const SPACER_SIZES = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' }
];

const REPEAT_STYLES = [
    { label: 'Stacked', value: 'stacked' },
    { label: 'Table', value: 'table' },
    { label: 'Tiles', value: 'tileModal' }
];

/** Display-as choices per inputType (legacy renderAsOptions, BUILDER_SURFACES §2). */
function renderAsChoicesFor(inputType) {
    const opts = [{ label: 'Default (from schema)', value: 'Default' }];
    if (inputType === 'text' || inputType === 'textarea') {
        opts.push(
            { label: 'Dropdown', value: 'Dropdown' },
            { label: 'Radio buttons', value: 'Radio_Buttons' },
            { label: 'Checkbox group', value: 'Checkbox_Group' }
        );
    }
    if (inputType === 'picklist') {
        opts.push(
            { label: 'Radio buttons', value: 'Radio_Buttons' },
            { label: 'Dropdown', value: 'Dropdown' }
        );
    }
    if (inputType === 'checkbox') {
        opts.push({ label: 'Toggle', value: 'Toggle' });
    }
    if (inputType === 'number') {
        opts.push({ label: 'Slider', value: 'Slider' });
    }
    return opts;
}

export default class FinalPropertyPanel extends LightningElement {
    /** 'element' | 'section' | 'page' (block wrapper sections arrive as
     *  their inner element — the studio resolves that before passing). */
    @api kind;
    /** The object a FIELD element binds against (read-only display). */
    @api bindingObjectApi;
    /** The hosting section's column count (Width control scope). */
    @api sectionColumns = 1;
    /** Wrapper style when the node is a STANDALONE content block, else null. */
    @api blockStyle;
    /** The form record Id — uploads link their file to it. */
    @api formId;
    /** Rule sources for THIS node (studio-scoped per §7): [{id, label}]. */
    @api ruleSources = [];
    /** Map(id → {type, repeatSectionId}) — the rule editor's lint index. */
    @api ruleIndex;
    /** The repeat section this node lives inside, or null (lint scoping). */
    @api hostRepeatSectionId;

    _node;
    _childObject;
    uploading = false;
    uploadError;
    iconSearch = '';

    @api
    get node() {
        return this._node;
    }
    set node(value) {
        this._node = value;
        // undefined (not null) keeps the wire idle when there is no repeater
        this._childObject =
            (value && value.repeat && value.repeat.childObject) || undefined;
    }

    childFields;
    childError;

    @wire(describeFields, { objectApi: '$_childObject' })
    wiredChild({ data, error }) {
        if (data) {
            this.childFields = data;
            this.childError = undefined;
        } else if (error) {
            this.childError = 'The child object’s fields could not be loaded.';
        }
    }

    get n() {
        return this._node || {};
    }

    get cfg() {
        return this.n.config || {};
    }

    // ---- type resolution (§5: one inspector per type) ----

    get isElement() {
        return this.kind === 'element';
    }

    get isField() {
        return this.isElement && this.n.type === 'field';
    }

    get isRichText() {
        return this.isElement && this.n.type === 'richText';
    }

    get isImage() {
        return this.isElement && this.n.type === 'image';
    }

    get isCallout() {
        return this.isElement && this.n.type === 'callout';
    }

    get isDivider() {
        return this.isElement && this.n.type === 'divider';
    }

    get isSpacer() {
        return this.isElement && this.n.type === 'spacer';
    }

    get isConsent() {
        return this.isElement && this.n.type === 'consent';
    }

    get isFile() {
        return this.isElement && this.n.type === 'file';
    }

    get isEmptySpace() {
        return this.isElement && this.n.type === 'emptySpace';
    }

    /** Content types that carry a Label input (legacy: everything editable
     *  except Empty space; divider has no label either). */
    get hasContentLabel() {
        return (
            this.isRichText ||
            this.isImage ||
            this.isCallout ||
            this.isConsent ||
            this.isFile
        );
    }

    get isOtherElement() {
        return (
            this.isElement &&
            !this.isField &&
            !this.hasContentLabel &&
            !this.isDivider &&
            !this.isSpacer &&
            !this.isEmptySpace &&
            !this.isSurveyQuestion
        );
    }

    // ---- survey scale-family inspector (S2b — SURVEY_PLAN §5) ----

    get isNpsQuestion() {
        return this.isElement && this.n.type === 'nps';
    }

    get isRatingQuestion() {
        return this.isElement && this.n.type === 'rating';
    }

    get isOpinionScaleQuestion() {
        return this.isElement && this.n.type === 'scale';
    }

    get isEmojiScaleQuestion() {
        return this.isElement && this.n.type === 'emojiScale';
    }

    get isScaleFamilyQuestion() {
        return (
            this.isNpsQuestion ||
            this.isRatingQuestion ||
            this.isOpinionScaleQuestion ||
            this.isEmojiScaleQuestion
        );
    }

    get isYesNoQuestion() {
        return this.isElement && this.n.type === 'yesNo';
    }

    get isImageChoiceQuestion() {
        return this.isElement && this.n.type === 'imageChoice';
    }

    get isSurveyQuestion() {
        return (
            this.isScaleFamilyQuestion ||
            this.isYesNoQuestion ||
            this.isImageChoiceQuestion
        );
    }

    // ---- yesNo / imageChoice inspectors (S3) ----

    handleYesLabel(event) {
        this._config({ yesLabel: event.target.value });
    }

    handleNoLabel(event) {
        this._config({ noLabel: event.target.value });
    }

    handleImageMultiple(event) {
        this._config({ multiple: event.target.checked });
    }

    get imageOptionRows() {
        return ((this.cfg.options || []).length ? this.cfg.options : []).map(
            (o, index) => ({ ...o, index, key: `${index}` })
        );
    }

    handleImageOptionChange(event) {
        const index = Number(event.currentTarget.dataset.index);
        const prop = event.currentTarget.dataset.field;
        const options = (this.cfg.options || []).map((o, i) => {
            return i === index ? { ...o, [prop]: event.target.value } : o;
        });
        this._config({ options });
    }

    handleAddImageOption() {
        const options = [
            ...(this.cfg.options || []),
            {
                value: `opt${(this.cfg.options || []).length + 1}`,
                label: '',
                url: ''
            }
        ];
        this._config({ options });
    }

    handleRemoveImageOption(event) {
        const index = Number(event.currentTarget.dataset.index);
        this._config({
            options: (this.cfg.options || []).filter((o, i) => i !== index)
        });
    }

    /** optionStyle + allowOther for CHOICE fields (renderAs radio/checkbox
     *  with options — SURVEY_PLAN §2.2 field config additions). */
    get showOptionStyle() {
        return (
            this.isField &&
            (this.cfg.options || []).length > 0 &&
            (this.cfg.renderAs === 'Radio_Buttons' ||
                this.cfg.renderAs === 'Checkbox_Group' ||
                this.cfg.renderAs === 'Custom_MultiSelect')
        );
    }

    get optionStyleSeg() {
        return this._seg(
            [
                { label: 'List', value: 'list' },
                { label: 'Chips', value: 'chips' },
                { label: 'Cards', value: 'cards' }
            ],
            this.cfg.optionStyle === 'chips' || this.cfg.optionStyle === 'cards'
                ? this.cfg.optionStyle
                : 'list'
        );
    }

    handleOptionStyle(event) {
        const v = event.currentTarget.dataset.value;
        this._config({ optionStyle: v === 'list' ? undefined : v });
    }

    handleAllowOther(event) {
        this._config({ allowOther: event.target.checked });
    }

    get hasCaption() {
        return Boolean(this.n.description);
    }

    // ---- topics picker (S2c — vocabulary chips, round-6 model) ----

    /** Vocabulary, lazy-loaded the first time a survey question is open. */
    allTopics;
    topicError;
    _topicsRequested = false;

    renderedCallback() {
        if (this.isSurveyQuestion && !this._topicsRequested) {
            this._topicsRequested = true;
            listSurveyTopics()
                .then((topics) => {
                    this.allTopics = topics;
                })
                .catch(() => {
                    this.topicError =
                        'Topics could not be loaded — try reopening.';
                });
        }
    }

    get topicChips() {
        return ((this.n.analytics || {}).topics || []).filter((t) => t && t.id);
    }

    /** Datalist = vocabulary minus what's already on the question. */
    get availableTopics() {
        const used = new Set(this.topicChips.map((t) => t.id));
        return (this.allTopics || []).filter((t) => !used.has(t.id));
    }

    handleRemoveTopic(event) {
        const id = event.currentTarget.dataset.id;
        this._patchTopics(this.topicChips.filter((t) => t.id !== id));
    }

    /** Type-or-pick: an existing name (case-insensitive) attaches the
     *  existing topic; a new name mints one server-side (name-dedupe there
     *  too — same-but-different tags would re-split the charts). */
    async handleTopicEntry(event) {
        const raw = (event.target.value || '').trim();
        if (!raw) {
            return;
        }
        event.target.value = '';
        this.topicError = undefined;
        const match = (this.allTopics || []).find(
            (t) => t.name.toLowerCase() === raw.toLowerCase()
        );
        try {
            const topic =
                match || (await createSurveyTopic({ topicName: raw }));
            if (!match) {
                this.allTopics = [...(this.allTopics || []), topic].sort(
                    (a, b) => a.name.localeCompare(b.name)
                );
            }
            if (!this.topicChips.some((t) => t.id === topic.id)) {
                this._patchTopics([
                    ...this.topicChips,
                    { id: topic.id, name: topic.name }
                ]);
            }
        } catch (e) {
            this.topicError =
                (e && e.body && e.body.message) ||
                'That topic could not be added.';
        }
    }

    _patchTopics(topics) {
        this._prop({
            analytics: { ...(this.n.analytics || {}), topics }
        });
    }

    /** Rating max: segmented 5|10 (owner ruling Q1 — never a spinner,
     *  never 7). */
    get ratingMaxSeg() {
        return this._seg(
            [
                { label: '5', value: '5' },
                { label: '10', value: '10' }
            ],
            String(this.cfg.max === 10 ? 10 : 5)
        );
    }

    get ratingIconSeg() {
        return this._seg(
            [
                { label: '★ Star', value: 'star' },
                { label: '♥ Heart', value: 'heart' },
                { label: '👍 Thumb', value: 'thumb' }
            ],
            this.cfg.icon || 'star'
        );
    }

    /** Opinion Scale size: presets 5/7/10 (principle 2.0.5 — the 1–7
     *  research scale lives HERE, not on rating). */
    get scaleSizeSeg() {
        return this._seg(
            [
                { label: '5', value: '5' },
                { label: '7', value: '7' },
                { label: '10', value: '10' }
            ],
            String([5, 7, 10].includes(this.cfg.size) ? this.cfg.size : 5)
        );
    }

    /** NPS detractor coloring: theme accent default, classic opt-in (Q2). */
    get npsColoringSeg() {
        return this._seg(
            [
                { label: 'Theme accent', value: 'accent' },
                { label: 'Classic 🔴🟠🟢', value: 'classic' }
            ],
            this.cfg.coloring === 'classic' ? 'classic' : 'accent'
        );
    }

    /** Caption display (round-4 ruling): visible line | help bubble. */
    get captionDisplaySeg() {
        return this._seg(
            [
                { label: 'Caption line', value: 'caption' },
                { label: 'ⓘ Help bubble', value: 'help' }
            ],
            this.n.descriptionDisplay === 'help' ? 'help' : 'caption'
        );
    }

    handleSurveyRequired(event) {
        this._prop({ required: event.target.checked });
    }

    handleCaption(event) {
        this._prop({ description: event.target.value });
    }

    handleCaptionDisplay(event) {
        this._prop({
            descriptionDisplay: event.currentTarget.dataset.value
        });
    }

    /** Scale-bound changes keep analytics.scaleMax in lockstep — normalized
     *  scores must never disagree with the widget's own bounds. */
    handleRatingMax(event) {
        const max = Number(event.currentTarget.dataset.value);
        this._config({ max });
        this._prop({
            analytics: {
                ...(this.n.analytics || {}),
                scaleMin: 1,
                scaleMax: max
            }
        });
    }

    handleRatingIcon(event) {
        this._config({ icon: event.currentTarget.dataset.value });
    }

    handleScaleSize(event) {
        const size = Number(event.currentTarget.dataset.value);
        this._config({ size });
        this._prop({
            analytics: {
                ...(this.n.analytics || {}),
                scaleMin: 1,
                scaleMax: size
            }
        });
    }

    handleNpsColoring(event) {
        this._config({ coloring: event.currentTarget.dataset.value });
    }

    handleEndLabel(event) {
        const side = event.currentTarget.dataset.side;
        const patch =
            side === 'left'
                ? { leftLabel: event.target.value }
                : { rightLabel: event.target.value };
        this._config(patch);
    }

    get isRepeater() {
        return this.kind === 'section' && Boolean(this.n.repeat);
    }

    get isSection() {
        return this.kind === 'section' && !this.n.repeat;
    }

    get isPage() {
        return this.kind === 'page';
    }

    // ---- header ----

    get title() {
        if (this.isPage) {
            return this.n.name || 'Page';
        }
        if (this.kind === 'section') {
            return (
                this.n.title ||
                (this.isRepeater ? 'Repeating group' : 'Section')
            );
        }
        return this.n.label || this.n.type || 'Element';
    }

    get subtitle() {
        if (this.isField) {
            const bound = this.n.binding && this.n.binding.field;
            return bound
                ? `Field · ${this.bindingObjectApi}.${bound}`
                : 'Field';
        }
        if (this.isRepeater) {
            return `Repeating group · ${this.n.repeat.childObject}`;
        }
        const names = {
            richText: 'Display text',
            image: 'Image',
            callout: 'Callout',
            divider: 'Divider',
            spacer: 'Spacer',
            consent: 'Consent',
            file: 'File upload',
            emptySpace: 'Empty space',
            nps: 'Question · NPS',
            rating: 'Question · Rating',
            scale: 'Question · Opinion Scale',
            emojiScale: 'Question · Emoji Scale'
        };
        if (this.isElement) {
            return names[this.n.type] || 'Element';
        }
        return this.isPage ? 'Page' : 'Section';
    }

    // ---- segmented option builders ----

    _seg(options, current) {
        return options.map((o) => ({
            ...o,
            cls: o.value === current ? 'pp-seg-btn on' : 'pp-seg-btn'
        }));
    }

    // ---- field inspector (BUILDER_SURFACES §2) ----

    /** Behavior = Editable / Required / Read only (segmented; legacy minus
     *  the prefill-era Hidden — owner: later, with the Autofill slice). */
    get behaviorValue() {
        if (this.n.readOnly) {
            return 'readonly';
        }
        return this.n.required ? 'required' : 'editable';
    }

    get behaviorSeg() {
        return this._seg(
            [
                { label: 'Editable', value: 'editable' },
                { label: 'Required', value: 'required' },
                { label: 'Read only', value: 'readonly' }
            ],
            this.behaviorValue
        );
    }

    get renderAsOptions() {
        const cur = this.cfg.renderAs || 'Default';
        return renderAsChoicesFor(this.cfg.inputType).map((o) => ({
            ...o,
            selected: o.value === cur ? true : undefined
        }));
    }

    get hasRenderAsChoices() {
        return this.renderAsOptions.length > 1;
    }

    /** Options editor: custom choices for text fields; describe-seeded and
     *  editable for picklists (legacy showCustomValues). */
    get showOptionsEditor() {
        const ra = this.cfg.renderAs;
        const it = this.cfg.inputType;
        return (
            ['Dropdown', 'Radio_Buttons', 'Checkbox_Group'].includes(ra) &&
            ['text', 'textarea', 'picklist'].includes(it)
        );
    }

    get optionRows() {
        return (this.cfg.options || []).map((o, i) => ({
            key: `opt_${i}`,
            index: i,
            label: o.label || '',
            value: o.value || ''
        }));
    }

    get isSlider() {
        return this.cfg.renderAs === 'Slider';
    }

    get slider() {
        const s = this.cfg.slider || {};
        return {
            min: s.min != null ? s.min : 0,
            max: s.max != null ? s.max : 100,
            step: s.step != null ? s.step : 1
        };
    }

    // ---- Width (multi-column sections only — legacy showWidth) ----

    get cols() {
        return Number(this.sectionColumns) || 1;
    }

    /** Fields, sizable content, and Empty space size; divider/spacer never. */
    get showWidth() {
        return (
            this.cols > 1 &&
            (this.isField || this.hasContentLabel || this.isEmptySpace)
        );
    }

    get widthSeg() {
        const cur = Math.min(Math.max(Number(this.n.width) || 1, 1), this.cols);
        const opts = [];
        for (let k = 1; k <= this.cols; k++) {
            opts.push({
                label: k === this.cols ? 'Full' : String(k),
                value: String(k)
            });
        }
        return this._seg(opts, String(cur));
    }

    get showEmptySpaceNote() {
        return this.isEmptySpace && this.cols <= 1;
    }

    // ---- content inspectors ----

    get imageSizeSeg() {
        return this._seg(IMAGE_SIZES, this.cfg.size || 'full');
    }

    get calloutToneSeg() {
        return this._seg(CALLOUT_TONES, this.cfg.variant || 'info');
    }

    get spacerSizeSeg() {
        return this._seg(SPACER_SIZES, this.cfg.size || 'medium');
    }

    get hasImageSrc() {
        return Boolean(this.cfg.src);
    }

    get uploadLabel() {
        if (this.uploading) {
            return 'Uploading…';
        }
        return this.hasImageSrc ? 'Replace image' : 'Upload image';
    }

    get consentRequired() {
        return this.n.required !== false && this.n.required !== undefined
            ? Boolean(this.n.required)
            : false;
    }

    get consentSeg() {
        return this._seg(
            [
                { label: 'Required', value: 'required' },
                { label: 'Optional', value: 'optional' }
            ],
            this.consentRequired ? 'required' : 'optional'
        );
    }

    /** Standalone block style (legacy: only standalone, never the
     *  plain-only types — the studio decides and passes blockStyle). */
    get showBlockStyle() {
        return Boolean(this.blockStyle);
    }

    get blockStyleSeg() {
        return this._seg(
            [
                { label: 'Plain', value: 'plain' },
                { label: 'Card', value: 'card' },
                { label: 'Boxed', value: 'boxed' }
            ],
            this.blockStyle || 'plain'
        );
    }

    // ---- section inspector (BUILDER_SURFACES §3) ----

    get columnsSeg() {
        return this._seg(
            [
                { label: '1', value: '1' },
                { label: '2', value: '2' },
                { label: '3', value: '3' },
                { label: '4', value: '4' }
            ],
            String(this.n.columns || 1)
        );
    }

    get showHeader() {
        return this.n.showHeader !== false;
    }

    get headerToggleLabel() {
        return this.showHeader ? 'Header shown' : 'Header hidden';
    }

    get headerToggleClass() {
        return this.showHeader ? 'pp-toggle on' : 'pp-toggle';
    }

    get collapsible() {
        return Boolean(this.n.collapsible);
    }

    get collapsibleLabel() {
        return this.collapsible ? 'Collapsible' : 'Not collapsible';
    }

    get collapsibleClass() {
        return this.collapsible ? 'pp-toggle on' : 'pp-toggle';
    }

    get collapsedDefaultLabel() {
        return this.n.defaultCollapsed ? 'Starts collapsed' : 'Starts expanded';
    }

    get collapsedDefaultClass() {
        return this.n.defaultCollapsed ? 'pp-toggle on' : 'pp-toggle';
    }

    get hasIcon() {
        return Boolean(this.n.icon);
    }

    get iconChoices() {
        const q = this.iconSearch.trim().toLowerCase();
        const current = this.n.icon;
        return SECTION_ICONS.filter((name) => !q || name.includes(q)).map(
            (name) => {
                const full = `utility:${name}`;
                return {
                    key: name,
                    name: full,
                    cls: full === current ? 'pp-ic on' : 'pp-ic'
                };
            }
        );
    }

    // ---- repeater inspector (§4.4 — DEDICATED) ----

    get repeat() {
        return this.n.repeat || {};
    }

    get repeatStyleSeg() {
        return this._seg(REPEAT_STYLES, this.repeat.style || 'stacked');
    }

    get childHeading() {
        return `Fields — ${this.repeat.childObject}`;
    }

    /** Child list dedupes against fields already in THIS section (§4.4). */
    get childRows() {
        const used = new Set(
            (this.n.elements || [])
                .map((el) => el.binding && el.binding.field)
                .filter(Boolean)
        );
        return (this.childFields || []).map((f) => {
            const added = used.has(f.apiName);
            return {
                ...f,
                added,
                cls: added ? 'pp-childfield added' : 'pp-childfield',
                title: added
                    ? `${f.label} is already in this group`
                    : `Add ${f.label} to the group`
            };
        });
    }

    get childLoading() {
        return this.isRepeater && !this.childFields && !this.childError;
    }

    // ---- rules (owner ruling: THIS visibility editor stays) ----

    get ruleNoun() {
        if (this.isPage) {
            return 'page';
        }
        if (this.kind === 'section') {
            return this.isRepeater ? 'group' : 'section';
        }
        return this.isField ? 'field' : 'block';
    }

    /** `required` stays the Behavior control's entry — checks list the rest. */
    get extraValidation() {
        return (this.n.validation || []).filter((v) => v.type !== 'required');
    }

    /** compareTo candidates = other elements, never this one. */
    get compareSources() {
        return (this.ruleSources || []).filter((s) => s.id !== this.n.id);
    }

    /** Checks are a FIELD affordance (schema: validation on elements). */
    get showChecks() {
        return this.isField;
    }

    // ---- intents ----

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }

    _prop(patch) {
        this._emit('propchange', { patch });
    }

    _config(patch) {
        this._emit('configchange', { patch });
    }

    handleLabel(event) {
        this._prop({ label: event.target.value });
    }

    handleBehavior(event) {
        const v = event.currentTarget.dataset.value;
        this._prop({
            required: v === 'required',
            readOnly: v === 'readonly'
        });
    }

    handlePlaceholder(event) {
        this._prop({ placeholder: event.target.value });
    }

    handleHelp(event) {
        this._prop({ help: event.target.value });
    }

    handleRenderAs(event) {
        const renderAs = event.target.value;
        const patch = { renderAs };
        // custom choices need rows to edit; seed picklists from describe
        if (
            ['Dropdown', 'Radio_Buttons', 'Checkbox_Group'].includes(
                renderAs
            ) &&
            !(this.cfg.options || []).length
        ) {
            patch.options = [{ label: '', value: '' }];
        }
        this._config(patch);
    }

    handleOptionChange(event) {
        const { index, field } = event.currentTarget.dataset;
        const options = (this.cfg.options || []).map((o) => ({ ...o }));
        const row = options[Number(index)];
        if (!row) {
            return;
        }
        row[field] = event.target.value;
        this._config({ options });
    }

    handleAddOption() {
        const options = [...(this.cfg.options || []), { label: '', value: '' }];
        this._config({ options });
    }

    handleRemoveOption(event) {
        const options = (this.cfg.options || []).filter(
            (_o, i) => i !== Number(event.currentTarget.dataset.index)
        );
        this._config({ options });
    }

    handleSlider(event) {
        const { param } = event.currentTarget.dataset;
        const v = Number(event.target.value);
        this._config({
            slider: { ...this.slider, [param]: Number.isFinite(v) ? v : 0 }
        });
    }

    handleWidth(event) {
        this._prop({ width: Number(event.currentTarget.dataset.value) });
    }

    // content
    handleRichText(event) {
        this._config({ html: event.target.value });
    }

    handleImageAlt(event) {
        this._config({ alt: event.target.value });
    }

    handleImageSize(event) {
        this._config({ size: event.currentTarget.dataset.value });
    }

    handleCalloutTone(event) {
        this._config({ variant: event.currentTarget.dataset.value });
    }

    handleSpacerSize(event) {
        this._config({ size: event.currentTarget.dataset.value });
    }

    handleConsentToggle(event) {
        this._prop({
            required: event.currentTarget.dataset.value === 'required'
        });
    }

    handleBlockStyle(event) {
        this._emit('blockstylechange', {
            style: event.currentTarget.dataset.value
        });
    }

    /** Upload → Salesforce File → {src, versionId} into config (legacy
     *  _uploadAndStore; the previous file is cleaned up on replace). */
    handleImageUpload(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = ''; // allow re-picking the same file
        if (!file) {
            return;
        }
        const previousVersionId = this.cfg.versionId;
        this.uploading = true;
        this.uploadError = undefined;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const res = await uploadImage({
                    base64Data: reader.result,
                    fileName: file.name,
                    formId: this.formId
                });
                this._config({ src: res.url, versionId: res.contentVersionId });
                if (previousVersionId) {
                    deleteImage({ contentVersionId: previousVersionId });
                }
            } catch (e) {
                this.uploadError =
                    (e && e.body && e.body.message) ||
                    'The image could not be uploaded.';
            } finally {
                this.uploading = false;
            }
        };
        reader.readAsDataURL(file);
    }

    handleImageRemove() {
        const previousVersionId = this.cfg.versionId;
        this._config({ src: null, versionId: null });
        if (previousVersionId) {
            deleteImage({ contentVersionId: previousVersionId });
        }
    }

    // section
    handleTitle(event) {
        this._prop({ title: event.target.value });
    }

    handleDescription(event) {
        this._prop({ description: event.target.value });
    }

    handleColumns(event) {
        this._prop({ columns: Number(event.currentTarget.dataset.value) });
    }

    handleHeaderToggle() {
        this._prop({ showHeader: !this.showHeader });
    }

    handleCollapsibleToggle() {
        this._prop({ collapsible: !this.collapsible });
    }

    handleCollapsedDefaultToggle() {
        this._prop({ defaultCollapsed: !this.n.defaultCollapsed });
    }

    handleIconSearch(event) {
        this.iconSearch = event.target.value;
    }

    handleSelectIcon(event) {
        this._prop({ icon: event.currentTarget.dataset.icon });
    }

    handleClearIcon() {
        this._prop({ icon: null });
    }

    // page
    handlePageName(event) {
        this._prop({ name: event.target.value });
    }

    // repeater
    _repeatPatch(key, value) {
        this._emit('repeatchange', { patch: { [key]: value } });
    }

    handleRepeatStyle(event) {
        this._repeatPatch('style', event.currentTarget.dataset.value);
    }

    handleAddLabel(event) {
        this._repeatPatch('addLabel', event.target.value);
    }

    handleMin(event) {
        const v = event.target.value;
        this._repeatPatch('min', v === '' ? null : Math.max(0, Number(v)));
    }

    /** Legacy contract: 0 = unlimited. */
    handleMax(event) {
        const v = Number(event.target.value);
        this._repeatPatch('max', !v || v <= 0 ? null : v);
    }

    handleAddChildField(event) {
        const apiName = event.currentTarget.dataset.api;
        const field = (this.childFields || []).find(
            (f) => f.apiName === apiName
        );
        if (!field) {
            return;
        }
        const used = (this.n.elements || []).some(
            (el) => el.binding && el.binding.field === apiName
        );
        if (used) {
            return;
        }
        this._emit('addchildfield', { field: { ...field } });
    }

    // rules
    handleRuleChange(event) {
        this._prop({ visibility: event.detail.value });
    }

    handleValidationChange(event) {
        this._emit('validationchange', { entries: event.detail.entries });
    }
}
