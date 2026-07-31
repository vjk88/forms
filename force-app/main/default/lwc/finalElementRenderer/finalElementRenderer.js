import { LightningElement, api } from 'lwc';

/**
 * finalElementRenderer — one spec element.
 *
 * Types (schema §4 / BUILDER_SURFACES §1): `field` with Display-as variants
 * (renderAs: dropdown / radio / checkbox group / multi-select / toggle /
 * slider), plus the content roster — richText, image, callout, divider,
 * spacer, consent, emptySpace, file. Unknown types render the forward-compat
 * placeholder, never crash the form.
 *
 * Emits plain non-composed `valuechange` events — no bubbles/composed
 * (catalog §2). Consent is a boolean answer; its "acceptance required" is an
 * ordinary required validation entry (false fails required — engine §7).
 */

const INPUT_TYPES = {
    text: 'text',
    email: 'email',
    phone: 'tel',
    number: 'number',
    date: 'date',
    url: 'url',
    checkbox: 'checkbox'
};

const SPACER_HEIGHTS = { small: 12, medium: 28, large: 56 };

const IMAGE_SIZE_WIDTHS = {
    small: '160px',
    medium: '320px',
    large: '520px',
    full: '100%',
    fit: 'auto'
};

const CALLOUT_ICONS = {
    info: 'utility:info',
    success: 'utility:success',
    warning: 'utility:warning',
    error: 'utility:error'
};

// Survey scale family (SURVEY_PLAN §2.2, slice S2): one interaction grammar —
// an ordered row of ≥44px radio chips; selected = accent fill (catalog law).
const EMOJI_FACES = ['😠', '😕', '😐', '🙂', '😍'];
const RATING_GLYPHS = { star: '★', heart: '♥', thumb: '👍' };
const SCALE_SIZES = [5, 7, 10];

export default class FinalElementRenderer extends LightningElement {
    @api element;

    /** Scale-family local selection. MUST be a DECLARED field — LWC only
     *  tracks declared fields; an expando assignment never repaints (the
     *  S2 "selection doesn't paint" bug). */
    _scaleValue;

    /** Choice-family local state (S3) — same declared-field law. */
    _choiceValue;
    _choiceValues;
    _otherOn = false;
    _otherText = '';

    get el() {
        return this.element || {};
    }

    get cfg() {
        return this.el.config || {};
    }

    get isField() {
        return this.el.type === 'field';
    }

    /** Validation failures annotated by the viewer after a blocked advance
     *  or submit (`el.errors`) — rendered inline, themeable, live-updating. */
    get errors() {
        return this.el.errors || [];
    }

    get hasErrors() {
        return this.errors.length > 0;
    }

    // ---- Display-as variants (BUILDER_SURFACES §2: config.renderAs) ----

    get renderAs() {
        return this.cfg.renderAs || 'Default';
    }

    /** Options: custom rows win; else the describe options (picklists). */
    get options() {
        return (this.cfg.options || []).map((o) => ({
            label: o.label || o.value,
            value: o.value
        }));
    }

    get hasOptions() {
        return this.options.length > 0;
    }

    get isRadioGroup() {
        return (
            this.isField && this.renderAs === 'Radio_Buttons' && this.hasOptions
        );
    }

    get isCheckboxGroup() {
        return (
            this.isField &&
            (this.renderAs === 'Checkbox_Group' ||
                this.renderAs === 'Custom_MultiSelect') &&
            this.hasOptions
        );
    }

    get isDropdown() {
        return (
            this.isField &&
            this.hasOptions &&
            (this.renderAs === 'Dropdown' ||
                // picklists render as a dropdown by default — a text input
                // for a constrained field is a data-quality bug
                (this.renderAs === 'Default' &&
                    this.cfg.inputType === 'picklist'))
        );
    }

    get isToggle() {
        return (
            this.isField &&
            this.renderAs === 'Toggle' &&
            this.cfg.inputType === 'checkbox'
        );
    }

