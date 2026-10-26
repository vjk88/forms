import { LightningElement, api, track } from 'lwc';
import LightningConfirm from 'lightning/confirm';
import listFonts from '@salesforce/apex/FinalFontController.listFonts';
import listCustomThemes from '@salesforce/apex/FinalThemeController.listCustomThemes';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import { resolveTokens, resolveFontRefs, MESH_SEEDS } from 'c/finalThemeEngine';
import {
    pairingOptions,
    pairingPatch,
    applyFontPatch,
    refsLabel,
    levelHasFonts,
    allFontNames
} from 'c/finalFontChoices';
import {
    getBuiltinTheme,
    listBuiltinThemes,
    listThemeFamilies
} from 'c/finalThemeCatalog';
import { localizeAssetUrl } from 'c/finalThemeAssets';
import {
    getLayout,
    layoutAfterSwitch,
    settleStartWidth
} from 'c/finalLayoutRegistry';
import { layoutCardName } from 'c/finalGalleryPicker';
import {
    DESIGN_SECTIONS,
    flattenControls,
    getAt,
    setAt,
    deleteAt
} from 'c/finalDesignRegistry';

/**
 * finalDesignPanel — Design mode (FORM_STUDIO_IA §5–§7).
 *
 * Simple/Advanced is a LENS, never a fork: both project the ONE registry
 * (c/finalDesignRegistry) onto the same spec, so switching modes never changes
 * a value. Themed controls write sparse deltas at spec.theme.overrides —
 * presence IS the edited state; reset deletes. Setting a control back to the
 * theme's own default also deletes (no phantom "edited" dots).
 *
 * Ownership: the HOST owns the spec. The panel works on a deep copy and emits
 * `specchange` { spec } after every mutation; the host echoes it back down and
 * into the live preview (finalFormViewer.spec, preserveNav).
 */
export default class FinalDesignPanel extends LightningElement {
    /** Parent Form__c id — forwarded to image uploads (public/private decision). */
    @api formId;

    @track advanced = false;
    @track activeAreaKey = 'brand';
    @track pendingThemeKey = null;
    /** 'theme' | 'layout' | null — which gallery popup is open. */
    @track galleryMode = null;
    @track _fonts = [];
    // false until listFonts answers: a form's uploaded font must not read as
    // "removed from Setup" while the list is still on its way
    _fontsLoaded = false;
    @track _customThemes = [];
    @track _customProps = null;
    _customPropsId = null;
    _spec = {};
    _toolbarSignature;
    _pendingControlFocus;
    focusedControlKey;
    expandedGroups = {};

    /** UI-only bridge to the shell; never enters the form spec or history. */
    renderedCallback() {
        const signature = JSON.stringify(this.toolbarState);
        if (signature !== this._toolbarSignature) {
            this._toolbarSignature = signature;
            this.dispatchEvent(
                new CustomEvent('toolbarstate', {
                    detail: JSON.parse(signature)
                })
            );
        }
        this._focusPendingControl();
    }

    get toolbarState() {
        if (!this.advanced) return { advanced: false };
        const controls = this.controlsVM;
        const byKey = new Map(
            controls.map((control) => [control.key, control])
        );
        const searchEntries = [];
        const colorGroups = [];
        for (const section of DESIGN_SECTIONS) {
            for (const group of section.groups) {
                const colors = [];
                for (const key of group.controls) {
                    const entry = this._controlDef(key);
                    const c = entry.control;
                    const reason = this._unavailableReason(entry);
                    searchEntries.push({
                        key,
                        label: c.label,
                        section: section.key,
                        group: group.key,
                        path: `${section.label} › ${group.label}`,
                        hint: c.hint || '',
                        // the font picker builds its choices (pairings and
                        // the fonts in them), so search reads those
                        choices: [
                            ...(
                                (c.type === 'fontPicker'
                                    ? byKey.get(key)?.options
                                    : c.options) || []
                            ).map((option) => option.label),
                            // and every family, so "Montserrat" finds it too
                            ...(c.type === 'fontPicker' ? allFontNames() : [])
                        ].join(' '),
                        available: !reason,
                        reason
                    });
                    const vm = byKey.get(key);
                    if (
                        vm &&
                        (vm.isColor || vm.isGradientSurface || vm.isMeshColors)
                    )
                        colors.push(vm);
                }
                if (colors.length)
                    colorGroups.push({
                        key: `${section.key}-${group.key}`,
                        label: `${section.label} › ${group.label}`,
                        controls: colors
                    });
            }
        }
        return {
            advanced: this.advanced,
            font: byKey.get('typography'),
            colorGroups,
            searchEntries
        };
    }

