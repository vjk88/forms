import { LightningElement, api, wire } from 'lwc';
import describeFields from '@salesforce/apex/FinalStudioController.describeFields';
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
            !this.isEmptySpace
        );
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
            emptySpace: 'Empty space'
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
