import { LightningElement, api, track } from 'lwc';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';
import { getAt, setAt, deleteAt } from 'c/finalDesignRegistry';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';
import orgName from '@salesforce/apex/FinalThemeController.orgName';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FinalAssetController.deleteImage';
import listFonts from '@salesforce/apex/FinalFontController.listFonts';
import { resolveTokens, resolveFontRefs } from 'c/finalThemeEngine';
import { applyFontPatch } from 'c/finalFontChoices';
import { previewSettings } from 'c/finalLayoutRegistry';
import { logoForUpload } from 'c/finalBrandColors';
import {
    buildBrandTheme,
    themeReadability,
    fixReadability
} from 'c/finalBrandTheme';

/**
 * finalThemeEditor — the ONE theme dialog (IMPL_PLAN_THEME_CREATOR): create or
 * edit an org-wide custom theme. It merges the old editor with "Create from
 * your brand".
 *
 *   Start from   A theme (a built-in) | Your brand (c/finalBrandInputs) |
 *                Current theme (as saved), for themes saved before this
 *   Colours      all 18 a theme sets, grouped; unset ones show the engine's
 *                value as "Automatic" and write nothing until changed
 *   Shape & type font picker + the shape selects
 *   Readability  every pair measured (photos/mesh named as not checked);
 *                Fix for me moves only the failing colours
 *
 * Hand edits stick (owner ruling 3): a property changed by hand is PINNED.
 * Changing the starting point rebuilds from it and copies every pinned path
 * back; "Use calculated" unpins. Pins are saved with the theme under
 * `authoring`, which the engine never reads. `brand` is written only for a
 * brand start (the engine's readable-ink switch reads it).
 *
 * Blast-radius rules unchanged: opened only by an explicit action; Save as
 * new is the frictionless path. Emits `save` { id, name, logo? } / `cancel`.
 */

const COLOR_GROUPS = [
    {
        key: 'brand',
        label: 'Brand',
        rows: [
            ['accent', 'Accent', 'palette.accent', '--c-accent'],
            ['onAccent', 'Text on accent', 'palette.onAccent', '--c-on-accent'],
            ['submitBg', 'Button fill', 'palette.submitBg', '--c-submit-bg'],
            [
                'submitText',
                'Button text',
                'palette.submitText',
                '--c-submit-text'
            ]
        ]
    },
    {
        key: 'text',
        label: 'Text',
        rows: [
            ['text', 'Text', 'palette.text', '--c-text'],
            ['textWeak', 'Muted text', 'palette.textWeak', '--c-text-weak'],
            ['labelColor', 'Labels', 'palette.labelColor', '--c-label-color']
        ]
    },
    {
        key: 'surfaces',
        label: 'Surfaces',
        rows: [
            ['pageBg', 'Page fill', 'palette.pageBg', '--c-page-bg'],
            ['contentBg', 'Panel fill', 'palette.contentBg', '--c-content-bg'],
            ['borderColor', 'Border', 'palette.borderColor', '--c-border-color']
        ]
    },
    {
        key: 'header',
        label: 'Header',
        rows: [
            ['headerBg', 'Header fill', 'palette.headerBg', '--c-header-bg'],
            [
                'headerText',
                'Header title',
                'palette.headerText',
                '--c-header-text'
            ],
            [
                'headerTextWeak',
                'Header subtitle',
                'palette.headerTextWeak',
                '--c-header-text-weak'
            ]
        ]
    },
    {
        key: 'fields',
        label: 'Fields',
        rows: [
            ['fieldBg', 'Input fill', 'palette.fieldBg', '--c-field-bg'],
            [
                'fieldBorderColor',
                'Input border',
                'palette.fieldBorderColor',
                '--c-field-border'
            ]
        ]
    },
    {
        key: 'states',
        label: 'States',
        rows: [
            ['focus', 'Focus', 'fieldStates.focus', '--c-field-focus'],
            ['error', 'Error', 'fieldStates.error', '--c-field-error'],
            [
                'required',
                'Required marker',
                'fieldStates.required',
                '--c-field-required'
            ]
        ]
    }
];