    @api
    applyToolbarChange(change) {
        if (!this.advanced || !change) return false;
        const entry = this._controlDef(change.key);
        if (!entry || this._unavailableReason(entry)) return false;
        const c = entry.control;
        const target = {
            dataset: { key: c.key, idx: change.idx },
            value: change.value
        };
        if (change.kind === 'font' && c.key === 'typography') {
            const options =
                this.controlsVM.find((vm) => vm.key === c.key)?.options || [];
            if (!options.some((option) => option.value === change.value))
                return false;
            const patch = pairingPatch(change.value, {
                uploadedFonts: this._fonts
            });
            if (!patch) return false;
            this._applyFontPatch(patch);
        } else if (change.kind === 'color' && c.type === 'color') {
            this.handleColor({ target, detail: { value: change.value } });
        } else if (change.kind === 'preset' && c.presets) {
            if (!c.presets.some((p) => p.value === change.value)) return false;
            this.handlePresetPick({ detail: { value: change.value } });
        } else if (change.kind === 'gradient' && c.type === 'gradientSurface') {
            this.handleGradientSurface({
                target,
                detail: { solid: change.solid, gradient: change.gradient }
            });
        } else if (change.kind === 'mesh' && c.type === 'meshColors') {
            const index = Number(change.idx);
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= this._meshColorRows(this._effective(c)).length
            )
                return false;
            this.handleMeshColor({ target, detail: { value: change.value } });
        } else if (
            change.kind === 'reset' &&
            ['color', 'gradientSurface', 'meshColors'].includes(c.type)
        ) {
            const overrides = this._ensureOverrides();
            deleteAt(overrides, c.themePath);
            if (c.gradientPath) deleteAt(overrides, c.gradientPath);
            if (c.type === 'meshColors')
                deleteAt(overrides, this._controlDef('mesh').control.themePath);
            this._syncInkMode();
            this._spec = { ...this._spec };
            this._emit();
        } else return false;
        return true;
    }

    @api
    revealControl(key) {
        const entry = this._controlDef(key);
        if (!entry || this._unavailableReason(entry)) return false;
        const section = DESIGN_SECTIONS.find((s) =>
            s.groups.some((g) => g.controls.includes(key))
        );
        const group = section.groups.find((g) => g.controls.includes(key));
        this.advanced = true;
        this.activeAreaKey = section.key;
        this.expandedGroups = {
            ...this.expandedGroups,
            [`${section.key}:${group.key}`]: true
        };
        this.focusedControlKey = key;
        this._pendingControlFocus = key;
        // Also covers selecting an already-open result with no reactive change.
        Promise.resolve().then(() => {
            if (this.isConnected) this._focusPendingControl();
        });
        return true;
    }

    _focusPendingControl() {
        if (!this._pendingControlFocus) return;
        const wrapper = [
            ...this.template.querySelectorAll('[data-control]')
        ].find((node) => node.dataset.control === this._pendingControlFocus);
        if (!wrapper) return;
        this._pendingControlFocus = null;
        const disclosure = wrapper.querySelector('details');
        if (disclosure) disclosure.open = true;
        wrapper.scrollIntoView?.({ block: 'nearest' });
        const input = wrapper.querySelector(
            'input, select, textarea, lightning-input-rich-text, c-final-color-control, c-final-gradient-control, c-final-image-uploader, c-final-font-picker'
        );
        if (input?.focus) input.focus();
        else wrapper.focus();
    }

    handleGroupToggle(event) {
        const { area, disclosureGroup: group } = event.currentTarget.dataset;
        const key = `${area}:${group}`;
        const open = event.currentTarget.open;
        if (this.expandedGroups[key] !== open)
            this.expandedGroups = { ...this.expandedGroups, [key]: open };
    }

    connectedCallback() {
        // imperative (cacheable) — custom Form_Font__mdt entries for the picker
        listFonts()
            .then((fonts) => {
                this._fonts = fonts || [];
                this._fontsLoaded = true;
            })
            .catch(() => {
                this._fonts = [];
            });
        this.refreshThemes();
    }

    /** Re-list custom themes (host calls this after the editor saves). */
    @api
    refreshThemes() {
        return listCustomThemes()
            .then((themes) => {
                this._customThemes = themes || [];
            })
            .catch(() => {
                this._customThemes = [];
            });
    }

    _loadCustomProps(themeId) {
        if (this._customPropsId === themeId && this._customProps) {
            return;
        }
        this._customPropsId = themeId;
        this._customProps = null;
        getCustomTheme({ themeId })
            .then((json) => {
                if (this._customPropsId === themeId) {
                    this._customProps = JSON.parse(json);
                }
            })
            .catch(() => {
                if (this._customPropsId === themeId) {
                    this._customProps = {};
                }
            });
    }

    @api
    get spec() {
        return this._spec;
    }
    set spec(value) {
        this._spec = value ? JSON.parse(JSON.stringify(value)) : {};
        if (
            this._spec.theme &&
            this._spec.theme.source === 'custom' &&
            this._spec.theme.name
        ) {
            this._loadCustomProps(this._spec.theme.name);
        }
    }

    // ----------------------------------------------------------------- state

    get themeKey() {
        return (this._spec.theme && this._spec.theme.name) || '';
    }

    get themeSource() {
        return (this._spec.theme && this._spec.theme.source) || 'builtin';
    }

    get themeProps() {
        if (this.themeSource === 'custom') {
            return this._customProps; // null while loading — VMs degrade to fallbacks
        }
        return getBuiltinTheme(this.themeKey);
    }

    get overrides() {
        return (this._spec.theme && this._spec.theme.overrides) || {};
    }

    get tokens() {
        return resolveTokens(this.themeProps, this.overrides);
    }

    get layoutType() {
        return (this._spec.layout && this._spec.layout.type) || 'scroll';
    }

    get layoutInfo() {
        return getLayout(this.layoutType);
    }

    get currentPaneFlow() {
        const o = (this._spec.layout && this._spec.layout.options) || {};
        return o.paneFlow || '';
    }

    get ownsAdvance() {
        return Boolean(
            this.layoutInfo.ownsAdvance ||
            (this.layoutInfo.ownsHeader &&
                this.currentPaneFlow === 'oneAtATime')
        );
    }

    _controlDef(key) {
        return flattenControls().find((c) => c.control.key === key);
    }

    get formType() {
        return (this._spec.form && this._spec.form.type) || 'form';
    }

    /** ALL present gate keys must pass (AND) — lets a control combine a
     *  form-type gate with a layout gate (first user: survey paging). */
    _applies(entry) {
        const gate =
            (entry && entry.appliesTo) ||
            (entry && entry.control && entry.control.appliesTo);
        if (!gate) {
            return true;
        }
        if (gate.layouts && !gate.layouts.includes(this.layoutType)) {
            return false;
        }
        if (gate.notLayouts && gate.notLayouts.includes(this.layoutType)) {
            return false;
        }
        if (gate.paginated && !this.layoutInfo.paginates) {
            return false;
        }
        if (gate.ownsAdvance && !this.ownsAdvance) {
            return false;
        }
        if (gate.sharedNext && this.ownsAdvance) {
            return false;
        }
        if (gate.formTypes && !gate.formTypes.includes(this.formType)) {
            return false;
        }
        if (gate.notFormTypes && gate.notFormTypes.includes(this.formType)) {
            return false;
        }
        return true;
    }

    /** Effective value: override → theme default → spec content → fallback. */
    _effective(control) {
        if (control.themePath) {
            const ov = getAt(this.overrides, control.themePath);
            if (ov !== undefined) {
                return ov;
            }
            const tv = getAt(this.themeProps, control.themePath);
            if (tv !== undefined) {
                return tv;
            }
            return control.fallback;
        }
        const sv = getAt(this._spec, control.path);
        return sv === undefined ? control.fallback : sv;
    }

    _isEdited(control) {
        if (control.dynamicOptions === 'fonts') {
            return this._formHasFonts();
        }
        return (
            Boolean(control.themePath) &&
            getAt(this.overrides, control.themePath) !== undefined
        );
    }

    // A font setting at the form level that does something (an empty or
    // broken `fonts` does not light the dot) — see levelHasFonts.
    _formHasFonts() {
        return levelHasFonts(this._fontLevel());
    }

    _fontLevel() {
        const level = {};
        ['fonts', 'typography', 'customFont'].forEach((k) => {
            const v = getAt(this.overrides, k);
            if (v !== undefined) level[k] = v;
        });
        return level;
    }

    _applyFontPatch(patch) {
        applyFontPatch(this._ensureOverrides(), patch);
        this._spec = { ...this._spec };
        this._emit();
    }

    handleFontChange(event) {
        this._applyFontPatch(event.detail && event.detail.patch);
    }

    _hasPageImage() {
        const def = this._controlDef('pageImage');
        return Boolean(def && this._effective(def.control));
    }

    _gateReason(gate) {
        if (!gate || this._applies({ appliesTo: gate })) return '';
        const names = (layouts) =>
            layouts
                .map(
                    (key) =>
                        layoutCardName(key, '') || getLayout(key)?.label || key
                )
                .join(' / ');
        if (gate.layouts && !gate.layouts.includes(this.layoutType))
            return `Available with ${names(gate.layouts)}.`;
        if (gate.notLayouts?.includes(this.layoutType))
            return `Not available with ${names([this.layoutType])}.`;
        if (gate.formTypes && !gate.formTypes.includes(this.formType))
            return `Available for ${gate.formTypes.join(' / ')} forms.`;
        if (gate.notFormTypes?.includes(this.formType))
            return `Not available for ${this.formType} forms.`;
        if (gate.paginated && !this.layoutInfo.paginates)
            return 'Choose a paginated layout first.';
        if (gate.ownsAdvance && !this.ownsAdvance)
            return 'Available with One at a Time or conversational Split Hero.';
        return 'Available when the layout uses shared Next / Back navigation.';
    }

    /** Shared by rendering and search so hidden settings cannot be edited by shortcuts. */
    _unavailableReason(entry) {
        const c = entry.control;
        const gate =
            this._gateReason(entry.groupAppliesTo) ||
            this._gateReason(c.appliesTo);
        if (gate) return gate;
        if (c.needsImage && !this._hasPageImage())
            return 'Add a page background image first.';
        for (const key of [c.needsEffect, c.needsValueOf].filter(Boolean)) {
            const dependency = this._controlDef(key)?.control;
            if (!dependency || !this._effective(dependency))
                return `Set ${dependency?.label || key} first.`;
        }
        for (const condition of c.needsValue || []) {
            const dependency = this._controlDef(condition.key)?.control;
            if (!dependency) return 'Required setting is unavailable.';
            const current = this._effective(dependency);
            const notEqual = condition.notEquals !== undefined;
            const expected = notEqual ? condition.notEquals : condition.equals;
            if (notEqual ? current === expected : current !== expected) {
                const label =
                    dependency.options?.find(
                        (option) => option.value === expected
                    )?.label ??
                    (expected === true
                        ? 'On'
                        : expected === false
                          ? 'Off'
                          : expected === ''
                            ? 'empty'
                            : String(expected));
                return notEqual
                    ? `${dependency.label} must not be ${label}.`
                    : `Set ${dependency.label} to ${label} first.`;
            }
        }
        return '';
    }

    // ----------------------------------------------------------- view models

    get controlsVM() {
        return this._buildControls(flattenControls());
    }

    _buildControls(entries) {
        const tokens = this.tokens;
        const out = [];
        for (const entry of entries) {
            const c = entry.control;
            if (this._unavailableReason(entry)) continue;
            const value = this._effective(c);
            const vm = {
                key: c.key,
                label: c.label,
                area: entry.area,
                group: entry.group,
                simple: Boolean(c.simple),
                edited: this._isEdited(c),
                isColor: c.type === 'color',
                isSelect: c.type === 'select',
                isToggle: c.type === 'toggle',
                isText: c.type === 'text',
                isRange: c.type === 'range',
                isImage: c.type === 'image',
                isGradientSurface: c.type === 'gradientSurface',
                isMeshColors: c.type === 'meshColors',
                isTiles: c.type === 'tiles',
                isRichText: c.type === 'richtext',
                isNumber: c.type === 'number',
                isFontPicker: c.type === 'fontPicker',
                placeholder: c.placeholder || '',
                // registry-authored helper line (the glass select's derived
                // hint overwrites this below — it stays the more specific one)
                hint: c.hint || '',
                min: c.min,
                max: c.max
            };
            if (c.type === 'color') {
                vm.value = typeof value === 'string' ? value : '';
                // derived-by-default colors (e.g. label ink): show the LIVE
                // resolved token so the swatch never lies while unset
                if (!vm.value && c.fallbackToken) {
                    vm.value = tokens[c.fallbackToken] || '';
                }
                vm.contrastWith = c.contrastToken
                    ? tokens[c.contrastToken]
                    : undefined;
                vm.subject = c.subject;
                if (c.presets) {
                    vm.presets = c.presets;
                    // judged against the card as painted: a frosted (rgba)
                    // card over its page, never the raw token
                    vm.presetBackground = cardColor(tokens);
                }
            } else if (c.type === 'gradientSurface') {
                vm.value = typeof value === 'string' ? value : '';
                const g = getAt(this.overrides, c.gradientPath);
                vm.gradient =
                    g !== undefined
                        ? g
                        : getAt(this.themeProps, c.gradientPath);
                vm.edited =
                    vm.edited ||
                    getAt(this.overrides, c.gradientPath) !== undefined;
            } else if (c.type === 'meshColors') {
                vm.colors = this._meshColorRows(value);
            } else if (c.type === 'tiles') {
                const current = value || c.fallback;
                vm.tiles = c.options.map((o) => ({
                    ...o,
                    cls: o.value === current ? 'as-tile on' : 'as-tile'
                }));
            } else if (c.type === 'richtext') {
                vm.value = typeof value === 'string' ? value : '';
                vm.summary = this._richTextSummary(vm.value);
            } else if (c.type === 'number') {
                vm.value = value === undefined || value === null ? '' : value;
            } else if (c.type === 'select') {
                let current =
                    value === null || value === undefined ? '' : String(value);
                // legacy value forms (glass: true/false) display as their
                // mapped option so the select never shows a lie
                if (c.valueMap && current in c.valueMap) {
                    current = c.valueMap[current];
                }
                if (c.key === 'glass') {
                    vm.hint = this._glassHint(current);
                }
                vm.options = c.options.map((o) => ({
                    ...o,
                    selected: o.value === current
                }));
            } else if (c.type === 'fontPicker') {
                // form level vs theme: "From theme" names the theme's fonts
                const level = this._fontLevel();
                vm.fontLevel = level;
                vm.fontEffective = resolveFontRefs(this.themeProps, level);
                vm.fontInherit = refsLabel(
                    resolveFontRefs(this.themeProps, null)
                );
                vm.uploadedFonts = this._fonts;
                vm.fontsLoaded = this._fontsLoaded;
                // the toolbar's dropdown: the same choices, flat
                vm.options = pairingOptions({
                    level,
                    uploadedFonts: this._fonts,
                    allowInherit: true,
                    inheritLabel: vm.fontInherit,
                    fontsLoaded: this._fontsLoaded
                }).flat;
            } else if (c.type === 'toggle') {
                // _effective already applied theme default + fallback
                vm.checked = Boolean(value);
            } else if (c.type === 'image') {
                // display only: the thumbnail needs this org's real photo
                // address; what gets saved still comes from the uploader
                vm.value = localizeAssetUrl(value) || null;
                vm.versionId = c.versionPath
                    ? c.themePath
                        ? getAt(this.overrides, c.versionPath)
                        : getAt(this._spec, c.versionPath)
                    : null;
            } else {
                vm.value = value === undefined || value === null ? '' : value;
            }
            out.push(vm);
        }
        return out;
    }

    /** Five task sections, using the same values and gates as Simple. */
    get advancedSections() {
        const all = this.controlsVM;
        return DESIGN_SECTIONS.map((section) => {
            const groups = section.groups
                .map((group) => {
                    const controls = group.controls
                        .map((key) => all.find((c) => c.key === key))
                        .filter(Boolean)
                        .map((control) => ({
                            ...control,
                            wrapperClass:
                                control.key === this.focusedControlKey
                                    ? 'control-target control-target--focused'
                                    : 'control-target'
                        }));
                    return {
                        ...group,
                        controls,
                        edited: controls.some((c) => c.edited)
                    };
                })
                .filter((group) => group.controls.length);
            return {
                ...section,
                open: section.key === this.activeAreaKey,
                bodyId: `design-${section.key}`,
                summary: this._sectionSummary(section.key),
                groups: groups.map((group, index) => ({
                    ...group,
                    open:
                        this.expandedGroups[`${section.key}:${group.key}`] ??
                        index === 0
                }))
            };
        });
    }

    _sectionSummary(key) {
        switch (key) {
            case 'brand':
                return this.themeLabel;
            case 'page':
                return this.layoutLabel;
            case 'fields':
                return 'Fields, labels and section appearance';
            case 'navigation':
                return `${this.layoutLabel} · ${this.submitSummary}`;
            case 'completion':
                return this.completionSummary;
            default:
                return '';
        }
    }

    get simpleVM() {
        const all = this.controlsVM;
        const pick = (key) => all.find((c) => c.key === key);
        return {
            accent: pick('accent'),
            logo: pick('logo'),
            title: pick('title'),
            description: pick('description'),
            labels: ['backLabel', 'nextLabel', 'advanceLabel', 'submitLabel']
                .map(pick)
                .filter(Boolean),
            asTitle: pick('asTitle'),
            asMessage: pick('asMessage')
        };
    }

    /** Display-only line under a collapsed rich-text control: up to 80
     *  characters of its plain text, `Not set` when there is none, and
     *  `Contains an image` when the only content is an image. It is computed
     *  from the stored HTML and never written back to the spec. */
    _richTextSummary(html) {
        const doc = new DOMParser().parseFromString(html || '', 'text/html');
        const text = doc.body.textContent.replace(/\s+/g, ' ').trim();
        if (!text) {
            return doc.body.querySelector('img')
                ? 'Contains an image'
                : 'Not set';
        }
        return text.length > 80 ? `${text.slice(0, 80).trimEnd()}…` : text;
    }

    get contentSummary() {
        const title = getAt(this._spec, 'header.title') || '';
        // Read text only; the stored rich text is never rewritten by a mode switch.
        const doc = new DOMParser().parseFromString(title, 'text/html');
        return doc.body.textContent.trim() || 'Logo, title and description';
    }

    get submitSummary() {
        return getAt(this._spec, 'submit.label') || 'Submit';
    }

    get completionSummary() {
        return this.isToastCompletion ? 'Toast & go' : 'Confirmation screen';
    }

    get isToastCompletion() {
        return getAt(this._spec, 'settings.completion.mode') === 'toast';
    }

    get simpleSelected() {
        return !this.advanced;
    }

    /** Composite theme identity — the same 'key' | 'custom:<id>' form the
     *  gallery emits, so switch/no-op comparisons never cross forms. */
    get themeValue() {
        return this.themeSource === 'custom'
            ? `custom:${this.themeKey}`
            : this.themeKey;
    }

    get themeLabel() {
        if (this.themeSource === 'custom') {
            const t = this._customThemes.find((x) => x.id === this.themeKey);
            return t ? `${t.name} · custom` : 'Custom theme';
        }
        const t = listBuiltinThemes().find((x) => x.key === this.themeKey);
        if (!t) {
            return this.themeKey || '—';
        }
        // a form can stay on a theme the gallery no longer offers (catalog cut)
        if (t.hidden) {
            return `${t.name} · no longer in the gallery`;
        }
        // the family it was picked from ("Scenic · Misty Pines"); a family
        // with one look is just its name
        const family = listThemeFamilies().find((f) =>
            f.members.some((m) => m.key === t.key)
        );
        return family && family.members.length > 1
            ? `${family.name} · ${t.name}`
            : t.name;
    }

    get layoutLabel() {
        // one vocabulary: the row echoes the gallery card the user clicked,
        // never the registry's internal label ("Wizard steps" vs "Stepper")
        return (
            layoutCardName(this.layoutType, this.currentPaneFlow) ||
            this.layoutInfo.label
        );
    }

    get customThemes() {
        return this._customThemes;
    }

    get galleryOpen() {
        return Boolean(this.galleryMode);
    }

    get customizedControls() {
        // Count hidden settings too: a theme switch can clear those overrides.
        return flattenControls().filter(
            ({ control: c }) =>
                this._isEdited(c) ||
                (c.gradientPath &&
                    getAt(this.overrides, c.gradientPath) !== undefined) ||
                (c.dynamicOptions === 'fonts' && this._formHasFonts())
        );
    }

    get overrideCount() {
        return (
            this.customizedControls.length ||
            (Object.keys(this.overrides).length ? 1 : 0)
        );
    }

    get hasOverrides() {
        return this.overrideCount > 0;
    }

    get advChipCount() {
        return this.customizedControls.filter((c) => !c.control.simple).length;
    }

    get showAdvChip() {
        return !this.advanced && this.advChipCount > 0;
    }

    get lensDesc() {
        return this.advanced
            ? 'Customize branding, layout, fields and completion.'
            : 'Choose a theme, add your content and publish.';
    }

    get simpleLensClass() {
        return this.advanced ? 'lens-btn' : 'lens-btn on';
    }

    get advancedLensClass() {
        return this.advanced ? 'lens-btn on' : 'lens-btn';
    }

    get pendingThemeName() {
        if (!this.pendingThemeKey) {
            return '';
        }
        if (this.pendingThemeKey.startsWith('custom:')) {
            const id = this.pendingThemeKey.slice(7);
            const t = this._customThemes.find((x) => x.id === id);
            return t ? t.name : 'custom theme';
        }
        const t = listBuiltinThemes().find(
            (x) => x.key === this.pendingThemeKey
        );
        return t ? t.name : '';
    }

    /** Blast-radius rule: the editor opens ONLY via this explicit action. */
    handleEditTheme() {
        this.dispatchEvent(
            new CustomEvent('themeedit', {
                detail: {
                    themeId:
                        this.themeSource === 'custom' ? this.themeKey : null,
                    startFrom:
                        this.themeSource === 'builtin' ? this.themeKey : null
                }
            })
        );
    }

    // ---------------------------------------------------------------- events

    _emit() {
        if (this._spec.layout) {
            // a new Split form's Wide gives way once full-bleed is on
            this._spec.layout = settleStartWidth(this._spec.layout);
        }
        this.dispatchEvent(
            new CustomEvent('specchange', {
                detail: { spec: JSON.parse(JSON.stringify(this._spec)) }
            })
        );
    }

    _ensureOverrides() {
        if (!this._spec.theme) {
            this._spec.theme = { source: 'builtin', name: '', overrides: {} };
        }
        if (!this._spec.theme.overrides) {
            this._spec.theme.overrides = {};
        }
        return this._spec.theme.overrides;
    }

    /** One write path for every control (values already type-mapped). */
    _apply(key, value) {
        const def = this._controlDef(key);
        if (!def) {
            return;
        }
        const c = def.control;
        if (c.themePath) {
            const overrides = this._ensureOverrides();
            const themeValue = getAt(this.themeProps, c.themePath);
            const same =
                value === themeValue ||
                (value === null &&
                    (themeValue === null || themeValue === undefined));
            if (same) {
                deleteAt(overrides, c.themePath);
            } else {
                setAt(overrides, c.themePath, value);
            }
        } else if (value === undefined) {
            deleteAt(this._spec, c.path);
        } else {
            setAt(this._spec, c.path, value);
        }
        if (key === 'accent') {
            this._syncInkMode();
        }
        if (
            c.path === 'layout.maxWidth' &&
            this._spec.layout &&
            this._spec.layout.options
        ) {
            // the author picked a width: it is theirs now, Wide included
            delete this._spec.layout.options.widthIsStart;
        }
        this._spec = { ...this._spec };
        this._emit();
    }

    handleColor(event) {
        this._apply(event.target.dataset.key, event.detail.value);
    }

    /**
     * A brand preset (IMPL_PLAN_THEME_CATALOG_CUT P5): ONE mutation, so one
     * undo step. Sets the accent and, unless the theme recipe already does,
     * turns on readable ink so labels on the new color stay legible. Never
     * writes onAccent / submitText / submitBg: inks and button colors the
     * author chose keep winning (finalThemeEngine inkOn).
     */
    handlePresetPick(event) {
        const value = event.detail.value;
        const overrides = this._ensureOverrides();
        if (value === getAt(this.themeProps, 'palette.accent')) {
            deleteAt(overrides, 'palette.accent');
        } else {
            setAt(overrides, 'palette.accent', value);
        }
        if (getAt(this.themeProps, 'palette.inkMode') !== 'contrast') {
            setAt(overrides, 'palette.inkMode', 'contrast');
        }
        this._syncInkMode();
        this._spec = { ...this._spec };
        this._emit();
    }

    /**
     * An inkMode override only ever comes from a preset and only means
     * something next to an accent override. When the accent goes back to the
     * theme's (picker, group reset), drop it too, so the form looks exactly
     * as it did before the preset.
     */
    _syncInkMode() {
        const overrides = this._ensureOverrides();
        if (getAt(overrides, 'palette.accent') === undefined) {
            deleteAt(overrides, 'palette.inkMode');
        }
    }

    // ----- custom mesh (plan B4; UX reworked per owner 2026-07-08) -----

    _activeMeshKey() {
        const def = this._controlDef('mesh');
        return def ? this._effective(def.control) : null;
    }

    /**
     * Picker rows mirror what's actually PAINTED: a preset shows its own seed
     * colors (so "Neon" is never a black box of fixed colors), custom shows
     * the stored array — row count matches the painted blob count, so a
     * 3-blob Aurora conversion never grows a phantom 4th swatch.
     */
    _meshColorRows(value) {
        const meshKey = this._activeMeshKey();
        const row = (color, i) => ({
            idx: String(i),
            label: `Blob ${i + 1}`,
            value: color
        });
        if (meshKey !== 'custom') {
            return (MESH_SEEDS[meshKey] || MESH_SEEDS.neon).map(row);
        }
        const list = Array.isArray(value)
            ? value
            : value && typeof value === 'object'
              ? Object.keys(value)
                    .sort()
                    .map((k) => value[k])
              : [];
        const n = list.length || MESH_SEEDS.neon.length;
        return Array.from({ length: n }, (_, i) =>
            row(list[i] || MESH_SEEDS.neon[i] || '#888888', i)
        );
    }

    /** Editing any blob converts the active preset into a custom mesh seeded
     *  from THAT preset — the user keeps what they were looking at. */
    handleMeshColor(event) {
        const idx = Number(event.target.dataset.idx);
        const arr = this._meshColorRows(
            this._effective(this._controlDef('meshColors').control)
        ).map((r) => r.value);
        arr[idx] = event.detail.value;
        if (this._activeMeshKey() !== 'custom') {
            this._apply('mesh', 'custom');
        }
        // whole-array writes: mergeProps replaces meshColors wholesale, so a
        // sparse per-slot delta would drop the theme's other slots
        this._apply('meshColors', arr);
    }

    /** Frost is invisible behind an opaque fill — say so instead of looking dead. */
    _glassHint(current) {
        if (!current) {
            return '';
        }
        const bgDef = this._controlDef('contentBg');
        const opDef = this._controlDef('contentBgOpacity');
        const bg = bgDef ? this._effective(bgDef.control) : '';
        const op = opDef ? Number(this._effective(opDef.control)) : 100;
        const translucent =
            (typeof bg === 'string' &&
                (bg.startsWith('rgba') || bg === 'transparent')) ||
            (Number.isFinite(op) && op < 100);
        return translucent
            ? ''
            : 'Frost needs a translucent fill. Lower Form appearance › Fill opacity or choose a translucent color.';
    }

    /** Solid + gradient land in ONE event; each half gets sparse-delta rules. */
    handleGradientSurface(event) {
        const key = event.target.dataset.key;
        const def = this._controlDef(key);
        if (!def) {
            return;
        }
        const c = def.control;
        const { solid, gradient } = event.detail;
        const overrides = this._ensureOverrides();
        if (solid === getAt(this.themeProps, c.themePath)) {
            deleteAt(overrides, c.themePath);
        } else {
            setAt(overrides, c.themePath, solid);
        }
        const themeGradient = getAt(this.themeProps, c.gradientPath);
        if (
            gradient === null &&
            (themeGradient === undefined || themeGradient === null)
        ) {
            deleteAt(overrides, c.gradientPath);
        } else {
            setAt(overrides, c.gradientPath, gradient);
        }
        this._spec = { ...this._spec };
        this._emit();
    }

    handleSelect(event) {
        const key = event.target.dataset.key;
        const def = this._controlDef(key);
        let v = event.target.value;
        if (def && def.control.emptyAsNull && v === '') {
            v = null;
        }
        // switching the mesh select to Custom with no colors yet would render
        // nothing — seed from the preset the user was just on (else neon)
        if (key === 'mesh' && v === 'custom') {
            const mc = this._controlDef('meshColors');
            if (mc && !this._effective(mc.control)) {
                const prev = this._activeMeshKey(); // pre-switch value
                this._apply('meshColors', [
                    ...(MESH_SEEDS[prev] || MESH_SEEDS.neon)
                ]);
            }
        }
        if (def && !def.control.themePath && v === '') {
            // plain selects: '' means "layout default" → drop the key
            this._apply(key, undefined);
            return;
        }
        this._apply(key, v);
    }

    handleToggle(event) {
        this._apply(event.target.dataset.key, event.target.checked);
    }

    handleTile(event) {
        this._apply(
            event.currentTarget.dataset.key,
            event.currentTarget.dataset.value
        );
    }

    handleRichText(event) {
        // empty editor → drop the key so the runtime default carries
        this._apply(event.target.dataset.key, event.target.value || undefined);
    }

    handleNumber(event) {
        const n = Number(event.target.value);
        this._apply(
            event.target.dataset.key,
            event.target.value === '' || !Number.isFinite(n) ? undefined : n
        );
    }

    handleText(event) {
        this._apply(event.target.dataset.key, event.target.value);
    }

    handleRange(event) {
        this._apply(event.target.dataset.key, Number(event.target.value));
    }

    handleImage(event) {
        const key = event.target.dataset.key;
        const def = this._controlDef(key);
        if (!def) {
            return;
        }
        const c = def.control;
        const { url, contentVersionId } = event.detail;
        const root = c.themePath ? this._ensureOverrides() : this._spec;
        const urlPath = c.themePath || c.path;
        if (url) {
            setAt(root, urlPath, url);
            if (c.versionPath) {
                setAt(root, c.versionPath, contentVersionId);
            }
        } else {
            deleteAt(root, urlPath);
            if (c.versionPath) {
                deleteAt(root, c.versionPath);
            }
        }
        this._spec = { ...this._spec };
        this._emit();
    }

    // ----- lens + rail -----

    handleLensSimple() {
        this.advanced = false;
    }

    handleLensAdvanced() {
        this.advanced = true;
    }

    handleSectionToggle(event) {
        const key = event.currentTarget.dataset.area;
        this.activeAreaKey = key === this.activeAreaKey ? null : key;
    }

    handleCompletionSettings() {
        this.activeAreaKey = 'completion';
        this.advanced = true;
    }

    // ----- gallery popups (theme + layout share ONE shell) -----

    handleOpenGallery(event) {
        this.galleryMode = event.currentTarget.dataset.gallery;
    }

    /** Back to the theme gallery (the brand dialog's Cancel returns here). */
    @api
    openThemeGallery() {
        this.galleryMode = 'theme';
    }

    /** "Create from your brand" in the theme gallery: the Studio hosts it. */
    handleBrandCreate() {
        this.galleryMode = null;
        this.dispatchEvent(new CustomEvent('brandcreate'));
    }

    handleGalleryClose() {
        this.galleryMode = null;
    }

    // ----- theme switch (confirm gate, IA §6) -----

    /** Gallery picks land in the SAME confirm gate the old dropdown used. */
    handleGalleryTheme(event) {
        this.galleryMode = null;
        const next = event.detail.value;
        if (next === this.themeValue) {
            return;
        }
        if (this.hasOverrides) {
            this.pendingThemeKey = next;
            return;
        }
        this._switchTheme(next, false);
    }

    handleConfirmKeep() {
        this._switchTheme(this.pendingThemeKey, false);
        this.pendingThemeKey = null;
    }

    handleConfirmClear() {
        this._switchTheme(this.pendingThemeKey, true);
        this.pendingThemeKey = null;
    }

    handleConfirmCancel() {
        this.pendingThemeKey = null;
    }

    _switchTheme(key, clearOverrides) {
        if (!this._spec.theme) {
            this._spec.theme = { source: 'builtin', overrides: {} };
        }
        if (key.startsWith('custom:')) {
            const id = key.slice(7);
            this._spec.theme.source = 'custom';
            this._spec.theme.name = id;
            this._loadCustomProps(id);
        } else {
            this._spec.theme.source = 'builtin';
            this._spec.theme.name = key;
        }
        if (clearOverrides) {
            this._spec.theme.overrides = {};
        }
        this._spec = { ...this._spec };
        this._emit();
    }

    // ----- layout switch (no gate: theme overrides are layout-agnostic) -----

    handleGalleryLayout(event) {
        this.galleryMode = null;
        const { layout, paneFlow } = event.detail;
        if (
            layout === this.layoutType &&
            (paneFlow || '') === this.currentPaneFlow
        ) {
            return;
        }
        this._switchLayout(layout, paneFlow || '');
    }

    /**
     * The rules live in c/finalLayoutRegistry layoutAfterSwitch: options are
     * rebuilt per layout, maxWidth and zonesDefault carry over, and coming
     * INTO Split starts carded and Wide like a new Split form.
     */
    _switchLayout(type, paneFlow) {
        this._spec.layout = layoutAfterSwitch(
            this._spec.layout,
            type,
            paneFlow
        );
        this._spec = { ...this._spec };
        this._emit();
    }

    // ----- reset (IA §6: per group + all) -----

    handleGroupReset(event) {
        event.stopPropagation();
        const groupKey = event.currentTarget.dataset.group;
        const section = DESIGN_SECTIONS.find(
            (s) => s.key === this.activeAreaKey
        );
        const group = section && section.groups.find((g) => g.key === groupKey);
        if (!group) {
            return;
        }
        const overrides = this._ensureOverrides();
        for (const entry of flattenControls()) {
            if (
                group.controls.includes(entry.control.key) &&
                entry.control.themePath
            ) {
                deleteAt(overrides, entry.control.themePath);
                if (entry.control.versionPath) {
                    deleteAt(overrides, entry.control.versionPath);
                }
                if (entry.control.gradientPath) {
                    deleteAt(overrides, entry.control.gradientPath);
                }
                if (entry.control.dynamicOptions === 'fonts') {
                    deleteAt(overrides, 'customFont');
                    deleteAt(overrides, 'fonts');
                }
            }
        }
        this._syncInkMode();
        this._spec = { ...this._spec };
        this._emit();
    }

    async handleResetAll() {
        const ok = await LightningConfirm.open({
            message: `Reset all ${this.overrideCount} customization(s) to the theme's defaults?`,
            label: 'Reset all customizations',
            theme: 'warning'
        });
        if (ok) {
            this._ensureOverrides();
            this._spec.theme.overrides = {};
            this._spec = { ...this._spec };
            this._emit();
        }
    }
}

