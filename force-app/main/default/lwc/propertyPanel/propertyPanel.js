import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import uploadImage from '@salesforce/apex/FormAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FormAssetController.deleteImage';

// Cohesive form theme presets — accent drives buttons/links, surface tints the
// card, radius sets the corner softness. Per-button overrides default to accent.
const PRESET_THEMES = {
    default: { name: 'default', accent: '#0176d3', surface: '#ffffff', radius: 'rounded' },
    ocean: { name: 'ocean', accent: '#0b7ba8', surface: '#f3fafd', radius: 'rounded' },
    forest: { name: 'forest', accent: '#2e7d4f', surface: '#f3faf5', radius: 'rounded' },
    sunset: { name: 'sunset', accent: '#d9622b', surface: '#fdf6f1', radius: 'round' },
    royal: { name: 'royal', accent: '#6b4fbb', surface: '#f7f4fd', radius: 'round' },
    graphite: { name: 'graphite', accent: '#5a6b7b', surface: '#f5f7f9', radius: 'sharp' }
};

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
    // Groups the dense Form Settings panel into Style / Behavior / Completion,
    // with the most-used group (Style) open by default.
    @track _settingsGroups = { style: true, behavior: false, completion: false };

    handleToggleSettingsGroup(event) {
        const g = event.currentTarget.dataset.group;
        this._settingsGroups = {
            ...this._settingsGroups,
            [g]: !this._settingsGroups[g]
        };
    }

    get styleExpanded() { return this._settingsGroups.style; }
    get behaviorExpanded() { return this._settingsGroups.behavior; }
    get completionExpanded() { return this._settingsGroups.completion; }

    get styleChevron() {
        return this._settingsGroups.style ? 'utility:chevrondown' : 'utility:chevronright';
    }
    get behaviorChevron() {
        return this._settingsGroups.behavior ? 'utility:chevrondown' : 'utility:chevronright';
    }
    get completionChevron() {
        return this._settingsGroups.completion ? 'utility:chevrondown' : 'utility:chevronright';
    }

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
    get submitLabel() { return this._selection?.submitLabel || 'Submit'; }
    get captchaRequired() { return this._selection?.captchaRequired || false; }
    get formTheme() { return this._selection?.theme?.name || this._selection?.themeName || 'default'; }
    get formLayoutMode() { return this._selection?.layoutMode || 'Single_Page'; }
    get isMultiPageForm() { return this.formLayoutMode !== 'Single_Page'; }
    get isVerticalNavForm() { return this.formLayoutMode === 'Vertical_Navigation'; }
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

    get themeOptions() {
        return [
            { label: 'Salesforce Blue (Default)', value: 'default' },
            { label: 'Ocean Teal', value: 'ocean' },
            { label: 'Forest Green', value: 'forest' },
            { label: 'Sunset Orange', value: 'sunset' },
            { label: 'Royal Purple', value: 'royal' },
            { label: 'Graphite Gray', value: 'graphite' },
            { label: 'Custom', value: 'custom' }
        ];
    }

    get radiusOptions() {
        return [
            { label: 'Sharp', value: 'sharp' },
            { label: 'Rounded', value: 'rounded' },
            { label: 'Round', value: 'round' },
            { label: 'Pill', value: 'pill' }
        ];
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
    get formWidth() {
        return this._selection?.formWidth || 760;
    }

    get navStyleOptions() {
        // Single page is included so a form can be converted single <-> multi
        // page from here — the only place that switch is exposed.
        return [
            { label: "Single page (no navigation)", value: "Single_Page" },
            { label: "Wizard (one page at a time)", value: "Multi_Page_Wizard" },
            { label: "Vertical Navigation menu", value: "Vertical_Navigation" }
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
            { value: 'Vertical_Navigation', label: 'Vertical nav', desc: 'Side menu of pages', icon: 'utility:side_list' }
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

    // --- Theme color swatches (show the accent, not just a name) ---
    get themeSwatches() {
        const current = this.formTheme;
        return Object.keys(PRESET_THEMES).map((name) => {
            const p = PRESET_THEMES[name];
            const labels = {
                default: 'Salesforce Blue',
                ocean: 'Ocean Teal',
                forest: 'Forest Green',
                sunset: 'Sunset Orange',
                royal: 'Royal Purple',
                graphite: 'Graphite Gray'
            };
            return {
                name,
                label: labels[name] || name,
                style: `background-color: ${p.accent};`,
                selected: name === current,
                swatchClass: name === current ? 'theme-swatch is-selected' : 'theme-swatch'
            };
        });
    }

    get isCustomTheme() {
        return this.formTheme === 'custom';
    }

    get customThemeClass() {
        return this.isCustomTheme
            ? 'theme-swatch theme-swatch_custom is-selected'
            : 'theme-swatch theme-swatch_custom';
    }

    handleThemeSwatch(event) {
        const name = event.currentTarget.dataset.theme;
        this.fireFormSettingChange('theme', PRESET_THEMES[name] || PRESET_THEMES.default);
    }

    handlePickCustomTheme() {
        const value = { ...(this._selection?.theme || {}), name: 'custom' };
        this.fireFormSettingChange('theme', value);
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
        let value = event.detail.value;
        if (prop === 'theme') {
            // Picking a preset replaces the whole theme with its cohesive
            // values (and clears any per-button overrides). "Custom" keeps the
            // current colours but flags the name so the dropdown reflects it.
            if (value === 'custom') {
                value = { ...(this._selection?.theme || {}), name: 'custom' };
            } else {
                value = PRESET_THEMES[value] || PRESET_THEMES.default;
            }
        }
        this.fireFormSettingChange(prop, value);
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

    handleFormWidthChange(event) {
        let v = parseInt(event.detail.value, 10);
        if (Number.isNaN(v)) v = 760;
        v = Math.min(Math.max(v, 320), 1920); // keep within sane bounds
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