// Fonts are not a select row: c/finalFontPicker (theme mode) edits them.
const SELECT_ROWS = [
    {
        key: 'radius',
        label: 'Corner rounding',
        path: 'radius',
        fallback: 'soft',
        options: [
            { value: 'sharp', label: 'Sharp' },
            { value: 'xs', label: 'Crisp' },
            { value: 'soft', label: 'Soft' },
            { value: 'md', label: 'Rounded' },
            { value: 'round', label: 'Round' },
            { value: 'lg', label: 'Extra round' },
            { value: 'xl', label: 'Curvy' },
            { value: 'pill', label: 'Pill' }
        ]
    },
    {
        key: 'border',
        label: 'Border weight',
        path: 'border',
        fallback: 'hairline',
        options: [
            { value: 'hairline', label: 'Hairline' },
            { value: 'bold', label: 'Bold' }
        ]
    },
    {
        key: 'density',
        label: 'Density',
        path: 'density',
        fallback: 'comfortable',
        options: [
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' }
        ]
    },
    {
        key: 'shadow',
        label: 'Shadow',
        path: 'effects.shadow',
        fallback: 'soft',
        options: [
            { value: 'none', label: 'None' },
            { value: 'soft', label: 'Soft' },
            { value: 'medium', label: 'Medium' },
            { value: 'floating', label: 'Floating' },
            { value: 'brutal', label: 'Hard offset' }
        ]
    },
    {
        key: 'texture',
        label: 'Texture',
        path: 'effects.texture',
        fallback: '',
        emptyAsNull: true,
        options: [
            { value: '', label: 'None' },
            { value: 'dots', label: 'Dots' },
            { value: 'grid', label: 'Grid' }
        ]
    },
    {
        key: 'mesh',
        label: 'Mesh',
        path: 'effects.mesh',
        fallback: '',
        emptyAsNull: true,
        options: [
            { value: '', label: 'None' },
            { value: 'aurora', label: 'Aurora' },
            { value: 'dusk', label: 'Dusk' }
        ]
    }
];

// The font picker writes these recipe keys; a pick pins all three.
const FONT_PATHS = ['fonts', 'typography', 'customFont'];

// A base theme recorded with a brand theme (older screens read it).
const BASE_FOR_STYLE = {
    clean: 'nordic',
    boldHeader: 'nordic',
    dark: 'dracula'
};

const clone = (o) => JSON.parse(JSON.stringify(o || {}));
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A failed request in words a person can act on.
function friendly(error, stage) {
    const raw = (error && error.body && error.body.message) || '';
    const transport =
        !raw || /disconnect|cancel|network|timed? ?out/i.test(raw);
    if (stage === 'upload') {
        return transport
            ? 'Your logo couldn’t be uploaded (we couldn’t reach Salesforce), so nothing was saved. Try again, or untick the logo option.'
            : 'Your logo couldn’t be uploaded, so nothing was saved. Try again, or untick the logo option.';
    }
    if (transport) {
        return 'We couldn’t reach Salesforce. Check your connection and try again.';
    }
    return `The theme couldn’t be saved: ${raw.replace(/^Error[^:]*:\s*/, '')}`;
}

export default class FinalThemeEditor extends LightningElement {
    /** Theme_Definition__c Id — null/undefined = create a new theme. */
    @api themeId;
    /** The saved theme's name (edit only; the record JSON doesn't carry it). */
    @api themeName;
    /** Built-in key to start from when creating (default editorialIvory). */
    @api startFrom;
    /** 'brand' opens a new theme on "Your brand" (the gallery's card). */
    @api startMode;
    /** The form being edited: a logo upload is attached to it. */
    @api formId;
    /** The form's layout, so the preview shows the theme in it. */
    @api layout = 'scroll';
    @api paneFlow = '';
    @api formLayout = null;
    /** The form's current logo / header arrangement (logo option wording). */
    @api currentLogoUrl = '';
    @api headerArrangement = '';

    @track name = '';
    @track error = '';
    @track saving = false;
    @track _props = null;
    @track _pinned = [];
    /** 'theme' | 'brand' | 'current' */
    @track start = 'theme';
    @track baseKey = '';
    @track brand = { color: '', second: '', style: 'clean' };
    @track confirmRebuild = null;
    @track unfixed = [];
    uploadedFonts = [];
    fontsLoaded = false;
    _base = null;
    _savedProps = null;
    _dirty = false;
    _logo = { dataUrl: null, fileName: '', useAsLogo: false };
    _uploaded = null; // { dataUrl, url, versionId } — reused on a retry
    _savedOnce = false;
    _nameTouched = false;

