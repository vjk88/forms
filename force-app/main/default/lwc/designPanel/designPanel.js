import { LightningElement, api } from 'lwc';
import { resolveTheme, THEMES, THEME_CATALOG, contrastRatio } from 'c/formThemes';
import { LAYOUT_GROUPS, LAYOUT_LABELS } from 'c/layoutModel';

/**
 * c/designPanel — the FormStudio Design-mode settings panel, built to the
 * design-settings.html blueprint: 4 pillars (Canvas · Brand · Fields · Flow).
 *
 * Contract: ONE object in (`design`), ONE event out (`change`). The host
 * (c/formStudio) owns the design state and the live preview; this panel is the
 * control surface. Almost every control maps to an already-supported token/spec:
 *   - scope 'theme'  → studioMeta.customTheme overrides (Phase-0 override lane)
 *   - scope 'shell'  → Layout_Spec__c shell overlay (maxWidth/chrome/progress/…)
 *   - scope 'layout' | 'spacing' | 'accent' | 'preset' | 'responsive'
 *   - scope 'header' | 'buttons' | 'after' → studioMeta blocks
 *
 * @fires change detail { scope, key, value }
 */
const PRESET_IDS = ['nordic', 'cloud', 'lavender', 'slate', 'terracotta', 'tokyo'];

export default class DesignPanel extends LightningElement {
    @api activeTab = 'canvas'; // canvas | brand | type | flow
    @api design = {};
    @api uploading = false; // host sets true while a header image is uploading

    // ---------------------------------------------------------- tab routing
    get isCanvas() { return this.activeTab !== 'brand' && this.activeTab !== 'type' && this.activeTab !== 'flow'; }
    get isBrand() { return this.activeTab === 'brand'; }
    get isType() { return this.activeTab === 'type'; }
    get isFlow() { return this.activeTab === 'flow'; }

    // ---------------------------------------------------------- state slices
    get _ct() { return this.design.customTheme || {}; }
    get _sh() { return this.design.shell || {}; }
    get _hdr() { return this.design.header || {}; }
    get _btn() { return this.design.buttons || {}; }
    get _aft() { return this.design.after || {}; }
    // The resolved theme — seeds the color pickers with the theme's real values.
    get rt() {
        try {
            return resolveTheme(this.design.themeId, this.design.skinId, {
                accent: this.design.accent || undefined,
                overrides: this._ct
            }) || {};
        } catch (e) {
            return {};
        }
    }
    _hex(v) { return typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : ''; }

    // ---------------------------------------------------------- contextual reveal
    get isStepper() { return this.design.layout === 'stepper'; }
    get hasBrandPanel() { return this.design.layout === 'splitHero' || this.design.layout === 'sideNav'; }
    get isMultiPage() { return !!this.design.isMultiPage; }
    get notBrandPanel() { return !this.hasBrandPanel; }

    // ---------------------------------------------------------- options
    get layoutOptions() {
        return LAYOUT_GROUPS.flatMap((g) =>
            g.layouts.map((id) => ({
                value: id,
                label: `${LAYOUT_LABELS[id] || id} · ${g.label}`,
                selected: id === this.design.layout
            }))
        );
    }
    get presets() {
        return PRESET_IDS.map((id) => {
            const t = THEME_CATALOG.find((c) => c.id === id) || { id, label: id };
            return { id, label: t.label, cls: this.design.themeId === id ? 'preset is-on' : 'preset' };
        });
    }
    // The full theme roster for the Design-mode picker (not just the 6 quick chips).
    get themeOptions() {
        const cur = this.design.themeId;
        return THEME_CATALOG.map((t) => ({ value: t.id, label: t.label, selected: t.id === cur }));
    }
    get currentThemeLabel() {
        const t = THEME_CATALOG.find((c) => c.id === this.design.themeId);
        return (t && t.label) || 'Theme';
    }
    onThemePick(e) { this._emit('preset', null, e.target.value); }
    _seg(list, current) {
        return list.map((o) => ({ ...o, cls: o.value === current ? 'seg is-on' : 'seg' }));
    }
    _sel(list, current) {
        return list.map((o) => ({ ...o, selected: o.value === current }));
    }