    get isSlider() {
        return this.isField && this.renderAs === 'Slider';
    }

    get slider() {
        const s = this.cfg.slider || {};
        return {
            min: s.min != null ? s.min : 0,
            max: s.max != null ? s.max : 100,
            step: s.step != null ? s.step : 1
        };
    }

    get isTextarea() {
        return (
            this.isField &&
            this.cfg.inputType === 'textarea' &&
            !this.isRadioGroup &&
            !this.isCheckboxGroup &&
            !this.isDropdown
        );
    }

    get isInput() {
        return (
            this.isField &&
            !this.isTextarea &&
            !this.isRadioGroup &&
            !this.isCheckboxGroup &&
            !this.isDropdown &&
            !this.isToggle &&
            !this.isSlider
        );
    }

    get inputType() {
        return INPUT_TYPES[this.cfg.inputType] || 'text';
    }

    // ---- content blocks (schema §4: binding null always) ----

    get isRichText() {
        return this.el.type === 'richText';
    }

    get isImage() {
        return this.el.type === 'image';
    }

    get isDivider() {
        return this.el.type === 'divider';
    }

    get isSpacer() {
        return this.el.type === 'spacer';
    }

    get isCallout() {
        return this.el.type === 'callout';
    }

    get isConsent() {
        return this.el.type === 'consent';
    }

    get isEmptySpace() {
        return this.el.type === 'emptySpace';
    }

    get isFile() {
        return this.el.type === 'file';
    }

    get hasRichText() {
        return Boolean(this.cfg.html);
    }

    get richTextHtml() {
        return this.cfg.html || '';
    }

    get hasImageSrc() {
        return Boolean(this.cfg.src);
    }

    get imageAlt() {
        return this.cfg.alt || '';
    }

    get imageStyle() {
        const w = IMAGE_SIZE_WIDTHS[this.cfg.size] || IMAGE_SIZE_WIDTHS.full;
        return w === 'auto' ? '' : `width: ${w}`;
    }

    get spacerStyle() {
        // size presets only (panel writer); the legacy raw-px `height`
        // tolerance was deleted 2026-07-18 (sweep DELETE ruling).
        const h = SPACER_HEIGHTS[this.cfg.size] || 28;
        return `height: ${h}px`;
    }

    get calloutClass() {
        const tone = CALLOUT_ICONS[this.cfg.variant]
            ? this.cfg.variant
            : 'info';
        return `block-callout tone-${tone}`;
    }

    get calloutIcon() {
        return CALLOUT_ICONS[this.cfg.variant] || CALLOUT_ICONS.info;
    }

    get hasCalloutHtml() {
        return Boolean(this.cfg.html);
    }

    get calloutHtml() {
        return this.cfg.html || '';
    }

    get hasConsentHtml() {
        return Boolean(this.cfg.html);
    }

    get consentHtml() {
        return this.cfg.html || '';
    }

    /**
     * We render our OWN label (themeable) and keep the native field
     * `label-hidden` — a shadow-DOM native label can't take --c-* colours, so
     * on dark themes it renders faint. (Technique from formStudio's
     * formSectionRenderer; the native keeps its assistive-text label for SR.)
     */
    get showCustomLabel() {
        return (
            (this.isField ||
                this.isScaleFamily ||
                this.isYesNo ||
                this.isImageChoice) &&
            this.el.labelPosition !== 'hidden' &&
            Boolean(this.el.label)
        );
    }

    /**
     * Per-question caption (owner round-4 ruling): `description` +
     * `descriptionDisplay` — 'caption' renders the always-visible muted line,
     * 'help' tucks it behind the ⓘ bubble. Empty renders nothing, never an
     * empty ⓘ.
     */
    get captionText() {
        return this.el.descriptionDisplay === 'help'
            ? undefined
            : this.el.description;
    }