    connectedCallback() {
        listFonts()
            .then((fonts) => {
                this.uploadedFonts = fonts || [];
                this.fontsLoaded = true;
            })
            .catch(() => {
                this.uploadedFonts = [];
            });
        if (this.themeId) {
            this.name = this.themeName || '';
            getCustomTheme({ themeId: this.themeId })
                .then((json) => this._openSaved(JSON.parse(json)))
                .catch(() => {
                    this.error = 'This theme could not be loaded.';
                });
            return;
        }
        this.start = this.startMode === 'brand' ? 'brand' : 'theme';
        this.baseKey =
            this.startFrom ||
            (this.start === 'brand' ? 'nordic' : 'editorialIvory');
        this._base = this._computeBase();
        this._props = clone(this._base);
        if (this.start === 'brand') this._suggestBrandName();
    }

    /** A new brand theme is named "<Org> brand" until you type a name. */
    _suggestBrandName() {
        if (this.isEdit || this.name || this._nameTouched) return;
        orgName()
            .then((org) => {
                if (org && !this.name && !this._nameTouched) {
                    this.name = `${org} brand`;
                }
            })
            .catch(() => {});
    }

    disconnectedCallback() {
        // an uploaded logo whose theme was never saved: remove the file
        if (this._uploaded && !this._savedOnce) {
            this._discardUpload();
        }
    }

    /** A saved theme: its own starting point and pins when it has them. */
    _openSaved(props) {
        this._savedProps = clone(props);
        const authoring = props.authoring || null;
        if (props.brand && props.brand.color) {
            this.brand = {
                color: props.brand.color,
                second: props.brand.secondColor || '',
                style: props.brand.style || 'clean'
            };
        }
        if (authoring && authoring.start === 'theme' && authoring.from) {
            this.start = 'theme';
            this.baseKey = authoring.from;
        } else if ((authoring && authoring.start === 'brand') || props.brand) {
            this.start = 'brand';
        } else {
            this.start = 'current';
        }
        this._pinned =
            authoring && Array.isArray(authoring.pinned)
                ? [...authoring.pinned]
                : [];
        this._base = this._computeBase();
        this._props = clone(props);
    }

    // ------------------------------------------------------------ model

    get isEdit() {
        return Boolean(this.themeId);
    }

    get title() {
        return this.isEdit ? 'Edit theme' : 'New theme';
    }

    get ready() {
        return this._props !== null;
    }

    _computeBase() {
        if (this.start === 'brand') {
            if (!this.brand.color) {
                return clone(getBuiltinTheme(this.baseKey || 'nordic'));
            }
            return buildBrandTheme({
                color: this.brand.color,
                secondColor: this.brand.second || null,
                style: this.brand.style,
                fonts: (this._props && this._props.fonts) || null
            });
        }
        if (this.start === 'current') {
            return clone(this._savedProps);
        }
        return clone(getBuiltinTheme(this.baseKey) || {});
    }

    /** New starting point: rebuild, then every pinned path comes back. */
    _rebuild() {
        const old = this._props || {};
        this._base = this._computeBase();
        const next = clone(this._base);
        this._pinned.forEach((path) => {
            const value = getAt(old, path);
            if (value === undefined) deleteAt(next, path);
            else setAt(next, path, clone({ v: value }).v);
        });
        if (this.start !== 'brand') delete next.brand;
        delete next.authoring;
        this._props = next;
        this._touched();
    }

    _pin(path) {
        if (!this._pinned.includes(path)) {
            this._pinned = [...this._pinned, path];
        }
    }

    _set(path, value) {
        const next = clone(this._props);
        if (value === undefined) deleteAt(next, path);
        else setAt(next, path, value);
        this._props = next;
        this._pin(path);
        this._touched();
    }

    _touched() {
        this._dirty = true;
        this.unfixed = [];
    }

    get tokens() {
        return resolveTokens(this._props || {}, null);
    }

    // ------------------------------------------------------- start from

    /** "Current theme (as saved)" only for themes saved before pins. */
    get offersCurrent() {
        return Boolean(
            this._savedProps &&
            !this._savedProps.authoring &&
            !this._savedProps.brand
        );
    }

    get startOptions() {
        const opts = [
            { value: 'theme', label: 'A theme' },
            { value: 'brand', label: 'Your brand' }
        ];
        if (this.offersCurrent) {
            opts.unshift({
                value: 'current',
                label: 'Current theme (as saved)'
            });
        }
        return opts.map((o) => ({
            ...o,
            cls: o.value === this.start ? 'te-seg on' : 'te-seg',
            pressed: o.value === this.start ? 'true' : 'false'
        }));
    }

    get isThemeStart() {
        return this.start === 'theme' && !this.confirmRebuild;
    }

