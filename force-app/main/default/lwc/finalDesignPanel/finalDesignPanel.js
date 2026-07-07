import { LightningElement, api, track } from 'lwc';
import LightningConfirm from 'lightning/confirm';
import listFonts from '@salesforce/apex/FinalFontController.listFonts';
import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';
import { getLayout } from 'c/finalLayoutRegistry';
import {
    listAreas,
    flattenControls,
    getAt,
    setAt,
    deleteAt,
    RADIUS_ORDER
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
    @track activeAreaKey = 'theme';
    @track pendingThemeKey = null;
    @track _fonts = [];
    _spec = {};

    connectedCallback() {
        // imperative (cacheable) — custom Form_Font__mdt entries for the picker
        listFonts()
            .then((fonts) => {
                this._fonts = fonts || [];
            })
            .catch(() => {
                this._fonts = [];
            });
    }

    @api
    get spec() {
        return this._spec;
    }
    set spec(value) {
        this._spec = value ? JSON.parse(JSON.stringify(value)) : {};
    }

    // ----------------------------------------------------------------- state

    get themeKey() {
        return (this._spec.theme && this._spec.theme.name) || '';
    }

    get themeProps() {
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

    _controlDef(key) {
        return flattenControls().find((c) => c.control.key === key);
    }

    _applies(entry) {
        const gate =
            (entry && entry.appliesTo) ||
            (entry && entry.control && entry.control.appliesTo);
        if (!gate) {
            return true;
        }
        if (gate.layouts) {
            return gate.layouts.includes(this.layoutType);
        }
        if (gate.paginated) {
            return Boolean(this.layoutInfo.paginates);
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
        return (
            Boolean(control.themePath) &&
            getAt(this.overrides, control.themePath) !== undefined
        );
    }

    _hasPageImage() {
        const def = this._controlDef('pageImage');
        return Boolean(def && this._effective(def.control));
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
            if (!this._applies(entry)) {
                continue;
            }
            if (c.needsImage && !this._hasPageImage()) {
                continue;
            }
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
                placeholder: c.placeholder || '',
                min: c.min,
                max: c.max
            };
            if (c.type === 'color') {
                vm.value = typeof value === 'string' ? value : '';
                vm.contrastWith = c.contrastToken
                    ? tokens[c.contrastToken]
                    : undefined;
                vm.subject = c.subject;
            } else if (c.type === 'select') {
                let current =
                    value === null || value === undefined ? '' : String(value);
                let options = c.options;
                if (c.dynamicOptions === 'fonts') {
                    options = [
                        ...options,
                        ...this._fonts.map((f) => ({
                            value: `custom:${f.key}`,
                            label: `${f.family} · custom`
                        }))
                    ];
                    const cf = getAt(this.overrides, 'customFont');
                    if (cf && cf.key) {
                        current = `custom:${cf.key}`;
                    }
                    vm.edited =
                        vm.edited ||
                        getAt(this.overrides, 'customFont') !== undefined;
                }
                vm.options = options.map((o) => ({
                    ...o,
                    selected: o.value === current
                }));
            } else if (c.type === 'toggle') {
                // _effective already applied theme default + fallback
                vm.checked = Boolean(value);
            } else if (c.type === 'image') {
                vm.value = value || null;
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

    /** Advanced: the active area's groups with their (filtered) controls. */
    get areaVM() {
        const area = listAreas().find((a) => a.key === this.activeAreaKey);
        if (!area) {
            return { groups: [] };
        }
        const all = this.controlsVM;
        const groups = [];
        for (const g of area.groups) {
            if (!this._applies(g)) {
                continue;
            }
            const controls = all.filter(
                (c) => c.area === area.key && c.group === g.key
            );
            if (controls.length === 0) {
                continue;
            }
            groups.push({
                key: g.key,
                label: g.label,
                note: g.note || '',
                edited: controls.some((c) => c.edited),
                controls
            });
        }
        return { label: area.label, groups, narration: this._narration() };
    }

    _narration() {
        if (this.activeAreaKey === 'paging') {
            if (this.layoutType === 'splitHero') {
                return 'Split Hero owns pagination — progress renders in the brand pane.';
            }
            if (!this.layoutInfo.paginates) {
                return 'Single page — nothing to page.';
            }
            return `The ${this.layoutType} primitive owns its progress indicator; its styling controls arrive with the builder (P3). Values you set elsewhere are kept.`;
        }
        if (this.activeAreaKey === 'header' && this.layoutInfo.ownsHeader) {
            return 'Split Hero paints the header in its brand pane — these words feed the pane.';
        }
        return '';
    }

    get rail() {
        return listAreas().map((a) => ({
            key: a.key,
            label: a.label,
            icon: a.icon,
            cls:
                a.key === this.activeAreaKey
                    ? 'rail-btn on'
                    : 'rail-btn'
        }));
    }

    get simpleVM() {
        const all = this.controlsVM;
        const pick = (key) => all.find((c) => c.key === key);
        return {
            accent: pick('accent'),
            logo: pick('logo'),
            title: pick('title'),
            description: pick('description'),
            submitLabel: pick('submitLabel')
        };
    }

    get themeOptions() {
        return listBuiltinThemes().map((t) => ({
            value: t.key,
            label: t.name,
            selected: t.key === this.themeKey
        }));
    }

    get overrideCount() {
        return this.controlsVM.filter((c) => c.edited).length;
    }

    get hasOverrides() {
        return this.overrideCount > 0;
    }

    get advChipCount() {
        return this.controlsVM.filter((c) => c.edited && !c.simple).length;
    }

    get showAdvChip() {
        return !this.advanced && this.advChipCount > 0;
    }

    get lensDesc() {
        return this.advanced
            ? 'Nine areas, every control — grouped by what it styles.'
            : 'The essentials. Everything else follows the theme.';
    }

    get simpleLensClass() {
        return this.advanced ? 'lens-btn' : 'lens-btn on';
    }

    get advancedLensClass() {
        return this.advanced ? 'lens-btn on' : 'lens-btn';
    }

    get pendingThemeName() {
        const t = this.pendingThemeKey
            ? listBuiltinThemes().find((x) => x.key === this.pendingThemeKey)
            : null;
        return t ? t.name : '';
    }

    // ---------------------------------------------------------------- events

    _emit() {
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
        this._spec = { ...this._spec };
        this._emit();
    }

    handleColor(event) {
        this._apply(event.target.dataset.key, event.detail.value);
    }

    handleSelect(event) {
        const key = event.target.dataset.key;
        const def = this._controlDef(key);
        let v = event.target.value;
        // custom font route: the picker value custom:<key> becomes a
        // customFont override object; picking a built-in pairing clears it
        if (def && def.control.dynamicOptions === 'fonts') {
            const overrides = this._ensureOverrides();
            if (v.startsWith('custom:')) {
                const font = this._fonts.find(
                    (f) => `custom:${f.key}` === v
                );
                if (font) {
                    setAt(overrides, 'customFont', {
                        key: font.key,
                        family: font.family,
                        fallback: font.fallback,
                        resource: font.resource,
                        regularPath: font.regularPath,
                        boldPath: font.boldPath
                    });
                    deleteAt(overrides, 'typography');
                    this._spec = { ...this._spec };
                    this._emit();
                }
                return;
            }
            deleteAt(overrides, 'customFont');
        }
        if (def && def.control.emptyAsNull && v === '') {
            v = null;
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

    handleRail(event) {
        this.activeAreaKey = event.currentTarget.dataset.area;
    }

    // ----- Simple LOOK chips (same values the Advanced selects drive) -----

    handleLook(event) {
        const look = event.target.dataset.look;
        if (look === 'airy' || look === 'dense') {
            this._apply(
                'density',
                look === 'airy' ? 'comfortable' : 'compact'
            );
            return;
        }
        const radiusDef = this._controlDef('radius');
        const current = this._effective(radiusDef.control) || 'soft';
        const i = RADIUS_ORDER.indexOf(current);
        const next =
            look === 'rounder'
                ? Math.min(i + 1, RADIUS_ORDER.length - 1)
                : Math.max(i - 1, 0);
        this._apply('radius', RADIUS_ORDER[next]);
    }

    // ----- theme switch (confirm gate, IA §6) -----

    handleThemePick(event) {
        const next = event.target.value;
        if (next === this.themeKey) {
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
        this._spec.theme.source = 'builtin';
        this._spec.theme.name = key;
        if (clearOverrides) {
            this._spec.theme.overrides = {};
        }
        this._spec = { ...this._spec };
        this._emit();
    }

    // ----- reset (IA §6: per group + all) -----

    handleGroupReset(event) {
        event.stopPropagation();
        const groupKey = event.target.dataset.group;
        const overrides = this._ensureOverrides();
        for (const entry of flattenControls()) {
            if (
                entry.area === this.activeAreaKey &&
                entry.group === groupKey &&
                entry.control.themePath
            ) {
                deleteAt(overrides, entry.control.themePath);
                if (entry.control.versionPath) {
                    deleteAt(overrides, entry.control.versionPath);
                }
                if (entry.control.dynamicOptions === 'fonts') {
                    deleteAt(overrides, 'customFont');
                }
            }
        }
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