    /** ⓘ content: authored help wins; else description-as-help. */
    get helpContent() {
        if (this.el.help) {
            return this.el.help;
        }
        return this.el.descriptionDisplay === 'help'
            ? this.el.description
            : undefined;
    }

    /** Help rides the visible helptext next to our label; else on the field. */
    get nativeHelp() {
        return this.showCustomLabel ? undefined : this.helpContent;
    }

    // ---- survey scale family (nps / rating / scale / emojiScale — S2) ----

    get isNps() {
        return this.el.type === 'nps';
    }

    get isRating() {
        return this.el.type === 'rating';
    }

    get isScale() {
        return this.el.type === 'scale';
    }

    get isEmojiScale() {
        return this.el.type === 'emojiScale';
    }

    get isScaleFamily() {
        return this.isNps || this.isRating || this.isScale || this.isEmojiScale;
    }

    /** NPS classic detractor coloring is an OPT-IN (ruling Q2); theme-accent
     *  is the default. */
    get npsClassic() {
        return this.isNps && this.cfg.coloring === 'classic';
    }

    /** Current selection: local pick wins, else a value the viewer rehydrated
     *  onto the element (matches the uncontrolled posture of native inputs). */
    get scaleValue() {
        if (this._scaleValue != null) {
            return this._scaleValue;
        }
        return typeof this.el.value === 'number' ? this.el.value : null;
    }

    get scaleBounds() {
        if (this.isNps) {
            return { min: 0, max: 10 };
        }
        if (this.isRating) {
            // segmented 5|10 (owner ruling Q1 — the 7 lives on `scale` only)
            return { min: 1, max: this.cfg.max === 10 ? 10 : 5 };
        }
        if (this.isScale) {
            const size = SCALE_SIZES.includes(this.cfg.size)
                ? this.cfg.size
                : 5;
            return { min: 1, max: size };
        }
        return { min: 1, max: 5 }; // emojiScale
    }

    get scaleItems() {
        const { min, max } = this.scaleBounds;
        const sel = this.scaleValue;
        const glyph = RATING_GLYPHS[this.cfg.icon] || RATING_GLYPHS.star;
        const items = [];
        for (let v = min; v <= max; v++) {
            const isSel = sel != null && v === sel;
            let cls;
            if (this.isRating) {
                cls =
                    sel != null && v <= sel
                        ? 'scale-icon filled'
                        : 'scale-icon';
            } else {
                cls = isSel ? 'scale-chip selected' : 'scale-chip';
                if (this.npsClassic) {
                    cls +=
                        v <= 6
                            ? ' nps-detractor'
                            : v <= 8
                              ? ' nps-passive'
                              : ' nps-promoter';
                }
            }
            items.push({
                value: v,
                display: this.isRating
                    ? glyph
                    : this.isEmojiScale
                      ? EMOJI_FACES[v - min]
                      : String(v),
                cls,
                ariaChecked: isSel ? 'true' : 'false',
                // roving tabindex: the selection (or the first chip) is the
                // one tab stop; arrows move within the group
                tabIndex: isSel || (sel == null && v === min) ? '0' : '-1',
                ariaLabel:
                    this.isRating || this.isEmojiScale
                        ? `${v} of ${max}`
                        : String(v)
            });
        }
        return items;
    }

    get hasEndLabels() {
        return Boolean(this.cfg.leftLabel || this.cfg.rightLabel);
    }

    // ---- choice family (S3: yesNo · imageChoice · chips/cards optionStyle) ----

    get isYesNo() {
        return this.el.type === 'yesNo';
    }

    get isImageChoice() {
        return this.el.type === 'imageChoice';
    }

    /** field + options + optionStyle chips|cards → our presentation takes
     *  over from the lightning radio/checkbox groups. */
    get isChipChoice() {
        return (
            this.isField &&
            this.hasOptions &&
            (this.cfg.optionStyle === 'chips' ||
                this.cfg.optionStyle === 'cards')
        );
    }