    get isBrandStart() {
        return this.start === 'brand' && !this.confirmRebuild;
    }

    get isCurrentStart() {
        return this.start === 'current' && !this.confirmRebuild;
    }

    get themeOptions() {
        // gallery themes only; a hidden base this theme already started from
        // stays listed so the select never shows a value it can't name
        return listBuiltinThemes()
            .filter((t) => !t.hidden || t.key === this.baseKey)
            .map((t) => ({
                value: t.key,
                label: t.name,
                selected: t.key === this.baseKey
            }));
    }

    get confirmRebuildLabel() {
        return this.confirmRebuild === 'brand' ? 'your brand' : 'a theme';
    }

    _enter(start) {
        this.start = start;
        if (start === 'brand') this._suggestBrandName();
        if (start === 'theme' && !this.baseKey) {
            this.baseKey = 'editorialIvory';
        }
        this._rebuild();
    }

    handleStart(event) {
        const value = event.currentTarget.dataset.value;
        if (value === this.start) return;
        // an older theme has no pins yet: say what a rebuild does, once
        if (this.start === 'current') {
            this.confirmRebuild = value;
            return;
        }
        this._enter(value);
    }

    handleRebuildYes() {
        const target = this.confirmRebuild;
        this.confirmRebuild = null;
        this._enter(target);
    }

    handleRebuildNo() {
        this.confirmRebuild = null;
    }

    handleThemeSelect(event) {
        this.baseKey = event.target.value;
        this._rebuild();
    }

    handleBrandChange(event) {
        const { color, second, style } = event.detail;
        this.brand = { color, second, style };
        if (this.start === 'brand') this._rebuild();
    }

    handleLogoChange(event) {
        const next = { ...event.detail };
        if (
            this._uploaded &&
            !this._savedOnce &&
            this._uploaded.dataUrl !== next.dataUrl
        ) {
            this._discardUpload();
        }
        this._logo = next;
        this._dirty = true;
    }

    get brandFonts() {
        return (this._props && this._props.fonts) || null;
    }

    // ----------------------------------------------------------- colours

    get colorGroups() {
        const props = this._props || {};
        const tokens = this.tokens;
        const failing = this.failingPaths;
        return COLOR_GROUPS.map((g) => ({
            key: g.key,
            label: g.label,
            rows: g.rows.map(([key, label, path, token]) => {
                const own = getAt(props, path);
                const pinned = this._pinned.includes(path);
                const automatic =
                    !pinned && (own === undefined || own === null);
                const value = automatic ? tokens[token] : own;
                return {
                    key,
                    label,
                    path,
                    value: typeof value === 'string' ? value : '',
                    pinned,
                    automatic,
                    flagged: failing.has(path),
                    flagText:
                        path === 'palette.fieldBorderColor' ||
                        path === 'fieldStates.focus'
                            ? 'Hard to see'
                            : 'Hard to read'
                };
            })
        }));
    }

    handleColor(event) {
        this._set(event.target.dataset.path, event.detail.value);
    }

    /** "Use calculated": unpin, and the starting point's value comes back. */
    handleUseCalculated(event) {
        const paths = event.currentTarget.dataset.path.split(',');
        const next = clone(this._props);
        paths.forEach((path) => {
            const value = getAt(this._base, path);
            if (value === undefined) deleteAt(next, path);
            else setAt(next, path, value);
        });
        this._pinned = this._pinned.filter((p) => !paths.includes(p));
        this._props = next;
        this._touched();
    }

    // ------------------------------------------------------ shape & type

    get selectRows() {
        return SELECT_ROWS.map((r) => {
            const raw = getAt(this._props, r.path);
            const current =
                raw === null || raw === undefined ? r.fallback : String(raw);
            return {
                ...r,
                pinned: this._pinned.includes(r.path),
                options: r.options.map((o) => ({
                    ...o,
                    selected: o.value === current
                }))
            };
        });
    }

    handleSelect(event) {
        const row = SELECT_ROWS.find((r) => r.key === event.target.dataset.key);
        let v = event.target.value;
        if (row && row.emptyAsNull && v === '') {
            v = null; // "None" is a real value: written, not deleted
        }
        this._set(row.path, v);
    }

    get glassChecked() {
        return Boolean(getAt(this._props, 'effects.glass'));
    }

    get glassPinned() {
        return this._pinned.includes('effects.glass');
    }

    handleGlass(event) {
        this._set('effects.glass', event.target.checked);
    }

