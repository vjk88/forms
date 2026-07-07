import { LightningElement, api, track } from 'lwc';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';
import { getAt, setAt } from 'c/finalDesignRegistry';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';

/**
 * finalThemeEditor — create/edit a CUSTOM theme (catalog §6).
 *
 * Edits theme PROPERTIES (the ARCH §4.1 shape — the same recipe shape as a
 * built-in), never tokens or CSS. Blast-radius rules: opened only via an
 * explicit "Edit theme…" action (host-owned modal); Save As New is the
 * frictionless path. Emits `save` { id, name } / `cancel`.
 *
 * Colors reuse c/finalColorControl (badge semantics included) — the editor is
 * mostly declarative rows over one _props object.
 * Affected-forms count: P3 (specs aren't queryable by theme reference yet).
 */

const COLOR_ROWS = [
    { key: 'accent', label: 'Accent', path: 'palette.accent', contrast: 'palette.onAccent', subject: 'Button labels' },
    { key: 'onAccent', label: 'Button text', path: 'palette.onAccent', fallback: '#ffffff' },
    { key: 'text', label: 'Text', path: 'palette.text', contrast: 'palette.contentBg', subject: 'Body text' },
    { key: 'textWeak', label: 'Muted text', path: 'palette.textWeak', contrast: 'palette.contentBg', subject: 'Muted text' },
    { key: 'pageBg', label: 'Page fill', path: 'palette.pageBg' },
    { key: 'contentBg', label: 'Panel fill', path: 'palette.contentBg' },
    { key: 'headerBg', label: 'Header fill', path: 'palette.headerBg' },
    { key: 'focus', label: 'Focus color', path: 'fieldStates.focus' },
    { key: 'error', label: 'Error color', path: 'fieldStates.error', fallback: '#b42318' },
    { key: 'required', label: 'Required marker', path: 'fieldStates.required', fallback: '#b42318' }
];

const SELECT_ROWS = [
    {
        key: 'typography', label: 'Font pairing', path: 'typography', fallback: 'system',
        options: [
            { value: 'system', label: 'System' },
            { value: 'editorial', label: 'Editorial (serif display)' },
            { value: 'mono', label: 'Mono' },
            { value: 'geometric', label: 'Geometric' },
            { value: 'humanist', label: 'Humanist' }
        ]
    },
    {
        key: 'radius', label: 'Corner rounding', path: 'radius', fallback: 'soft',
        options: [
            { value: 'sharp', label: 'Sharp' }, { value: 'xs', label: 'Crisp' },
            { value: 'soft', label: 'Soft' }, { value: 'md', label: 'Rounded' },
            { value: 'round', label: 'Round' }, { value: 'lg', label: 'Extra round' },
            { value: 'xl', label: 'Curvy' }, { value: 'pill', label: 'Pill' }
        ]
    },
    {
        key: 'border', label: 'Border weight', path: 'border', fallback: 'hairline',
        options: [
            { value: 'hairline', label: 'Hairline' },
            { value: 'bold', label: 'Bold' }
        ]
    },
    {
        key: 'density', label: 'Density', path: 'density', fallback: 'comfortable',
        options: [
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' }
        ]
    },
    {
        key: 'shadow', label: 'Shadow', path: 'effects.shadow', fallback: 'soft',
        options: [
            { value: 'none', label: 'None' }, { value: 'soft', label: 'Soft' },
            { value: 'medium', label: 'Medium' }, { value: 'floating', label: 'Floating' },
            { value: 'brutal', label: 'Hard offset' }
        ]
    },
    {
        key: 'texture', label: 'Texture', path: 'effects.texture', fallback: '', emptyAsNull: true,
        options: [
            { value: '', label: 'None' },
            { value: 'dots', label: 'Dots' },
            { value: 'grid', label: 'Grid' }
        ]
    },
    {
        key: 'mesh', label: 'Mesh', path: 'effects.mesh', fallback: '', emptyAsNull: true,
        options: [
            { value: '', label: 'None' },
            { value: 'aurora', label: 'Aurora' },
            { value: 'dusk', label: 'Dusk' }
        ]
    }
];