    // ---- Canvas
    get maxWidthSeg() {
        return this._seg([
            { value: 'narrow', label: 'Narrow' }, { value: 'medium', label: 'Medium' },
            { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full' }
        ], this._sh.maxWidth || 'narrow');
    }
    get chromeSeg() {
        return this._seg([
            { value: 'card', label: 'Card' }, { value: 'fullbleed', label: 'Fullbleed' },
            { value: 'paper', label: 'Paper' }
        ], this._sh.chrome || 'card');
    }
    get sectionStyleOpts() {
        return this._sel([
            { value: 'card', label: 'Default card sections' }, { value: 'subtle', label: 'Subtle (no border)' },
            { value: 'plain', label: 'Plain borderless' }, { value: 'boxed', label: 'Boxed outline' }
        ], this._ct.sectionDefault || 'card');
    }
    get sectionPadOpts() {
        return this._sel([
            { value: 'none', label: 'None' }, { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }
        ], this._ct.sectionPadding || 'medium');
    }
    get densitySeg() {
        return this._seg([
            { value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }
        ], this.design.spacing || 'comfortable');
    }
    get stepperPlacementSeg() {
        return this._seg([
            { value: 'top', label: 'Top card' }, { value: 'rail', label: 'Brand rail' }
        ], this._sh.stepperPlacement || 'top');
    }
    get stepperModeOpts() {
        return this._sel([
            { value: 'horizontal', label: 'Horizontal steps' }, { value: 'vertical', label: 'Vertical steps' },
            { value: 'progress', label: 'Progress ring' }
        ], this._sh.stepperMode || 'horizontal');
    }
    get progressOpts() {
        return this._sel([
            { value: 'auto', label: 'Auto-detect' }, { value: 'bar', label: 'Linear bar' },
            { value: 'dots', label: 'Step dots' }, { value: 'fraction', label: 'Fractional (1/3)' },
            { value: 'none', label: 'None' }
        ], this._sh.progress || 'auto');
    }
    get breakpointOpts() {
        return this._sel([
            { value: '768px', label: 'Tablet (768px)' }, { value: '480px', label: 'Mobile (480px)' },
            { value: '1024px', label: 'Desktop small (1024px)' }
        ], (this.design.responsive || {}).collapseBelow || '768px');
    }
    get radiusVal() { return parseInt(this._ct.radius, 10) || 10; }
    get radiusLabel() { return `${this.radiusVal}px`; }
    get shadowOpts() {
        return this._sel([
            { value: '0 8px 24px rgba(0,0,0,0.05)', label: 'Soft shadow' },
            { value: '0 16px 40px rgba(0,0,0,0.12)', label: 'Strong elevation' },
            { value: 'none', label: 'Flat (no shadow)' }
        ], this._ct.shadow || '0 8px 24px rgba(0,0,0,0.05)');
    }
    get glassOn() { return !!this._ct.glass; }
    get cPageBg() { return this._hex(this._ct.pageBg) || this._hex(this.rt.pageBg) || '#f3f4f6'; }
    get cSurface() { return this._hex(this._ct.surface) || this._hex(this.rt.surface) || '#ffffff'; }

    // ---- Brand
    get headerStyleOpts() {
        return this._sel([
            { value: 'standard', label: 'Standard header' }, { value: 'hero', label: 'Hero accent banner' },
            { value: 'minimal', label: 'Minimalist' }, { value: 'none', label: 'No header' }
        ], this._sh.headerStyle || 'standard');
    }
    get arrangementOpts() {
        return this._sel([
            { value: 'stacked', label: 'Stacked (logo on top)' }, { value: 'inline', label: 'Inline (logo beside title)' },
            { value: 'logoBeside', label: 'Logo beside block' }, { value: 'textOnly', label: 'Text only (hide logo)' }
        ], this._hdr.arrangement || 'stacked');
    }
    get emblemOpts() {
        return this._sel([
            { value: '', label: 'None' }, { value: 'triangle', label: 'Triangle' }, { value: 'shield', label: 'Shield' },
            { value: 'globe', label: 'Globe' }, { value: 'leaf', label: 'Leaf' }, { value: 'aperture', label: 'Aperture' },
            { value: 'coffee', label: 'Coffee' }, { value: 'cross', label: 'Cross' }
        ], this._hdr.emblem || '');
    }
    get cHeaderBg() { return this._hex(this._ct.headerBg) || this._hex(this.rt.headerBg) || '#1e3a8a'; }
    get logoUploadLabel() { return this._hdr.logo ? 'Replace logo' : 'Upload logo'; }
    get bannerUploadLabel() { return this._hdr.bgImage ? 'Replace banner' : 'Upload banner'; }
    get titleVal() { return this._hdr.title || ''; }
    get descVal() { return this._hdr.description || ''; }
    get highlightVal() { return this._hdr.highlight || ''; }
    get brandSideRight() { return this._sh.brandSide === 'right'; }
    get brandWidthVal() { return parseInt(this._sh.brandWidth, 10) || 42; }
    get brandWidthLabel() { return `${this.brandWidthVal}%`; }
    get brandSticky() { return !!this._sh.brandSticky; }
    get brandContent() {
        const set = new Set(this._sh.brandContent || ['logo', 'title', 'description']);
        return [
            { key: 'logo', label: 'Brand logo / emblem' }, { key: 'title', label: 'Form title' },
            { key: 'description', label: 'Description' }, { key: 'progress', label: 'Progress tracker' },
            { key: 'quote', label: 'Quote / testimonial' }
        ].map((o) => ({ ...o, checked: set.has(o.key) }));
    }

    // ---- Type & Fields
    get cText() { return this._ct.text || this.rt.text || '#1f2937'; }
    get cTextMuted() { return this._ct.textMuted || this.rt.textMuted || '#63738e'; }
    get cHeaderText() { return this._ct.headerText || this.rt.headerText || '#16325c'; }
    get inputStyleOpts() {
        return this._sel([
            { value: 'outline', label: 'Standard outline' }, { value: 'underline', label: 'Boutique underline' },
            { value: 'filled', label: 'Flat filled' }
        ], this._ct.inputStyle || 'outline');
    }
    get labelStyleOpts() {
        return this._sel([
            { value: 'default', label: 'Default label' }, { value: 'mono-caps', label: 'Uppercase mono' },
            { value: 'muted-sm', label: 'Muted small' }
        ], this._ct.labelStyle || 'default');
    }
    get labelPosSeg() {
        return this._seg([
            { value: 'top', label: 'Top stacked' }, { value: 'left', label: 'Left aligned' }
        ], this._ct.labelPosition || 'top');
    }
    get controlScaleVal() { return Number(this._ct.controlScale) || 1; }
    get controlScaleLabel() { return `${this.controlScaleVal.toFixed(1)}x`; }
    get cBorder() { return this._ct.border || this.rt.borderColor || '#d8dde6'; }
    get cBorderLight() { return this._ct.borderLight || this.rt.borderLight || '#e5e7eb'; }
    get borderWidthVal() { return this._ct.borderWidth != null ? Number(this._ct.borderWidth) : 1; }
    get borderWidthLabel() { return `${this.borderWidthVal}px`; }
    get borderStyleOpts() {
        return this._sel([
            { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' },
            { value: 'double', label: 'Double' }, { value: 'none', label: 'None' }
        ], this._ct.borderStyle || 'solid');
    }
    get textureOpts() {
        return this._sel([
            { value: 'none', label: 'None' }, { value: 'grain', label: 'Paper grain' }, { value: 'grid', label: 'Grid mesh' }
        ], this._ct.texture || 'none');
    }
    get meshOn() { return this._ct.bgEffect === 'mesh'; }
    get panelDecorOn() { return this._ct.panelDecor === 'frame'; }

    // ---- Flow
    get cAccent() { return this._hex(this.design.accent) || this._hex(this.rt.accent) || '#6366f1'; }
    get cAccentText() { return this._ct.accentText || this.rt.accentText || '#ffffff'; }
    get contrast() {
        try {
            const r = contrastRatio(this.cAccent, this.cAccentText);
            const pass = r >= 4.5;
            return {
                cls: pass ? 'contrast-badge pass' : 'contrast-badge fail',
                text: `${r.toFixed(1)}:1 ${pass ? 'Pass (AA)' : 'Low contrast'}`
            };
        } catch (e) {
            return { cls: 'contrast-badge', text: '' };
        }
    }
    get submitLabelVal() { return this._btn.submitLabel || 'Submit'; }
    get nextLabelVal() { return this._btn.nextLabel || 'Next'; }
    get backLabelVal() { return this._btn.backLabel || 'Back'; }
    get alignSeg() {
        return this._seg([
            { value: 'left', label: 'Left' }, { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' }, { value: 'stretch', label: 'Stretch' }
        ], this._btn.alignment || 'right');
    }
    get submitPlacementOpts() {
        return this._sel([
            { value: 'flow', label: 'Inline with flow' }, { value: 'stickyBottom', label: 'Sticky bottom bar' },
            { value: 'brandPanel', label: 'Inside brand rail' }
        ], this._sh.submitPlacement || 'flow');
    }
    get afterSeg() {
        return this._seg([
            { value: 'message', label: 'Message' }, { value: 'redirect', label: 'Redirect' }
        ], this._aft.action || 'message');
    }
    get afterIsRedirect() { return (this._aft.action || 'message') === 'redirect'; }
    get afterMessageVal() { return this._aft.message || ''; }
    get redirectUrlVal() { return this._aft.redirectUrl || ''; }

    // ---------------------------------------------------------- emit
    _emit(scope, key, value) {
        this.dispatchEvent(new CustomEvent('change', { detail: { scope, key, value } }));
    }
    // generic value handlers (read data-key off the control)
    onTheme(e) { this._emit('theme', e.target.dataset.key, e.target.value); }
    onThemeSeg(e) { this._emit('theme', e.currentTarget.dataset.key, e.currentTarget.dataset.value); }
    onShell(e) { this._emit('shell', e.target.dataset.key, e.target.value); }
    onShellSeg(e) { this._emit('shell', e.currentTarget.dataset.key, e.currentTarget.dataset.value); }
    onShellToggle(e) { this._emit('shell', e.target.dataset.key, e.target.checked); }
    onHeader(e) { this._emit('header', e.target.dataset.key, e.target.value); }
    // Header image assets (logo / banner) — pass the File up; the host owns the
    // ContentVersion upload and clears the input so the same file can be re-picked.
    onHeaderFile(e) {
        const kind = e.target.dataset.kind;
        const file = e.target.files && e.target.files[0];
        if (file) this._emit('headerAsset', kind, file);
        e.target.value = '';
    }
    onHeaderAssetRemove(e) { this._emit('headerAsset', e.currentTarget.dataset.kind, null); }
    onButtons(e) { this._emit('buttons', e.target.dataset.key, e.target.value); }
    onBtnAlign(e) { this._emit('buttons', 'alignment', e.currentTarget.dataset.value); }
    onAfter(e) { this._emit('after', e.target.dataset.key, e.target.value); }
    onAfterAction(e) { this._emit('after', 'action', e.currentTarget.dataset.value); }

    // specific
    onLayout(e) { this._emit('layout', null, e.target.value); }
    onDensity(e) { this._emit('spacing', null, e.currentTarget.dataset.value); }
    onPreset(e) { this._emit('preset', null, e.currentTarget.dataset.id); }
    onAccent(e) { this._emit('accent', null, e.target.value); }
    onBreakpoint(e) { this._emit('responsive', 'collapseBelow', e.target.value); }
    onRadius(e) { this._emit('theme', 'radius', `${e.target.value}px`); }
    onControlScale(e) { this._emit('theme', 'controlScale', Number(e.target.value)); }
    onBorderWidth(e) { this._emit('theme', 'borderWidth', Number(e.target.value)); }
    onGlass(e) { this._emit('theme', 'glass', e.target.checked); }
    onMesh(e) { this._emit('theme', 'bgEffect', e.target.checked ? 'mesh' : null); }
    onPanelDecor(e) { this._emit('theme', 'panelDecor', e.target.checked ? 'frame' : null); }
    onBrandContent() {
        const vals = [...this.template.querySelectorAll('.brand-content-cb')]
            .filter((b) => b.checked).map((b) => b.dataset.key);
        this._emit('shell', 'brandContent', vals);
    }
}