    /** The theme's own font keys, for the picker. */
    get fontLevel() {
        const props = this._props || {};
        const level = {};
        FONT_PATHS.forEach((k) => {
            if (props[k] !== undefined) level[k] = props[k];
        });
        return level;
    }

    get fontEffective() {
        return resolveFontRefs(this._props || {}, null);
    }

    get fontPinned() {
        return FONT_PATHS.some((p) => this._pinned.includes(p));
    }

    get fontPaths() {
        return FONT_PATHS.join(',');
    }

    handleFontChange(event) {
        const next = clone(this._props);
        applyFontPatch(next, event.detail && event.detail.patch);
        this._props = next;
        FONT_PATHS.forEach((p) => this._pin(p));
        this._touched();
    }

    // ------------------------------------------------------- readability

    get report() {
        return themeReadability(this._props || {});
    }

    get failingPaths() {
        return new Set(
            this.report.checks
                .filter((c) => !c.pass && !c.advisory && !c.unmeasurable)
                .map((c) => c.path)
        );
    }

    /** One line per failing colour, its worst pair, in plain words. */
    get readabilityLines() {
        const worstByPath = new Map();
        this.report.checks
            .filter((c) => !c.pass && !c.advisory && !c.unmeasurable)
            .forEach((c) => {
                const seen = worstByPath.get(c.path);
                if (!seen || c.ratio < seen.ratio) worstByPath.set(c.path, c);
            });
        return [...worstByPath.values()].map((c) => ({
            key: c.path,
            text: `${capital(c.name)} is hard to ${c.min < 4.5 ? 'see' : 'read'} on ${c.where}: ${c.ratio.toFixed(1)} : 1, needs ${c.min} : 1.`
        }));
    }

    get readableState() {
        const r = this.report;
        if (!r.pass) return 'bad';
        return r.complete ? 'ok' : 'partial';
    }

    get readableClass() {
        return `te-readable te-readable--${this.readableState}`;
    }

    get readableOk() {
        return this.readableState === 'ok';
    }

    get readablePartial() {
        return this.readableState === 'partial';
    }

    get readableBad() {
        return this.readableState === 'bad';
    }

    get attentionTitle() {
        const n = this.readabilityLines.length;
        return `${n} colour${n === 1 ? ' needs' : 's need'} attention`;
    }

    get notChecked() {
        return this.report.unchecked.map((u) => u.surface).join(', ');
    }

    get hasNotChecked() {
        return this.report.unchecked.length > 0;
    }

    /** Advisory only: a button that blends into the card. */
    get buttonNote() {
        return this.report.checks.some((c) => c.advisory && !c.pass)
            ? 'The Submit button is close to the card colour, so it may not stand out. Try the Bold header style or a deeper shade.'
            : '';
    }

    get unfixedLines() {
        return this.unfixed.map((u) => ({
            key: u.path,
            text: `Couldn’t fix automatically: ${capital(u.name)} on ${u.where} (best found ${u.best} : 1, needs ${u.min} : 1). Try a different colour for ${u.where.replace(/^the /, '')}.`
        }));
    }

    get hasUnfixed() {
        return this.unfixed.length > 0;
    }

    handleFix() {
        const out = fixReadability(this._props || {});
        this._props = out.recipe;
        out.fixed.forEach((p) => this._pin(p));
        this._dirty = true;
        this.unfixed = out.unfixed;
    }

    // ----------------------------------------------------------- preview

    get _previewSettings() {
        return previewSettings(
            this.formLayout || { type: this.layout, options: {} },
            this.layout,
            this.paneFlow
        );
    }

    get previewFullBleed() {
        return (this._previewSettings.options || {}).fullBleed;
    }

    get previewMaxWidth() {
        return this._previewSettings.maxWidth;
    }

    get previewPaneSide() {
        return (this._previewSettings.options || {}).side;
    }

    get previewPaneRatio() {
        return (this._previewSettings.options || {}).ratio;
    }

    /** The working theme, as the preview card draws it. */
    get previewProps() {
        return this._props;
    }

    get previewLabel() {
        return this.name || 'Your theme';
    }

    /** For boolean child properties (bare attributes do not set true). */
    get yes() {
        return true;
    }