/** '#abc' / '#aabbcc' / 'rgb(a)(…)' → { r, g, b, a }; anything else → null. */
function parseColor(v) {
    if (typeof v !== 'string') {
        return null;
    }
    const s = v.trim();
    const rgb = s.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
    );
    if (rgb) {
        return {
            r: Number(rgb[1]),
            g: Number(rgb[2]),
            b: Number(rgb[3]),
            a: rgb[4] === undefined ? 1 : Number(rgb[4])
        };
    }
    let h = s.replace(/^#/, '');
    if (h.length === 3) {
        h = h
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(h)) {
        return null;
    }
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: 1
    };
}

/** `fg` painted over opaque `bg`, as an opaque color. */
function over(fg, bg) {
    const mixCh = (f, b) => Math.round(f * fg.a + b * (1 - fg.a));
    return {
        r: mixCh(fg.r, bg.r),
        g: mixCh(fg.g, bg.g),
        b: mixCh(fg.b, bg.b),
        a: 1
    };
}

/**
 * The form's card as a person sees it, as opaque hex: the content fill
 * composited over the page fill (over white). Frosted themes paint an rgba
 * card, so judging an accent against the raw token would lie.
 * Approximation: page images and gradients are ignored (treated as the solid
 * page fill). All nine gallery themes have solid pages; on a hidden image
 * theme the dimming can be off.
 */
function cardColor(tokens) {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const page = parseColor(tokens['--c-page-bg']);
    const pageOpaque = page ? over(page, white) : white;
    const card = parseColor(tokens['--c-content-bg']);
    const c = card ? over(card, pageOpaque) : pageOpaque;
    const hex = (n) => n.toString(16).padStart(2, '0');
    return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}
