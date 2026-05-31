import { LightningElement, api, track } from 'lwc';

export default class PropertyPanel extends LightningElement {
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

    // Page getters
    get pageName() { return this._selection?.name || ''; }
    get pageShowHeader() { return this._selection?.showHeader || false; }
    get pageShowInProgress() { return this._selection?.showInProgress !== false; }
    get pageHeaderTitle() { return this._selection?.headerTitle || ''; }
    get pageHeaderSubtitle() { return this._selection?.headerSubtitle || ''; }

    // Form settings getters
    get submitLabel() { return this._selection?.submitLabel || 'Submit'; }
    get thankYouEnabled() { return this._selection?.thankYouEnabled || false; }
    get thankYouMessage() { return this._selection?.thankYouMessage || ''; }
    get redirectUrl() { return this._selection?.redirectUrl || ''; }

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

    // --- Header getters ---
    get headerVisible() { return this._selection?.visible !== false; }
    get headerTitle() { return this._selection?.title || ''; }
    get headerSubtitle() { return this._selection?.subtitle || ''; }
    get headerShowLogo() { return this._selection?.showLogo || false; }
    get headerLogoUrl() { return this._selection?.logoUrl || ''; }
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

    get uiBehaviorOptions() {
        return [
            { label: 'None (use field permissions)', value: 'None' },
            { label: 'Required', value: 'Required' },
            { label: 'Read Only', value: 'Read_Only' }
        ];
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

    get visibilityRuleSummary() {
        const expr = this._selection?.visibilityExpression;
        if (!expr) return 'Always visible';
        try {
            const parsed = JSON.parse(expr);
            const count = parsed.rules ? parsed.rules.length : 0;
            return `${count} rule${count !== 1 ? 's' : ''} configured`;
        } catch (e) {
            return 'Rules configured';
        }
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
        const file = event.target.files[0];
        if (!file) return;
        this.readFileAsDataUrl(file, (dataUrl) => {
            this.firePropertyChange('logoUrl', dataUrl);
        });
    }

    handleRemoveLogo() {
        this.firePropertyChange('logoUrl', '');
    }

    handleBackgroundUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        this.readFileAsDataUrl(file, (dataUrl) => {
            this.firePropertyChange('backgroundImage', dataUrl);
        });
    }

    handleRemoveBackground() {
        this.firePropertyChange('backgroundImage', '');
    }

    readFileAsDataUrl(file, callback) {
        const reader = new FileReader();
        reader.onload = () => callback(reader.result);
        reader.readAsDataURL(file);
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
        this.dispatchEvent(new CustomEvent('editautofill', {
            detail: {
                sectionIndex: this._selection.sectionIndex,
                elementIndex: this._selection.elementIndex,
                fieldApiName: this._selection.fieldApiName
            }
        }));
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