export default class FinalThemeEditor extends LightningElement {
    /** Theme_Definition__c Id — null/undefined = create a new theme. */
    @api themeId;
    /** Built-in key to fork from when creating (default editorialIvory). */
    @api startFrom;

    @track name = '';
    @track baseKey = '';
    @track saving = false;
    @track error = '';
    @track _props = null;

    connectedCallback() {
        if (this.themeId) {
            getCustomTheme({ themeId: this.themeId })
                .then((json) => {
                    this._props = JSON.parse(json);
                })
                .catch(() => {
                    this.error = 'This theme could not be loaded.';
                });
        } else {
            this.baseKey = this.startFrom || 'editorialIvory';
            this._props = getBuiltinTheme(this.baseKey) || {};
        }
    }

    get isEdit() {
        return Boolean(this.themeId);
    }

    get title() {
        return this.isEdit ? 'Edit theme' : 'New theme';
    }

    get ready() {
        return this._props !== null;
    }

    get startOptions() {
        return listBuiltinThemes().map((t) => ({
            value: t.key,
            label: t.name,
            selected: t.key === this.baseKey
        }));
    }

    get colorRows() {
        return COLOR_ROWS.map((r) => {
            const value = getAt(this._props, r.path);
            const contrastWith = r.contrast
                ? getAt(this._props, r.contrast)
                : undefined;
            return {
                ...r,
                value:
                    typeof value === 'string' && value !== 'transparent'
                        ? value
                        : r.fallback || '',
                contrastWith,
                subject: r.subject
            };
        });
    }

    get selectRows() {
        return SELECT_ROWS.map((r) => {
            const raw = getAt(this._props, r.path);
            const current =
                raw === null || raw === undefined ? r.fallback : String(raw);
            return {
                ...r,
                options: r.options.map((o) => ({
                    ...o,
                    selected: o.value === current
                }))
            };
        });
    }

    get glassChecked() {
        return Boolean(getAt(this._props, 'effects.glass'));
    }

    get saveDisabled() {
        return this.saving || !this.name.trim();
    }

    // ------------------------------------------------------------- handlers

    handleStartFrom(event) {
        this.baseKey = event.target.value;
        this._props = getBuiltinTheme(this.baseKey) || {};
    }

    handleName(event) {
        this.name = event.target.value;
    }

    _set(path, value) {
        const next = JSON.parse(JSON.stringify(this._props));
        setAt(next, path, value);
        this._props = next;
    }

    handleColor(event) {
        this._set(event.target.dataset.path, event.detail.value);
    }

    handleSelect(event) {
        const row = SELECT_ROWS.find(
            (r) => r.key === event.target.dataset.key
        );
        let v = event.target.value;
        if (row && row.emptyAsNull && v === '') {
            v = null;
        }
        this._set(row.path, v);
    }

    handleGlass(event) {
        this._set('effects.glass', event.target.checked);
    }

    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    async handleSave() {
        await this._persist(this.isEdit ? this.themeId : null);
    }

    async handleSaveAsNew() {
        await this._persist(null);
    }

    async _persist(recordId) {
        if (this.saveDisabled) {
            return;
        }
        this.saving = true;
        this.error = '';
        try {
            const id = await saveCustomTheme({
                themeId: recordId,
                name: this.name.trim(),
                baseTheme: this.baseKey || null,
                themeJson: JSON.stringify(this._props)
            });
            this.dispatchEvent(
                new CustomEvent('save', {
                    detail: { id, name: this.name.trim() }
                })
            );
        } catch (e) {
            this.error =
                (e && e.body && e.body.message) ||
                'The theme could not be saved.';
        } finally {
            this.saving = false;
        }
    }
}
