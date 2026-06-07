import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import uploadImage from '@salesforce/apex/FormAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FormAssetController.deleteImage';
import { RADIUS_OPTIONS, SECTION_STYLE_OPTIONS, LAYOUT_TEMPLATES, FONT_OPTIONS } from 'c/formThemes';

// Curated set of SLDS utility icons offered for section headers.
const SECTION_ICONS = [
    'user', 'groups', 'people', 'identity', 'company', 'contact_request',
    'info', 'announcement', 'knowledge_base', 'note', 'description',
    'settings', 'dashboard', 'apps', 'home', 'location', 'checkin', 'world',
    'travel_and_places', 'call', 'email', 'chat', 'feed', 'bell',
    'cart', 'currency', 'moneybag', 'products', 'calendar', 'event', 'clock',
    'date_input', 'file', 'attach', 'upload', 'link', 'checklist', 'task',
    'success', 'approval', 'contract', 'lock', 'shield', 'privately_shared',
    'case', 'question', 'help', 'priority', 'warning', 'flag',
    'favorite', 'heart', 'rating', 'edit', 'form', 'list', 'rows', 'table',
    'filter', 'search', 'picklist_type'
];

const GRADIENT_PRESETS = [
    { label: 'Emerald Forest', value: 'linear-gradient(160deg, #059669 0%, #064e3b 100%)', style: 'background: linear-gradient(160deg, #059669, #064e3b);' },
    { label: 'Dusk Velvet', value: 'linear-gradient(135deg, #7c3aed 0%, #1e1b4b 100%)', style: 'background: linear-gradient(135deg, #7c3aed, #1e1b4b);' },
    { label: 'Sunset Glow', value: 'linear-gradient(135deg, #ff8fb1 0%, #7a5cff 100%)', style: 'background: linear-gradient(135deg, #ff8fb1, #7a5cff);' },
    { label: 'Ocean Breeze', value: 'linear-gradient(135deg, #22d3ee 0%, #0652dd 100%)', style: 'background: linear-gradient(135deg, #22d3ee, #0652dd);' },
    { label: 'Warm Amber', value: 'linear-gradient(135deg, #fbbf24 0%, #dc2626 100%)', style: 'background: linear-gradient(135deg, #fbbf24, #dc2626);' },
    { label: 'Midnight Blue', value: 'linear-gradient(180deg, #3b82f6 0%, #0f172a 100%)', style: 'background: linear-gradient(180deg, #3b82f6, #0f172a);' },
    { label: 'Clean Slate', value: 'linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)', style: 'background: linear-gradient(135deg, #f1f5f9, #94a3b8);' },
    { label: 'Orchid Dream', value: 'linear-gradient(135deg, #f472b6 0%, #6d28d9 100%)', style: 'background: linear-gradient(135deg, #f472b6, #6d28d9);' }
];

/**
 * Convert an rgb(r, g, b) or rgba(r, g, b, a) string to a 7-char hex string.
 * Returns null if the string isn't a valid rgb/rgba expression.
 */
function rgbToHex(rgbStr) {
    const match = rgbStr.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\)/);
    if (!match) return null;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

/**
 * Coerce any CSS colour token into a 7-char hex string that <input type="color">
 * can accept. Handles #hex (3, 4, 6, 8 chars), rgb(), rgba(), and bare strings.
 */