    get isCardStyle() {
        return this.cfg.optionStyle === 'cards';
    }

    /** Multi-select comes from the renderAs the choice was authored with. */
    get choiceIsMulti() {
        return (
            this.renderAs === 'Checkbox_Group' ||
            this.renderAs === 'Custom_MultiSelect' ||
            (this.isImageChoice && Boolean(this.cfg.multiple))
        );
    }

    get choiceSelectedSet() {
        if (this.choiceIsMulti) {
            const local = this._choiceValues;
            const fromEl = Array.isArray(this.el.value) ? this.el.value : [];
            return new Set(local || fromEl);
        }
        const single =
            this._choiceValue != null
                ? this._choiceValue
                : typeof this.el.value === 'string'
                  ? this.el.value
                  : null;
        return new Set(single != null ? [single] : []);
    }

    get yesNoItems() {
        const sel = this.choiceSelectedSet;
        const yes = this.cfg.yesLabel || 'Yes';
        const no = this.cfg.noLabel || 'No';
        return [
            {
                value: 'true',
                display: yes,
                cls: sel.has('true') ? 'yn-btn selected' : 'yn-btn',
                ariaChecked: sel.has('true') ? 'true' : 'false'
            },
            {
                value: 'false',
                display: no,
                cls: sel.has('false') ? 'yn-btn selected' : 'yn-btn',
                ariaChecked: sel.has('false') ? 'true' : 'false'
            }
        ];
    }

    handleYesNo(event) {
        const v = event.currentTarget.dataset.value;
        this._choiceValue = v;
        this.dispatchValue(v === 'true');
    }

    /** yesNo hydration: el.value is a BOOLEAN for this type. */
    get yesNoHydrated() {
        return typeof this.el.value === 'boolean'
            ? String(this.el.value)
            : null;
    }

    renderedCallback() {
        // one-time yesNo rehydrate (boolean value → string chip key)
        if (
            this.isYesNo &&
            this._choiceValue == null &&
            this.yesNoHydrated != null
        ) {
            this._choiceValue = this.yesNoHydrated;
        }
    }

    get chipChoiceItems() {
        const sel = this.choiceSelectedSet;
        const base = this.isCardStyle ? 'choice-card' : 'choice-chip';
        const items = this.options.map((o) => ({
            value: o.value,
            display: o.label,
            description: o.description,
            cls: sel.has(o.value) ? `${base} selected` : base,
            ariaChecked: sel.has(o.value) ? 'true' : 'false'
        }));
        if (this.cfg.allowOther) {
            items.push({
                value: '__other__',
                display: 'Other…',
                cls: this._otherOn ? `${base} selected` : base,
                ariaChecked: this._otherOn ? 'true' : 'false'
            });
        }
        return items;
    }

    get showOtherInput() {
        return this._otherOn;
    }

    handleChipChoice(event) {
        const v = event.currentTarget.dataset.value;
        if (v === '__other__') {
            this._otherOn = !this._otherOn;
            if (!this._otherOn) {
                this._otherText = '';
            }
            this._dispatchChoice();
            return;
        }
        if (this.choiceIsMulti) {
            const next = new Set(this.choiceSelectedSet);
            if (next.has(v)) {
                next.delete(v);
            } else {
                next.add(v);
            }
            this._choiceValues = [...next];
        } else {
            this._choiceValue = v;
            this._otherOn = false;
            this._otherText = '';
        }
        this._dispatchChoice();
    }

    handleOtherText(event) {
        this._otherText = event.target.value;
        this._dispatchChoice();
    }

    /** Single: the option value (or the typed Other text). Multi: the list
     *  (+ Other text appended when present). */
    _dispatchChoice() {
        if (this.choiceIsMulti) {
            const values = [...(this._choiceValues || [])];
            if (this._otherOn && this._otherText.trim()) {
                values.push(this._otherText.trim());
            }
            this.dispatchValue(values);
            return;
        }
        if (this._otherOn) {
            this.dispatchValue(this._otherText.trim());
            return;
        }
        this.dispatchValue(this._choiceValue);
    }

