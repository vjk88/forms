import { LightningElement, api } from 'lwc';
import {
    shouldAdvanceOnKey,
    isMultilineTarget,
    resolveAdvanceOrigin
} from 'c/finalStepFlow';

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
// Screen-reader names for the faces (owner 2026-07-31): emoji scales show NO
// end labels, so each chip must SAY its sentiment — "3 of 5" alone is
// meaningless when the meaning lives in a picture you can't see.
const EMOJI_SENTIMENTS = [
    'Very unhappy',
    'Unhappy',
    'Neutral',
    'Happy',
    'Very happy'
];
const RATING_GLYPHS = { star: '★', heart: '♥', thumb: '👍' };
const SCALE_SIZES = [5, 7, 10];

export default class FinalElementRenderer extends LightningElement {
    @api element;

    /** Keyboard-advance must be decided HERE: past this shadow boundary LWS
     *  retargets keydown origins to this host, so a nav layout cannot tell
     *  an input Enter from a chip Enter (org QA 2026-08-01 — chip Enter
     *  advanced without selecting). Inside our own scope origins are still
     *  real elements (or decidable lightning-* hosts); when one qualifies we
     *  re-emit the semantic `advancekey`, and `advancefocus` mirrors the
     *  multiline state for the helper wording. Navs ignore raw keydown /
     *  focusin from this subtree (fromElementRenderer).
     *  Wired in connectedCallback, NOT the constructor — a constructor
     *  template listener registers in jsdom but never fires under
     *  production LWS (org probe 2026-08-01); the guard survives LWR
     *  reconnects without double-adding. */
    _advanceWired = false;

    connectedCallback() {
        if (this._advanceWired) {
            return;
        }
        this._advanceWired = true;
        this.template.addEventListener('keydown', (event) => {
            const origin = resolveAdvanceOrigin(
                event.composedPath ? event.composedPath() : [],
                event.target
            );
            if (shouldAdvanceOnKey(event, origin)) {
                this.dispatchEvent(
                    new CustomEvent('advancekey', {
                        bubbles: true,
                        composed: true
                    })
                );
            }
        });
        this.template.addEventListener('focusin', (event) => {
            const origin = resolveAdvanceOrigin(
                event.composedPath ? event.composedPath() : [],
                event.target
            );
            this.dispatchEvent(
                new CustomEvent('advancefocus', {
                    bubbles: true,
                    composed: true,
                    detail: { multiline: isMultilineTarget(origin) }
                })
            );
        });
    }

    /** Scale-family local selection. MUST be a DECLARED field — LWC only
     *  tracks declared fields; an expando assignment never repaints (the
     *  S2 "selection doesn't paint" bug). */
    _scaleValue;

    /** Choice-family local state (S3) — same declared-field law. */
    _choiceValue;
    _choiceValues;
    _otherOn = false;
    _otherText = '';

    /** S4 local state: ranking order (array of values), matrix picks
     *  (REASSIGNED map — mutation never repaints), drag source index. */
    _rankOrder;
    _matrixPicks;
    _dragIndex;

    /** Slider local state (same declared-field law): _sliderVal covers live
     *  drag + hosts that don't round-trip answers; _sliderSent remembers our
     *  own echo so an EXTERNAL el.value write (prefill, reset) wins over it. */
    _sliderVal;
    _sliderSent;

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
            value: o.value,
            // Card Deck parity (owner 2026-08-01) — the normalize was
            // silently dropping the per-option extras
            emoji: o.emoji,
            description: o.description
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