function normalizeColor(color) {
    if (!color || color === 'transparent' || color === 'none') return '#ffffff';
    const trimmed = color.trim();
    if (trimmed.startsWith('#')) {
        if (trimmed.length === 4 || trimmed.length === 7) return trimmed.toLowerCase();
        const hexMatch = trimmed.match(/#[0-9a-fA-F]{3,6}/);
        if (hexMatch) return hexMatch[0].toLowerCase();
    }
    if (trimmed.startsWith('rgb')) {
        const hex = rgbToHex(trimmed);
        if (hex) return hex;
    }
    return '#ffffff';
}

/**
 * Parse a CSS background value into a config object.
 * Uses regex to extract colours (handles hex AND rgb()) instead of
 * comma-splitting, which breaks on rgb(r, g, b) values.
 */
function parseBackground(bg, defaultSolid = '#f4f6f9') {
    const defaultVal = {
        isGradient: false,
        type: 'linear',
        angle: 135,
        startColor: defaultSolid,
        endColor: '#cbd5e1',
        solidColor: defaultSolid
    };
    if (!bg) return defaultVal;

    const val = bg.trim();
    if (val.includes('gradient')) {
        const isLinear = val.includes('linear-gradient');

        // Extract angle / direction keyword
        let angle = 135;
        const angleMatch = val.match(/\b(\d+)deg\b/);
        if (angleMatch) {
            angle = parseInt(angleMatch[1], 10);
        } else {
            // Longer keywords first so "to top" doesn't match before "to top right"
            const directions = [
                ['to top right', 45],
                ['to bottom right', 135],
                ['to bottom left', 225],
                ['to top left', 315],
                ['to top', 0],
                ['to right', 90],
                ['to bottom', 180],
                ['to left', 270]
            ];
            for (const [dir, deg] of directions) {
                if (val.includes(dir)) { angle = deg; break; }
            }
        }

        // Extract colours with a regex that matches #hex AND rgb()/rgba()
        const colorRegex = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g;
        const colors = val.match(colorRegex) || [];

        let startColor = defaultSolid;
        let endColor = '#cbd5e1';
        if (colors.length >= 2) {
            startColor = colors[0];
            endColor = colors[colors.length - 1];
        } else if (colors.length === 1) {
            startColor = colors[0];
            endColor = colors[0];
        }

        return {
            isGradient: true,
            type: isLinear ? 'linear' : 'radial',
            angle,
            startColor: normalizeColor(startColor),
            endColor: normalizeColor(endColor),
            solidColor: normalizeColor(startColor)
        };
    }

    return {
        ...defaultVal,
        isGradient: false,
        solidColor: normalizeColor(val),
        startColor: normalizeColor(val),
        endColor: normalizeColor(val)
    };
}

function buildBackground(config) {
    if (!config.isGradient) {
        return config.solidColor;
    }
    if (config.type === 'linear') {
        return `linear-gradient(${config.angle}deg, ${config.startColor} 0%, ${config.endColor} 100%)`;
    }
    return `radial-gradient(circle, ${config.startColor} 0%, ${config.endColor} 100%)`;
}

export default class PropertyPanel extends LightningElement {
    @api formId;
    @track _selection = null;

    @api
    get selection() {
        return this._selection;
    }
    set selection(value) {
        this._selection = value ? { ...value } : null;
    }

    get hasSelection() {
        return !!this._selection;
    }

    get isHeaderSelected() {
        return this._selection && this._selection.type === 'header';
    }

    get isPageSelected() {
        return this._selection && this._selection.type === 'page';
    }

    get isFormSettingsSelected() {
        return this._selection && this._selection.type === 'formSettings';
    }

    // --- Form Settings accordion (progressive disclosure) ---

    // Page getters
    get pageName() { return this._selection?.name || ''; }
    get pageShowInProgress() { return this._selection?.showInProgress !== false; }
    get pageNextLabel() { return this._selection?.nextLabel || 'Next'; }
    get pageSubmitLabel() { return this._selection?.submitLabel || 'Submit'; }
    get pageIsLastPage() { return !!this._selection?.isLastPage; }
    get pageIsMultiPage() { return !!this._selection?.isMultiPage; }
    // Show the "Next" label control on any non-last page of a multi-page form
    get pageShowNextLabel() { return this.pageIsMultiPage && !this.pageIsLastPage; }

    // Unified Form settings getters & options
    get formFontFamily() { return this._selection?.fontFamily || 'default'; }
    get submitLabel() { return this._selection?.submitLabel || 'Submit'; }
    get captchaRequired() { return this._selection?.captchaRequired || false; }
    get formTheme() { return this._selection?.theme?.name || this._selection?.themeName || 'default'; }
    // The gallery highlights by LAYOUT, so skin tweaks (which flip name to
    // 'custom') don't deselect the chosen structure.
    get formLayout() { return this._selection?.theme?.layout || 'classic'; }
    get themeFont() { return this._selection?.theme?.font || 'enterprise'; }
    get fontOptions() { return FONT_OPTIONS; }
    get themeGlass() { return !!this._selection?.theme?.glass; }
    get formLayoutMode() { return this._selection?.layoutMode || 'Single_Page'; }
    get isMultiPageForm() { return this.formLayoutMode !== 'Single_Page'; }
    get isVerticalNavForm() { return this.formLayoutMode === 'Vertical_Navigation'; }
    get isNavigationalForm() { return this.formLayoutMode === 'Vertical_Navigation' || this.formLayoutMode === 'Top_Navigation'; }
    get validateOnNavigate() { return this._selection?.validateOnNavigate || false; }
    get afterSubmitMode() { return this._selection?.afterSubmitMode || 'Screen'; }
    get isScreenMode() { return this.afterSubmitMode === 'Screen'; }
    get isToastMode() { return this.afterSubmitMode === 'ToastAndGo'; }
    get toastTarget() { return this._selection?.toastAndGoTarget || 'Record'; }
    get toastIsCustom() { return this.toastTarget === 'Custom'; }
    get toastUrl() { return this._selection?.toastAndGoUrl || ''; }
    get autoRedirect() { return this._selection?.autoRedirect || false; }
    get redirectTarget() { return this._selection?.redirectTarget || 'Record'; }
    get redirectIsCustom() { return this.redirectTarget === 'Custom'; }
    get redirectUrl() { return this._selection?.redirectUrl || ''; }
    get redirectDelay() { return this._selection?.redirectDelay || 5; }
    get showActionButton() { return this._selection?.showActionButton || false; }
    get actionButtonLabel() { return this._selection?.actionButtonLabel || 'Continue'; }
    get actionTarget() { return this._selection?.actionButtonTarget || 'Record'; }
    get actionIsCustom() { return this.actionTarget === 'Custom'; }
    get actionUrl() { return this._selection?.actionButtonUrl || ''; }
    get thankYouMessage() { return this._selection?.thankYouMessage || ''; }

    get radiusOptions() {
        return RADIUS_OPTIONS;
    }

    // --- Theme detail getters ---
    get themeAccent() {
        return this._selection?.theme?.accent || '#0176d3';
    }
    get themeRadius() {
        return this._selection?.theme?.radius || 'rounded';
    }
    get themeSubmitColor() {
        return this._selection?.theme?.submitColor || this.themeAccent;
    }
    get themeBackColor() {
        return this._selection?.theme?.backColor || this.themeAccent;
    }
    get themePageBg() {
        return this._selection?.theme?.pageBg || '#f4f6f9';
    }

    get themeSurface() {
        return this._selection?.theme?.surface || '#ffffff';
    }

    get gradientTypeOptions() {
        return [
            { label: 'Linear', value: 'linear' },
            { label: 'Radial', value: 'radial' }
        ];
    }

    // --- Page Background Gradient Designer Getters ---
    get pageBgPresets() { return GRADIENT_PRESETS; }
    get pageBgParsed() { return parseBackground(this.themePageBg, '#f4f6f9'); }
    get isPageBgGradient() { return this.pageBgParsed.isGradient; }
    get pageBgMode() { return this.isPageBgGradient ? 'gradient' : 'solid'; }
    get isPageBgLinear() { return this.pageBgParsed.type === 'linear'; }
    get pageBgSolidColor() { return this.pageBgParsed.solidColor; }
    get pageBgStartColor() { return this.pageBgParsed.startColor; }
    get pageBgEndColor() { return this.pageBgParsed.endColor; }
    get pageBgAngle() { return this.pageBgParsed.angle; }
    get pageBgType() { return this.pageBgParsed.type; }

    get pageBgSolidBtnClass() {
        return `slds-button slds-button_neutral toggle-btn${!this.isPageBgGradient ? ' is-active' : ''}`;
    }
    get pageBgGradientBtnClass() {
        return `slds-button slds-button_neutral toggle-btn${this.isPageBgGradient ? ' is-active' : ''}`;
    }

    // --- Card Background Gradient Designer Getters ---
    get cardBgPresets() { return GRADIENT_PRESETS; }
    get cardBgParsed() { return parseBackground(this.themeSurface, '#ffffff'); }
    get isCardBgGradient() { return this.cardBgParsed.isGradient; }
    get cardBgMode() { return this.isCardBgGradient ? 'gradient' : 'solid'; }
    get isCardBgLinear() { return this.cardBgParsed.type === 'linear'; }
    get cardBgSolidColor() { return this.cardBgParsed.solidColor; }
    get cardBgStartColor() { return this.cardBgParsed.startColor; }
    get cardBgEndColor() { return this.cardBgParsed.endColor; }
    get cardBgAngle() { return this.cardBgParsed.angle; }
    get cardBgType() { return this.cardBgParsed.type; }

    get cardBgSolidBtnClass() {
        return `slds-button slds-button_neutral toggle-btn${!this.isCardBgGradient ? ' is-active' : ''}`;
    }
    get cardBgGradientBtnClass() {
        return `slds-button slds-button_neutral toggle-btn${this.isCardBgGradient ? ' is-active' : ''}`;
    }
    get themeHeaderStyle() {
        return this._selection?.theme?.headerStyle || 'inherit';
    }
    get headerStyleOptions() {
        return [
            { label: 'Match template', value: 'inherit' },
            { label: 'Clean (Transparent)', value: 'clean' },
            { label: 'Card (Framed)', value: 'card' },
            { label: 'Accent tint', value: 'tint' },
            { label: 'Frosted glass', value: 'glass' }
        ];
    }
    get themeSectionStyle() {
        return this._selection?.theme?.sectionDefault || 'card';
    }
    get globalSectionStyleOptions() {
        return [
            { label: 'Card (border + header)', value: 'card' },
            { label: 'Subtle (bold header, no border)', value: 'subtle' },
            { label: 'Plain (no border, minimal)', value: 'plain' },
            { label: 'Boxed (strong frame)', value: 'boxed' }
        ];
    }
    get themeSectionPadding() {
        return this._selection?.theme?.sectionPadding || 'medium';
    }
    get themeSectionHeaderBg() {
        return this._selection?.theme?.sectionHeaderBg || '#f3f3f3';
    }
    get themeSectionHeaderBgColorOnly() {
        const val = this.themeSectionHeaderBg;
        if (val && val.startsWith('#') && (val.length === 4 || val.length === 7)) return val;
        return '#f3f3f3';
    }
    get isWizardSelected() {
        return this.formLayoutMode === 'Multi_Page_Wizard';
    }
    get progressTrackerType() {
        return this._selection?.progressTrackerType || 'Progress_Bar';
    }
    get progressTrackerOptions() {
        return [
            { label: 'Progress Bar', value: 'Progress_Bar' },
            { label: 'Step Circles (SLDS)', value: 'Step_Circles' },
            { label: 'Breadcrumbs (SLDS)', value: 'Breadcrumbs' }
        ];
    }
    get showSummaryPage() {
        return !!this._selection?.showSummaryPage;
    }

    get formWidth() {
        const val = this._selection?.formWidth;
        if (val === undefined || val === null) return 100;
        if (val > 100) return 100; // treat old px widths as 100%
        return val;
    }

    get navStyleOptions() {
        // Single page is included so a form can be converted single <-> multi
        // page from here — the only place that switch is exposed.
        return [
            { label: "Single page (no navigation)", value: "Single_Page" },
            { label: "Wizard (one page at a time)", value: "Multi_Page_Wizard" },
            { label: "Vertical Navigation menu", value: "Vertical_Navigation" },
            { label: "Top Navigation tabs", value: "Top_Navigation" }
        ];
    }

    get afterSubmitModeOptions() {
        return [
            { label: 'Show a completion screen', value: 'Screen' },
            { label: 'Toast & go straight to record / URL', value: 'ToastAndGo' }
        ];
    }

    get destinationOptions() {
        return [
            { label: 'The new / updated record', value: 'Record' },
            { label: 'Custom URL', value: 'Custom' }
        ];
    }

    get tokenHint() {
        return 'Tip: use {recordId} or {objectApiName} in a custom URL.';
    }

    // --- Visual picker cards (replace plain radios so the difference is obvious) ---
    get navStyleCards() {
        const current = this.formLayoutMode;
        const defs = [
            { value: 'Single_Page', label: 'Single page', desc: 'Everything on one scroll', icon: 'utility:page' },
            { value: 'Multi_Page_Wizard', label: 'Wizard', desc: 'One step at a time', icon: 'utility:steps' },
            { value: 'Vertical_Navigation', label: 'Vertical nav', desc: 'Side menu of pages', icon: 'utility:side_list' },
            { value: 'Top_Navigation', label: 'Top tabs', desc: 'Horizontal tab navigation', icon: 'utility:tabset' }
        ];
        return defs.map((d) => ({
            ...d,
            cardClass: d.value === current ? 'pick-card is-selected' : 'pick-card'
        }));
    }

    handleNavStyleCard(event) {
        this.fireFormSettingChange('layoutMode', event.currentTarget.dataset.value);
    }

    get afterSubmitCards() {
        const current = this.afterSubmitMode;
        const defs = [
            { value: 'Screen', label: 'Completion screen', desc: 'Show a thank-you page', icon: 'utility:success' },
            { value: 'ToastAndGo', label: 'Toast & go', desc: 'Pop a toast, jump to record / URL', icon: 'utility:forward' }
        ];
        return defs.map((d) => ({
            ...d,
            cardClass: d.value === current ? 'pick-card is-selected' : 'pick-card'
        }));
    }

    handleAfterSubmitCard(event) {
        this.fireFormSettingChange('afterSubmitMode', event.currentTarget.dataset.value);
    }

    // Visual template gallery — picking a tile applies that layout's template.
    handleTemplateSelect(event) {
        const name = event.detail && event.detail.name;
        this.fireFormSettingChange(
            'theme',
            { ...(LAYOUT_TEMPLATES[name] || LAYOUT_TEMPLATES.classic) }
        );
    }

    handlePagePropChange(event) {
        const prop = event.currentTarget.dataset.prop;
        this.firePageChange(prop, event.detail.value);
    }

    handlePageCheckboxChange(event) {
        const prop = event.currentTarget.dataset.prop;
        this.firePageChange(prop, event.detail.checked);
    }

    firePageChange(property, value) {
        this._selection = { ...this._selection, [property]: value };
        this.dispatchEvent(new CustomEvent('propertychange', {
            detail: {
                selectionType: 'page',
                index: this._selection.index,
                property,
                value
            }
        }));
    }

    handleFormSettingChange(event) {
        const prop = event.currentTarget.dataset.prop;
        this.fireFormSettingChange(prop, event.detail.value);
    }

    handleFormSettingCheckbox(event) {
        const prop = event.currentTarget.dataset.prop;
        this.fireFormSettingChange(prop, event.detail.checked);
    }

    // Tweaking an individual theme field (accent / radius / button colours)
    // merges into the theme object and marks it "custom".
    handleThemeFieldChange(event) {
        const key = event.currentTarget.dataset.themekey;
        const value = event.detail.value;
        const theme = {
            ...(this._selection?.theme || {}),
            [key]: value,
            name: 'custom'
        };
        this.fireFormSettingChange('theme', theme);
    }

    handleThemeColorChange(event) {
        const key = event.currentTarget.dataset.themekey;
        const value = event.target.value;
        const theme = {
            ...(this._selection?.theme || {}),
            [key]: value,
            name: 'custom'
        };
        this.fireFormSettingChange('theme', theme);
    }

    // --- Page Background Handlers ---
    handlePageBgModeSelect(event) {
        const mode = event.currentTarget.dataset.mode;
        const config = this.pageBgParsed;
        config.isGradient = (mode === 'gradient');
        this.updateThemeBg('pageBg', config);
    }

    handlePageBgPresetSelect(event) {
        const presetVal = event.currentTarget.dataset.value;
        const theme = {
            ...(this._selection?.theme || {}),
            pageBg: presetVal,
            name: 'custom'
        };
        this.fireFormSettingChange('theme', theme);
    }

    handlePageBgParamChange(event) {
        const key = event.currentTarget.dataset.param;
        // Native <input type="color"> sets event.detail to 0 (a Number),
        // so event.detail.value would be undefined — use optional chaining.
        // Lightning components put the value in event.detail.value.
        let val = (event.detail && typeof event.detail === 'object' ? event.detail.value : null)
               ?? event.target?.value;
        if (val == null) return;
        const config = { ...this.pageBgParsed };
        if (key === 'angle') {
            val = parseInt(val, 10) || 0;
        }
        config[key] = val;
        this.updateThemeBg('pageBg', config);
    }

    // --- Card Background Handlers ---
    handleCardBgModeSelect(event) {
        const mode = event.currentTarget.dataset.mode;
        const config = this.cardBgParsed;
        config.isGradient = (mode === 'gradient');
        this.updateThemeBg('surface', config);
    }

    handleCardBgPresetSelect(event) {
        const presetVal = event.currentTarget.dataset.value;
        const theme = {
            ...(this._selection?.theme || {}),
            surface: presetVal,
            name: 'custom'
        };
        this.fireFormSettingChange('theme', theme);
    }

    handleCardBgParamChange(event) {
        const key = event.currentTarget.dataset.param;
        let val = (event.detail && typeof event.detail === 'object' ? event.detail.value : null)
               ?? event.target?.value;
        if (val == null) return;
        const config = { ...this.cardBgParsed };
        if (key === 'angle') {
            val = parseInt(val, 10) || 0;
        }
        config[key] = val;
        this.updateThemeBg('surface', config);
    }

    updateThemeBg(themekey, config) {
        const bgVal = buildBackground(config);
        const theme = {
            ...(this._selection?.theme || {}),
            [themekey]: bgVal,
            name: 'custom'
        };
        this.fireFormSettingChange('theme', theme);
    }

    handleThemeGlass(event) {
        const theme = {
            ...(this._selection?.theme || {}),
            glass: event.detail.checked,
            name: 'custom'
        };
        this.fireFormSettingChange('theme', theme);
    }

    handleFormWidthChange(event) {
        let v = parseInt(event.detail.value, 10);
        if (Number.isNaN(v)) v = 100;
        if (v <= 100) {
            v = Math.min(Math.max(v, 50), 100);
        } else {
            v = Math.min(Math.max(v, 320), 1920);
        }
        this.fireFormSettingChange('formWidth', v);
    }

    handleThankYouMessageChange(event) {
        this.fireFormSettingChange('thankYouMessage', event.detail.value);
    }


    fireFormSettingChange(property, value) {
        this._selection = { ...this._selection, [property]: value };
        this.dispatchEvent(new CustomEvent('propertychange', {
            detail: { selectionType: 'formSettings', property, value }
        }));
    }

    get isSectionSelected() {
        return this._selection && this._selection.type === 'section';
    }

    get isElementSelected() {
        return this._selection && this._selection.type === 'element';
    }

    get showActionFooter() {
        return this.isSectionSelected || this.isElementSelected;
    }

    handleDelete() {
        this.dispatchEvent(new CustomEvent('deleteselection', {
            detail: {
                selectionType: this._selection.type,
                index: this._selection.index,
                sectionIndex: this._selection.sectionIndex,
                relatedIndex: this._selection.relatedIndex,
                elementIndex: this._selection.elementIndex
            }
        }));
    }

    handleDuplicate() {
        this.dispatchEvent(new CustomEvent('duplicateselection', {
            detail: {
                selectionType: this._selection.type,
                index: this._selection.index,
                sectionIndex: this._selection.sectionIndex,
                relatedIndex: this._selection.relatedIndex,
                elementIndex: this._selection.elementIndex
            }
        }));
    }

    get isFieldType() {
        return this._selection && this._selection.elementType === 'Field';
    }

    get isRichTextType() {
        return this._selection && (
            this._selection.elementType === 'Rich_Text' ||
            this._selection.elementType === 'Static_Text'
        );
    }

    get elementPanelTitle() {
        if (this.isRichTextType) return 'Display Text';
        if (this.isFieldType) return 'Field Properties';
        return 'Element Properties';
    }

    get elementContent() {
        return this._selection?.content || '';
    }

    // --- Display component types ---
    get isImageType() { return this._selection?.elementType === 'Image'; }
    get isCalloutType() { return this._selection?.elementType === 'Callout'; }
    get isSpacerType() { return this._selection?.elementType === 'Spacer'; }
    get isConsentType() { return this._selection?.elementType === 'Consent'; }
    get consentRequired() { return this._selection?.consentRequired !== false; }
    handleConsentRequiredChange(e) {
        this.firePropertyChange('consentRequired', e.detail.checked);
    }
    handleConsentContentChange(e) {
        this.firePropertyChange('content', e.detail.value);
    }

    get elementImageUrl() { return this._selection?.imageUrl || ''; }
    get elementImageAlt() { return this._selection?.imageAlt || ''; }
    get elementImageSize() { return this._selection?.imageSize || 'medium'; }
    get imageSizeOptions() {
        return [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
            { label: 'Full width', value: 'full' }
        ];
    }

    get elementCalloutVariant() { return this._selection?.calloutVariant || 'info'; }
    get calloutVariantOptions() {
        return [
            { label: 'Info', value: 'info' },
            { label: 'Success', value: 'success' },
            { label: 'Warning', value: 'warning' },
            { label: 'Error', value: 'error' }
        ];
    }

    get elementSpacerSize() { return this._selection?.spacerSize || 'medium'; }
    get spacerSizeOptions() {
        return [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' }
        ];
    }

    handleElementImageUpload(e) {
        this.uploadAndStore(e.target.files[0], 'imageUrl', 'imageVersionId');
    }
    handleRemoveElementImage() {
        this.removeImage('imageUrl', 'imageVersionId');
    }
    handleImageAltChange(e) { this.firePropertyChange('imageAlt', e.detail.value); }
    handleImageSizeChange(e) { this.firePropertyChange('imageSize', e.detail.value); }
    handleCalloutVariantChange(e) { this.firePropertyChange('calloutVariant', e.detail.value); }
    handleCalloutContentChange(e) { this.firePropertyChange('content', e.detail.value); }
    handleSpacerSizeChange(e) { this.firePropertyChange('spacerSize', e.detail.value); }

    // --- Header getters ---
    get headerVisible() { return this._selection?.visible !== false; }
    get headerTitle() { return this._selection?.title || ''; }
    get headerSubtitle() { return this._selection?.subtitle || ''; }
    get headerShowLogo() { return this._selection?.showLogo || false; }
    get headerLogoUrl() { return this._selection?.logoUrl || ''; }
    get headerLogoSize() { return this._selection?.logoSize || 'medium'; }

    get logoSizeOptions() {
        return [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
            { label: 'Extra Large', value: 'xlarge' }
        ];
    }
    get headerAlignment() { return this._selection?.alignment || 'left'; }
    get headerBackgroundColor() { return this._selection?.backgroundColor || '#ffffff'; }
    get headerBackgroundImage() { return this._selection?.backgroundImage || ''; }
    get headerFontFamily() { return this._selection?.fontFamily || 'default'; }
    get headerTitleSize() { return this._selection?.titleSize || 'large'; }
    get headerTitleColor() { return this._selection?.titleColor || '#1b1c1c'; }
    get headerSubtitleColor() { return this._selection?.subtitleColor || '#706e6b'; }

    get alignmentOptions() {
        return [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' }
        ];
    }

    get fontFamilyOptions() {
        return [
            { label: 'Default (Salesforce Sans)', value: 'default' },
            { label: 'Arial', value: 'Arial, sans-serif' },
            { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
            { label: 'Georgia (serif)', value: 'Georgia, serif' },
            { label: 'Times New Roman (serif)', value: '"Times New Roman", serif' },
            { label: 'Courier (mono)', value: '"Courier New", monospace' },
            { label: 'Verdana', value: 'Verdana, sans-serif' },
            { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' }
        ];
    }

    get titleSizeOptions() {
        return [
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' },
            { label: 'Extra Large', value: 'xlarge' }
        ];
    }

    // --- Section getters ---
    get sectionName() { return this._selection?.name || ''; }
    get sectionColumns() { return String(this._selection?.gridColumns || 1); }
    get sectionShowHeader() { return this._selection?.showHeader !== false; }
    get sectionHeaderColor() { return this._selection?.headerBackgroundColor || '#f3f3f3'; }
    get sectionPadding() { return this._selection?.padding || 'medium'; }
    get sectionStyleValue() { return this._selection?.sectionStyle || 'inherit'; }
    get sectionStyleOptions() { return SECTION_STYLE_OPTIONS; }
    get sectionCollapsible() { return this._selection?.collapsible || false; }
    get sectionCollapsedByDefault() { return this._selection?.collapsedByDefault || false; }
    get sectionDescription() { return this._selection?.description || ''; }

    // --- Section header icon picker ---
    @track iconSearch = '';
    get sectionIcon() { return this._selection?.icon || ''; }
    get hasSectionIcon() { return !!this._selection?.icon; }
    get iconChoices() {
        const term = this.iconSearch.trim().toLowerCase();
        const current = this.sectionIcon;
        return SECTION_ICONS
            .filter((n) => !term || n.includes(term))
            .map((n) => {
                const name = `utility:${n}`;
                const selected = name === current;
                return {
                    name,
                    key: name,
                    buttonClass: selected ? 'icon-choice is-selected' : 'icon-choice'
                };
            });
    }

    // --- Element getters ---
    get elementLabel() { return this._selection?.name || ''; }
    get elementFieldApi() { return this._selection?.fieldApiName || ''; }
    get elementUiBehavior() { return this._selection?.uiBehavior || 'None'; }
    get elementHelpText() { return this._selection?.helpText || ''; }
    get elementPlaceholder() { return this._selection?.placeholder || ''; }

    get isLookupField() {
        return this._selection?.fieldType === 'REFERENCE';
    }

    get elementRenderAs() {
        return this._selection?.renderAs || 'Default';
    }

    get isSliderRender() {
        return this._selection?.renderAs === 'Slider';
    }

    // --- "Render As" live preview (show the control, don't just name it) ---
    get renderAsValue() {
        return this._selection?.renderAs || 'Default';
    }
    get isToggleRender() { return this.renderAsValue === 'Toggle'; }
    get isRadioRender() { return this.renderAsValue === 'Radio_Buttons'; }
    get isDropdownRender() { return this.renderAsValue === 'Dropdown'; }
    get isCheckboxGroupRender() {
        return this.renderAsValue === 'Checkbox_Group' || this.renderAsValue === 'Custom_MultiSelect';
    }
    get isDefaultRender() {
        return this.renderAsValue === 'Default';
    }

    // Sample options for the preview — use the configured custom values if any,
    // otherwise a couple of placeholders so the control has something to show.
    get previewOptions() {
        const opts = (this.customOptions || []).filter((o) => o.label || o.value);
        if (opts.length) {
            return opts.map((o, i) => ({
                label: o.label || o.value || `Option ${i + 1}`,
                value: o.value || o.label || `opt-${i}`
            }));
        }
        return [
            { label: 'Option one', value: 'one' },
            { label: 'Option two', value: 'two' }
        ];
    }
    get previewFirstValue() {
        const o = this.previewOptions[0];
        return o ? o.value : '';
    }
    get elementSliderMin() {
        return this._selection?.sliderMin != null ? this._selection.sliderMin : 0;
    }
    get elementSliderMax() {
        return this._selection?.sliderMax != null ? this._selection.sliderMax : 100;
    }
    get elementSliderStep() {
        return this._selection?.sliderStep != null ? this._selection.sliderStep : 1;
    }
    handleSliderMin(e) { this.firePropertyChange('sliderMin', Number(e.detail.value)); }
    handleSliderMax(e) { this.firePropertyChange('sliderMax', Number(e.detail.value)); }
    handleSliderStep(e) { this.firePropertyChange('sliderStep', Number(e.detail.value)); }

    get uiBehaviorOptions() {
        return [
            { label: 'None (use field permissions)', value: 'None' },
            { label: 'Required', value: 'Required' },
            { label: 'Read Only', value: 'Read_Only' },
            { label: 'Hidden (prefilled, not shown)', value: 'Hidden' }
        ];
    }

    get elementUrlPrefill() {
        return this._selection?.urlPrefillParam || '';
    }
    handleUrlPrefillChange(e) {
        this.firePropertyChange('urlPrefillParam', e.detail.value);
    }

    get renderAsOptions() {
        const fieldType = this._selection?.fieldType || '';
        const options = [{ label: 'Default (from schema)', value: 'Default' }];

        if (['STRING', 'TEXTAREA'].includes(fieldType)) {
            options.push(
                { label: 'Dropdown', value: 'Dropdown' },
                { label: 'Radio Buttons', value: 'Radio_Buttons' },
                { label: 'Checkbox Group', value: 'Checkbox_Group' }
            );
        }
        if (['PICKLIST'].includes(fieldType)) {
            options.push(
                { label: 'Radio Buttons', value: 'Radio_Buttons' },
                { label: 'Dropdown', value: 'Dropdown' }
            );
        }
        if (['MULTIPICKLIST'].includes(fieldType)) {
            options.push(
                { label: 'Checkbox Group', value: 'Checkbox_Group' },
                { label: 'Dropdown (Multi)', value: 'Custom_MultiSelect' }
            );
        }
        if (['BOOLEAN'].includes(fieldType)) {
            options.push(
                { label: 'Toggle', value: 'Toggle' },
                { label: 'Checkbox', value: 'Default' }
            );
        }
        if (['DOUBLE', 'INTEGER', 'CURRENCY', 'PERCENT'].includes(fieldType)) {
            options.push(
                { label: 'Slider', value: 'Slider' }
            );
        }
        if (['REFERENCE'].includes(fieldType)) {
            options.push(
                { label: 'Lookup Typeahead', value: 'Lookup_Typeahead' },
                { label: 'Lookup Modal', value: 'Lookup_Modal' }
            );
        }
        return options;
    }

    get showCustomValues() {
        const renderAs = this._selection?.renderAs || 'Default';
        const fieldType = this._selection?.fieldType || '';
        const customRenders = ['Dropdown', 'Radio_Buttons', 'Checkbox_Group', 'Custom_MultiSelect'];
        if (!customRenders.includes(renderAs)) return false;
        // Show editor for text fields (no native values) or picklists (to filter/override values)
        return ['STRING', 'TEXTAREA', 'PICKLIST', 'MULTIPICKLIST'].includes(fieldType);
    }

    get customValuesHelpText() {
        const fieldType = this._selection?.fieldType || '';
        if (['PICKLIST', 'MULTIPICKLIST'].includes(fieldType)) {
            return 'Override or filter the picklist values for this form. Leave empty to use all values from the schema.';
        }
        return 'Define the options that will appear in the dropdown/radio/checkbox group.';
    }

    get customOptions() {
        try {
            const json = this._selection?.customOptionsJson || '[]';
            const parsed = JSON.parse(json);
            return parsed.map((o, i) => ({ ...o, key: `opt-${i}` }));
        } catch {
            return [];
        }
    }

    get columnOptions() {
        return [
            { label: '1 Column', value: '1' },
            { label: '2 Columns', value: '2' },
            { label: '3 Columns', value: '3' },
            { label: '4 Columns', value: '4' }
        ];
    }

    get paddingOptions() {
        return [
            { label: 'None', value: 'none' },
            { label: 'Small', value: 'small' },
            { label: 'Medium', value: 'medium' },
            { label: 'Large', value: 'large' }
        ];
    }

    // Readable summary of the configured visibility rules, shown on the panel.
    get visibilityDisplay() {
        const expr = this._selection?.visibilityExpression;
        if (!expr) return null;
        let cfg;
        try {
            cfg = JSON.parse(expr);
        } catch {
            return null;
        }
        const rules = cfg.rules || [];
        if (!rules.length) return null;

        const OP = {
            equals: 'equals',
            notEqual: 'does not equal',
            contains: 'contains',
            notContains: 'does not contain',
            startsWith: 'starts with',
            greaterThan: '>',
            lessThan: '<',
            greaterOrEqual: '≥',
            lessOrEqual: '≤',
            isNull: 'is blank',
            isNotNull: 'is not blank'
        };
        const NO_VAL = { isNull: true, isNotNull: true };

        const items = rules.map((r, i) => {
            const op = OP[r.operator] || r.operator;
            const val = NO_VAL[r.operator]
                ? ''
                : ` "${r.value == null ? '' : r.value}"`;
            return {
                key: `vr-${i}`,
                text: `${this.prettyField(r.field)} ${op}${val}`
            };
        });

        const isCustom = cfg.logic === 'custom';
        let logicText = 'Show when ALL are met:';
        if (cfg.logic === 'any') logicText = 'Show when ANY is met:';
        if (isCustom) logicText = 'Show when custom logic is met:';

        return { logicText, items, isCustom, customLogic: cfg.customLogic || '' };
    }

    prettyField(f) {
        if (!f) return '';
        if (f.indexOf('$User.') === 0) return 'User · ' + f.substring(6);
        if (f.indexOf('$Profile.') === 0) return 'Profile · ' + f.substring(9);
        if (f.indexOf('$Form.') === 0) return 'Form · ' + f.substring(6);
        return f;
    }

    // --- Header change handlers ---

    handleHeaderVisibleChange(event) {
        this.firePropertyChange('visible', event.detail.checked);
    }

    handleHeaderPropChange(event) {
        const prop = event.currentTarget.dataset.prop;
        this.firePropertyChange(prop, event.detail.value);
    }

    handleHeaderCheckboxChange(event) {
        const prop = event.currentTarget.dataset.prop;
        this.firePropertyChange(prop, event.detail.checked);
    }

    handleHeaderColorChange(event) {
        const prop = event.currentTarget.dataset.prop;
        const value = event.target.value;
        this.firePropertyChange(prop, value);
    }

    handleLogoUpload(event) {
        this.uploadAndStore(event.target.files[0], 'logoUrl', 'logoVersionId');
    }

    handleRemoveLogo() {
        this.removeImage('logoUrl', 'logoVersionId');
    }

    handleBackgroundUpload(event) {
        this.uploadAndStore(
            event.target.files[0],
            'backgroundImage',
            'backgroundVersionId'
        );
    }

    handleRemoveBackground() {
        this.removeImage('backgroundImage', 'backgroundVersionId');
    }

    /**
     * Read the file, upload it as a Salesforce File via Apex (public only if
     * the form allows guests), and store the returned URL + ContentVersion Id
     * on the header — keeps the layout JSON small and the image accessible.
     */
    uploadAndStore(file, urlProp, versionProp) {
        if (!file) return;
        // Clean up any previously-uploaded image for this slot
        const prevVersionId = this._selection
            ? this._selection[versionProp]
            : null;

        const reader = new FileReader();
        reader.onload = () => {
            uploadImage({
                base64Data: reader.result,
                fileName: file.name,
                formId: this.formId
            })
                .then((res) => {
                    this.firePropertyChange(urlProp, res.url);
                    this.firePropertyChange(versionProp, res.contentVersionId);
                    if (prevVersionId) {
                        deleteImage({ contentVersionId: prevVersionId }).catch(
                            () => {}
                        );
                    }
                })
                .catch((error) => {
                    const msg =
                        (error && error.body && error.body.message) ||
                        'Image upload failed.';
                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Upload failed',
                            message: msg,
                            variant: 'error'
                        })
                    );
                });
        };
        reader.readAsDataURL(file);
    }

    removeImage(urlProp, versionProp) {
        const versionId = this._selection
            ? this._selection[versionProp]
            : null;
        this.firePropertyChange(urlProp, '');
        this.firePropertyChange(versionProp, '');
        if (versionId) {
            deleteImage({ contentVersionId: versionId }).catch(() => {});
        }
    }

    // --- Section/Element change handlers ---

    firePropertyChange(property, value) {
        const detail = {
            selectionType: this._selection.type,
            property,
            value
        };

        if (this._selection.type === 'section') {
            detail.index = this._selection.index;
        } else if (this._selection.type === 'element') {
            detail.sectionIndex = this._selection.sectionIndex;
            detail.elementIndex = this._selection.elementIndex;
        }

        this._selection = { ...this._selection, [property]: value };

        this.dispatchEvent(new CustomEvent('propertychange', { detail }));
    }

    handleSectionNameChange(event) { this.firePropertyChange('name', event.detail.value); }
    handleIconSearch(event) { this.iconSearch = event.target.value; }
    handleSelectSectionIcon(event) {
        this.firePropertyChange('icon', event.currentTarget.dataset.icon);
    }
    handleClearSectionIcon() { this.firePropertyChange('icon', ''); }
    handleShowHeaderChange(event) { this.firePropertyChange('showHeader', event.detail.checked); }
    handleColumnsChange(event) { this.firePropertyChange('gridColumns', parseInt(event.detail.value, 10)); }
    handlePaddingChange(event) { this.firePropertyChange('padding', event.detail.value); }
    handleCollapsibleChange(event) { this.firePropertyChange('collapsible', event.detail.checked); }

    handleSectionColorChange(event) {
        this.firePropertyChange('headerBackgroundColor', event.target.value);
    }

    handleSectionPropChange(event) {
        const prop = event.currentTarget.dataset.prop;
        this.firePropertyChange(prop, event.detail.value);
    }
    handleCollapsedDefaultChange(event) { this.firePropertyChange('collapsedByDefault', event.detail.checked); }
    handleSectionDescChange(event) { this.firePropertyChange('description', event.detail.value); }

    handleElementLabelChange(event) { this.firePropertyChange('name', event.detail.value); }
    handleContentChange(event) { this.firePropertyChange('content', event.detail.value); }
    handleUiBehaviorChange(event) { this.firePropertyChange('uiBehavior', event.detail.value); }
    handleRenderAsChange(event) { this.firePropertyChange('renderAs', event.detail.value); }
    handleHelpTextChange(event) { this.firePropertyChange('helpText', event.detail.value); }
    handlePlaceholderChange(event) { this.firePropertyChange('placeholder', event.detail.value); }

    // --- Custom values editing ---

    handleAddCustomOption() {
        const current = this.customOptions.map(({ label, value }) => ({ label, value }));
        current.push({ label: '', value: '' });
        this.firePropertyChange('customOptionsJson', JSON.stringify(current));
    }

    handleRemoveCustomOption(event) {
        const idx = parseInt(event.currentTarget.dataset.index, 10);
        const current = this.customOptions.map(({ label, value }) => ({ label, value }));
        current.splice(idx, 1);
        this.firePropertyChange('customOptionsJson', JSON.stringify(current));
    }

    handleCustomOptionChange(event) {
        const idx = parseInt(event.currentTarget.dataset.index, 10);
        const field = event.currentTarget.dataset.field;
        const current = this.customOptions.map(({ label, value }) => ({ label, value }));
        current[idx][field] = event.detail.value;
        this.firePropertyChange('customOptionsJson', JSON.stringify(current));
    }

    handleEditAutoFill() {
        if (this._selection && this._selection.type === 'element') {
            this.dispatchEvent(new CustomEvent('editautofill', {
                detail: {
                    sectionIndex: this._selection.sectionIndex,
                    elementIndex: this._selection.elementIndex,
                    fieldApiName: this._selection.fieldApiName
                }
            }));
        } else {
            this.dispatchEvent(new CustomEvent('editautofill'));
        }
    }

    handleEditVisibilityRules() {
        this.dispatchEvent(new CustomEvent('editvisibility', {
            detail: {
                selectionType: this._selection.type,
                index: this._selection.index,
                sectionIndex: this._selection.sectionIndex,
                elementIndex: this._selection.elementIndex
            }
        }));
    }
}