    /** imageChoice tiles: authored options carry {value, label, url}. */
    get imageTiles() {
        const sel = this.choiceSelectedSet;
        return (this.cfg.options || []).map((o) => ({
            value: o.value,
            label: o.label || o.value,
            url: o.url,
            hasImage: Boolean(o.url),
            cls: sel.has(o.value) ? 'ic-tile selected' : 'ic-tile',
            ariaChecked: sel.has(o.value) ? 'true' : 'false'
        }));
    }

    get hasImageTiles() {
        return (this.cfg.options || []).length > 0;
    }

    handleImagePick(event) {
        const v = event.currentTarget.dataset.value;
        if (this.choiceIsMulti) {
            const next = new Set(this.choiceSelectedSet);
            if (next.has(v)) {
                next.delete(v);
            } else {
                next.add(v);
            }
            this._choiceValues = [...next];
            this.dispatchValue([...next]);
        } else {
            this._choiceValue = v;
            this.dispatchValue(v);
        }
    }

    handleScalePick(event) {
        const v = Number(event.currentTarget.dataset.value);
        this._scaleValue = v;
        this.dispatchValue(v);
    }

    handleScaleKey(event) {
        const keys = [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Home',
            'End'
        ];
        if (!keys.includes(event.key)) {
            return;
        }
        event.preventDefault();
        const { min, max } = this.scaleBounds;
        const cur = this.scaleValue;
        let next;
        if (event.key === 'Home') {
            next = min;
        } else if (event.key === 'End') {
            next = max;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            next = cur == null ? min : Math.max(min, cur - 1);
        } else {
            next = cur == null ? min : Math.min(max, cur + 1);
        }
        this._scaleValue = next;
        this.dispatchValue(next);
        // move focus with the selection (radiogroup arrow-key contract)
        Promise.resolve().then(() => {
            const btn = this.template.querySelector(
                `button[data-value="${next}"]`
            );
            if (btn) {
                btn.focus();
            }
        });
    }

    /** `left` lays the field out as a row: label column + control (spec §4). */
    get fieldClass() {
        let cls = 'field';
        if (this.el.labelPosition === 'left') {
            cls += ' label-left';
        }
        if (this.isTextarea) {
            cls += ' field-textarea';
        }
        if (this.hasErrors) {
            cls += ' has-errors';
        }
        return cls;
    }

    /** labelStyle: default | uppercase | muted (catalog §1). */
    get labelClass() {
        const style = this.el.labelStyle;
        if (style === 'uppercase' || style === 'muted') {
            return `field-label label-${style}`;
        }
        return 'field-label';
    }

    /**
     * The custom label can't reach the native input across shadow roots with
     * `for` — forward the click instead (checkboxes toggle, everything else
     * just focuses).
     */
    handleLabelClick() {
        const target = this.template.querySelector(
            'lightning-input, lightning-textarea, lightning-combobox, lightning-radio-group, lightning-checkbox-group, lightning-slider'
        );
        if (!target) {
            return;
        }
        target.focus();
        if (this.inputType === 'checkbox' && this.isInput) {
            target.checked = !target.checked;
            this.dispatchValue(target.checked);
        }
    }

    handleChange(event) {
        // A checkbox's state lives in `checked`; `value` is a constant string.
        const t = event.target;
        this.dispatchValue(t.type === 'checkbox' ? t.checked : t.value);
    }

    /** Toggles + consent checkboxes answer with the boolean. */
    handleCheckedChange(event) {
        this.dispatchValue(event.target.checked);
    }

    /** lightning-slider / groups put the answer on detail.value. */
    handleDetailChange(event) {
        this.dispatchValue(event.detail.value);
    }

    dispatchValue(value) {
        this.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: this.el.id, value }
            })
        );
    }
}