    /** lightning-checkbox-group REQUIRES an array value — undefined crashes
     *  the base component internally (value.indexOf) and takes the whole
     *  Aura page down with it (owner console screenshot, 2026-07-31). */
    get checkboxGroupValues() {
        return Array.isArray(this.el.value) ? this.el.value : [];
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

    /** Sanitized bounds: a half-typed or inverted authored config (min ≥ max,
     *  step ≤ 0, blanks) must degrade to a working control, never a frozen
     *  one. Guarantees max > min and step > 0. */
    get slider() {
        const s = this.cfg.slider || {};
        let min = Number(s.min);
        let max = Number(s.max);
        let step = Number(s.step);
        if (!Number.isFinite(min)) {
            min = 0;
        }
        if (!Number.isFinite(max)) {
            max = 100;
        }
        if (!Number.isFinite(step) || step <= 0) {
            step = 1;
        }
        if (max <= min) {
            max = min + step * 10;
        }
        return { min, max, step };
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
                this.isImageChoice ||
                this.isLikert ||
                this.isRanking ||
                this.isMatrix) &&
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
        if (this.isLikert) {
            const pts = this.likertPoints;
            return { min: pts[0].value, max: pts[pts.length - 1].value };
        }
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
                if (this.isEmojiScale) {
                    // big bare faces, not boxed chips (Card Deck treatment)
                    cls += ' emoji-chip';
                }
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
                ariaLabel: this.isEmojiScale
                    ? `${EMOJI_SENTIMENTS[v - min]}, ${v} of ${max}`
                    : this.isRating
                      ? `${v} of ${max}`
                      : String(v)
            });
        }
        return items;
    }

    /** el.value as a number, or null. Prefill and REST payloads legally send
     *  numerics as strings ("50") — coerce, don't typeof-gate. */
    get _sliderHydrated() {
        const raw = this.el.value;
        if (raw == null || raw === '' || isNaN(Number(raw))) {
            return null;
        }
        return Number(raw);
    }

    /** Slider live readout (Card Deck treatment). Resolution order: an
     *  external write that isn't our own echo (prefill, reset, rule write)
     *  wins; then the local drag value; then the hydrated answer; then the
     *  STEP-ALIGNED midpoint as a neutral resting display (an off-step
     *  midpoint would disagree with where the native thumb snaps). */
    get sliderValue() {
        const hydrated = this._sliderHydrated;
        if (hydrated != null && hydrated !== this._sliderSent) {
            return hydrated;
        }
        if (this._sliderVal != null) {
            return this._sliderVal;
        }
        if (hydrated != null) {
            return hydrated;
        }
        const s = this.slider;
        const mid = s.min + Math.round((s.max - s.min) / 2 / s.step) * s.step;
        return Math.min(s.max, mid);
    }

    /** Untouched + unanswered = the resting midpoint is a PREVIEW, not an
     *  answer (nothing dispatches until the user interacts) — the readout
     *  mutes itself so the UI never claims a value that would submit empty. */
    get sliderAnswered() {
        return this._sliderVal != null || this._sliderHydrated != null;
    }

    get sliderValClass() {
        return this.sliderAnswered ? 'slider-val' : 'slider-val idle';
    }

    get sliderValueDisplay() {
        const prefix = this.cfg.valuePrefix || '';
        const suffix = this.cfg.valueSuffix || '';
        return `${prefix}${this.sliderValue}${suffix}`;
    }

    /** End labels are aria-hidden visually-adjacent text; screen readers get
     *  their meaning through the control's accessible name instead
     *  ("Budget, 50 = Tight budget to 400 = No limit"). */
    get sliderAriaLabel() {
        const left = this.cfg.leftLabel;
        const right = this.cfg.rightLabel;
        const s = this.slider;
        if (!left && !right) {
            return this.el.label;
        }
        const lo = left ? `${s.min} = ${left}` : s.min;
        const hi = right ? `${s.max} = ${right}` : s.max;
        return `${this.el.label}, ${lo} to ${hi}`;
    }

    /** Feeds the track's filled-portion gradient (--sl-pct). */
    get sliderStyle() {
        const s = this.slider;
        const pct = ((this.sliderValue - s.min) / (s.max - s.min)) * 100;
        return `--sl-pct: ${Math.max(0, Math.min(100, pct))}%`;
    }

    /** Live drag: repaint the readout locally without spamming the host. */
    handleSliderInput(event) {
        this._sliderVal = Number(event.target.value);
    }

    /** Commit on release / keyboard step / track click. */
    handleSliderChange(event) {
        const v = Number(event.target.value);
        this._sliderVal = v;
        this._sliderSent = v;
        this.dispatchValue(v);
    }

    get hasEndLabels() {
        // Emoji scales never render end labels (owner 2026-07-31) — the faces
        // carry the meaning visually; screen readers get EMOJI_SENTIMENTS.
        if (this.isEmojiScale) {
            return false;
        }
        return Boolean(this.cfg.leftLabel || this.cfg.rightLabel);
    }

    /** Mirrors sliderAriaLabel: the end labels are aria-hidden visual text,
     *  so the radiogroup's accessible name carries their meaning instead
     *  ("Rating, 1 = Poor to 5 = Excellent"). */
    get scaleGroupAriaLabel() {
        if (!this.hasEndLabels) {
            return this.el.label;
        }
        const { min, max } = this.scaleBounds;
        const left = this.cfg.leftLabel;
        const right = this.cfg.rightLabel;
        const lo = left ? `${min} = ${left}` : min;
        const hi = right ? `${max} = ${right}` : max;
        return `${this.el.label}, ${lo} to ${hi}`;
    }

    // ---- S4: likert · ranking · matrix (the promoted trio) ----

    get isLikert() {
        return this.el.type === 'likert';
    }

    /** Likert points: authored config.points, else the classic agree-5. */
    get likertPoints() {
        const authored = this.cfg.points;
        if (Array.isArray(authored) && authored.length) {
            return authored;
        }
        return [
            { value: 1, label: 'Strongly disagree' },
            { value: 2, label: 'Disagree' },
            { value: 3, label: 'Neutral' },
            { value: 4, label: 'Agree' },
            { value: 5, label: 'Strongly agree' }
        ];
    }

    get likertItems() {
        const sel =
            this._scaleValue != null
                ? this._scaleValue
                : typeof this.el.value === 'number'
                  ? this.el.value
                  : null;
        return this.likertPoints.map((pt) => ({
            value: pt.value,
            display: pt.label,
            cls:
                sel === pt.value
                    ? 'choice-chip likert-chip selected'
                    : 'choice-chip likert-chip',
            ariaChecked: sel === pt.value ? 'true' : 'false',
            tabIndex:
                sel === pt.value ||
                (sel == null && pt.value === this.likertPoints[0].value)
                    ? '0'
                    : '-1'
        }));
    }

    handleLikertPick(event) {
        const v = Number(event.currentTarget.dataset.value);
        this._scaleValue = v;
        this.dispatchValue(v);
    }

    get isRanking() {
        return this.el.type === 'ranking';
    }

    /** Current order: local wins, else hydrated el.value (ordered values),
     *  else the authored option order. */
    get rankValues() {
        if (this._rankOrder) {
            return this._rankOrder;
        }
        if (Array.isArray(this.el.value) && this.el.value.length) {
            return this.el.value;
        }
        return (this.cfg.options || []).map((o) => o.value);
    }

    get rankRows() {
        const byValue = new Map(
            (this.cfg.options || []).map((o) => [
                o.value,
                o.label || '(untitled)'
            ])
        );
        const last = this.rankValues.length - 1;
        return this.rankValues.map((value, index) => ({
            value,
            label: byValue.get(value) || value,
            index,
            position: index + 1,
            upDisabled: index === 0,
            downDisabled: index === last,
            upLabel: `Move ${byValue.get(value) || value} up`,
            downLabel: `Move ${byValue.get(value) || value} down`
        }));
    }

    _commitRank(order) {
        this._rankOrder = order;
        this.dispatchValue(order);
    }

    handleRankMove(event) {
        const index = Number(event.currentTarget.dataset.index);
        const delta = Number(event.currentTarget.dataset.delta);
        const next = [...this.rankValues];
        const to = index + delta;
        if (to < 0 || to >= next.length) {
            return;
        }
        [next[index], next[to]] = [next[to], next[index]];
        this._commitRank(next);
        // keep focus on the moved row's same-direction button
        Promise.resolve().then(() => {
            const btn = this.template.querySelector(
                `button[data-index="${to}"][data-delta="${delta}"]`
            );
            if (btn && !btn.disabled) {
                btn.focus();
            }
        });
    }

    handleRankDragStart(event) {
        this._dragIndex = Number(event.currentTarget.dataset.index);
        event.dataTransfer.effectAllowed = 'move';
    }

    handleRankDragOver(event) {
        event.preventDefault(); // required: makes the row a drop target
        event.dataTransfer.dropEffect = 'move';
    }

    handleRankDrop(event) {
        event.preventDefault();
        const from = this._dragIndex;
        const to = Number(event.currentTarget.dataset.index);
        if (from == null || from === to) {
            return;
        }
        const next = [...this.rankValues];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        this._dragIndex = null;
        this._commitRank(next);
    }

    get isMatrix() {
        return this.el.type === 'matrix';
    }

    /** Matrix scale points: authored config.points, else agree-4. */
    get matrixPoints() {
        const authored = this.cfg.points;
        if (Array.isArray(authored) && authored.length) {
            return authored;
        }
        return [
            { value: 1, label: 'Disagree' },
            { value: 2, label: 'Neutral' },
            { value: 3, label: 'Agree' },
            { value: 4, label: 'Strongly agree' }
        ];
    }

    get matrixPicksMap() {
        if (this._matrixPicks) {
            return this._matrixPicks;
        }
        return this.el.value && typeof this.el.value === 'object'
            ? this.el.value
            : {};
    }

    /** rows × points, each cell pre-classed — the template stays dumb. */
    get matrixRows() {
        const picks = this.matrixPicksMap;
        return (this.cfg.rows || []).map((r) => ({
            key: r.value,
            label: r.label || '(untitled)',
            cells: this.matrixPoints.map((pt) => ({
                key: `${r.value}:${pt.value}`,
                row: r.value,
                value: pt.value,
                pointLabel: pt.label,
                aria: `${r.label || r.value} — ${pt.label}`,
                cls: picks[r.value] === pt.value ? 'mx-dot selected' : 'mx-dot',
                ariaChecked: picks[r.value] === pt.value ? 'true' : 'false'
            }))
        }));
    }

    get hasMatrixRows() {
        return (this.cfg.rows || []).length > 0;
    }

    handleMatrixPick(event) {
        const row = event.currentTarget.dataset.row;
        const value = Number(event.currentTarget.dataset.value);
        // REASSIGN (never mutate) — declared-field repaint law
        this._matrixPicks = { ...this.matrixPicksMap, [row]: value };
        this.dispatchValue(this._matrixPicks);
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
        // ranking: the PRESENTED order is already an answer — commit it once
        // so a respondent who agrees with it isn't blocked by required
        // (S4 gate finding #2)
        if (
            this.isRanking &&
            !this._rankOrder &&
            !Array.isArray(this.el.value) &&
            (this.cfg.options || []).length
        ) {
            this._commitRank(this.rankValues);
        }
    }

    get chipChoiceItems() {
        const sel = this.choiceSelectedSet;
        const base = this.isCardStyle ? 'choice-card' : 'choice-chip';
        const items = this.options.map((o) => ({
            value: o.value,
            display: o.label,
            description: o.description,
            // Card Deck parity (owner 2026-08-01): optional per-option emoji
            emoji: o.emoji,
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
            if (this._otherOn && !this.choiceIsMulti) {
                // single-select: Other REPLACES the previous pick — never two
                // lit chips with a blank answer (S4 gate finding #6)
                this._choiceValue = null;
            }
            if (!this._otherOn) {
                this._otherText = '';
            }
            this._dispatchChoice();
            if (this._otherOn) {
                Promise.resolve().then(() => {
                    const input = this.template.querySelector('.choice-other');
                    if (input) {
                        input.focus();
                    }
                });
            }
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

    get otherAriaLabel() {
        return `${this.el.label || 'This question'} — your own answer`;
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
            label: o.label || '(untitled)',
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

    /** `left` lays the field out as a row: label column + control (spec §4).
     *  CHIP-FAMILY questions opt out — a 0–10 row beside a side label can
     *  never fit; their labels stay on top (owner overflow report,
     *  2026-07-31). */
    get fieldClass() {
        let cls = 'field';
        if (this.el.labelPosition === 'left' && this.isField) {
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

    /** lightning radio/checkbox groups put the answer on detail.value. */
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