    /** What each colour paints, with the colour actually used. */
    get colorRoles() {
        const t = this.tokens;
        const role = (key, name, does, color) => ({
            key,
            name,
            does,
            style: `background:${color};`
        });
        if (this.start === 'brand' && this.brand.color) {
            const accent = t['--c-accent'];
            let secondNote = ' (made from your main colour)';
            if (this.brand.second) {
                secondNote =
                    accent === this.brand.second
                        ? ''
                        : ' (a shade adjusted so it stays readable)';
            }
            return [
                role(
                    'main',
                    'Main',
                    this.brand.style === 'boldHeader'
                        ? 'Submit button, header and page tint'
                        : 'Submit button and page tint',
                    t['--c-submit-bg']
                ),
                role(
                    'second',
                    this.brand.second ? 'Second' : 'Highlights',
                    `Selected answers, progress, step numbers and focus outlines${secondNote}`,
                    accent
                )
            ];
        }
        return [
            role(
                'accent',
                'Accent',
                'Selected answers, progress, step numbers',
                t['--c-accent']
            ),
            role(
                'button',
                'Button fill',
                'Submit and Next buttons',
                t['--c-submit-bg']
            ),
            role(
                'focus',
                'Focus',
                'The outline around the field you’re typing in',
                t['--c-field-focus']
            )
        ];
    }

    // -------------------------------------------------------------- save

    get confirmLabel() {
        if (this.saving) return 'Saving…';
        return this.isEdit ? 'Save' : 'Create theme';
    }

    get dirty() {
        return this._dirty;
    }

    handleName(event) {
        this._nameTouched = true;
        this.name = event.target.value;
        this.error = '';
        this._dirty = true;
    }

    async handleConfirm() {
        await this._persist(this.isEdit ? this.themeId : null);
    }

    async handleSaveAsNew() {
        await this._persist(null);
    }

    /** The recipe as saved: the starting point and the pins ride along. */
    _recipeToSave() {
        const recipe = clone(this._props);
        delete recipe.authoring;
        if (this.start === 'brand' && this.brand.color) {
            recipe.brand = this.brand.second
                ? {
                      color: this.brand.color,
                      secondColor: this.brand.second,
                      style: this.brand.style
                  }
                : { color: this.brand.color, style: this.brand.style };
        } else if (this.start !== 'current') {
            delete recipe.brand;
        }
        if (this.start !== 'current') {
            recipe.authoring = { start: this.start, pinned: [...this._pinned] };
            if (this.start === 'theme') recipe.authoring.from = this.baseKey;
        }
        return recipe;
    }

    _baseThemeForRecord() {
        if (this.start === 'theme') return this.baseKey || null;
        if (this.start === 'brand') {
            return BASE_FOR_STYLE[this.brand.style] || 'nordic';
        }
        return null;
    }

    async _persist(recordId) {
        if (this.saving) return;
        this.error = '';
        if (this.start === 'brand') {
            const inputs = this.template.querySelector('c-final-brand-inputs');
            if (inputs && !inputs.validate()) return;
        }
        if (!this.name.trim()) {
            this.error = 'Give the theme a name.';
            this.template.querySelector('.te-name')?.focus();
            return;
        }
        this.saving = true;
        let stage = 'upload';
        try {
            let logo = null;
            const l = this._logo;
            if (this.start === 'brand' && l.dataUrl && l.useAsLogo) {
                if (!this._uploaded || this._uploaded.dataUrl !== l.dataUrl) {
                    const body = await logoForUpload(l.dataUrl);
                    const res = await uploadImage({
                        base64Data: body,
                        fileName:
                            (l.fileName || 'logo').replace(/\.[^.]+$/, '') +
                            '.png',
                        formId: this.formId || null
                    });
                    this._uploaded = {
                        dataUrl: l.dataUrl,
                        url: res.url,
                        versionId: res.contentVersionId
                    };
                }
                logo = {
                    url: this._uploaded.url,
                    versionId: this._uploaded.versionId
                };
            }
            stage = 'save';
            const id = await saveCustomTheme({
                themeId: recordId,
                name: this.name.trim(),
                baseTheme: this._baseThemeForRecord(),
                themeJson: JSON.stringify(this._recipeToSave())
            });
            this._savedOnce = true;
            const detail = { id, name: this.name.trim() };
            if (logo) detail.logo = logo;
            this.dispatchEvent(new CustomEvent('save', { detail }));
        } catch (e) {
            this.error = friendly(e, stage);
        } finally {
            this.saving = false;
        }
    }

    _discardUpload() {
        const up = this._uploaded;
        this._uploaded = null;
        if (up && up.versionId) {
            deleteImage({
                contentVersionId: up.versionId,
                formId: this.formId || null
            }).catch(() => {});
        }
    }

    handleDismiss() {
        if (this._uploaded && !this._savedOnce) {
            this._discardUpload();
        }
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
