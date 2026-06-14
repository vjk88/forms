import { LightningElement, api, track } from 'lwc';
import { sanitizeStyle, sanitizeCustomCss } from 'c/zFormSanitizer';
import processSubmission from '@salesforce/apex/Z_FormSubmissionController.processSubmission';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class ZFormPlayer extends LightningElement {
    @api formVersionId; // Salesforce Record ID of Z_Form_Version__c
    @api previewMode = false;

    @track formDefinition = {};
    @track schemaSnapshot = {};
    @track formValues = {}; // Global values map: { key => value }
    @track repeaterValues = {}; // Global child collection map: { relationshipName => [records] }
    @track fieldErrors = {}; // Validations map: { key => message }
    @track activePageIdx = 0;

    _layoutJson;
    _schemaSnapshotJson;
    _objectApiName;

    @api
    get layoutJson() {
        return this._layoutJson;
    }
    set layoutJson(value) {
        this._layoutJson = value;
        if (value) {
            try {
                this.formDefinition = typeof value === 'string' ? JSON.parse(value) : value;
            } catch (e) {
                console.error('Failed to parse layoutJson', e);
            }
        }
    }

    @api
    get formDefinitionJson() {
        return this._layoutJson;
    }
    set formDefinitionJson(value) {
        this.layoutJson = value;
    }

    @api
    get schemaSnapshotJson() {
        return this._schemaSnapshotJson;
    }
    set schemaSnapshotJson(value) {
        this._schemaSnapshotJson = value;
        if (value) {
            try {
                this.schemaSnapshot = typeof value === 'string' ? JSON.parse(value) : value;
            } catch (e) {
                console.error('Failed to parse schemaSnapshotJson', e);
            }
        }
    }

    @api
    get objectApiName() {
        return this._objectApiName;
    }
    set objectApiName(value) {
        this._objectApiName = value;
    }

    connectedCallback() {
        // Initialization if needed
    }

    renderedCallback() {
        this.applyThemeStyles();
    }

    applyThemeStyles() {
        const container = this.template.querySelector('[data-id="formContainer"]');
        if (!container || !this.formDefinition.theme) return;

        const theme = this.formDefinition.theme;

        // 1. Resolve Global/Base colors and typography
        const bg = theme.colors?.bg || theme.global?.backgroundColor;
        const text = theme.colors?.text || theme.global?.textColor || theme.global?.color;
        const fontFamily = theme.typography?.fontFamily || theme.global?.fontFamily;
        const borderRadius = theme.typography?.borderRadius || theme.global?.borderRadius;

        // 2. Resolve Element/Input styles
        const inputBg = theme.colors?.inputBg || theme.elements?.inputBackground || theme.elements?.inputBg;
        const inputBorder = theme.colors?.inputBorder || theme.elements?.inputBorderColor || theme.elements?.inputBorder;
        const labelColor = theme.colors?.label || theme.elements?.labelColor || theme.elements?.label;

        // 3. Resolve Sections padding and borders
        const secPadding = theme.sections?.padding;
        const secBorder = theme.sections?.borderStyle || theme.sections?.border;

        // 4. Resolve Header background and alignment
        const headerBg = theme.header?.background || theme.header?.backgroundColor;
        const headerAlign = theme.header?.alignment || theme.header?.align || 'left';

        // Sanitizing
        const safeBg = sanitizeStyle(bg, 'color');
        const safeText = sanitizeStyle(text, 'color');
        const safeFont = sanitizeStyle(fontFamily, 'font');
        const safeRadius = sanitizeStyle(borderRadius, 'size');

        const safeInputBg = sanitizeStyle(inputBg, 'color');
        const safeInputBorder = sanitizeStyle(inputBorder, 'color');
        const safeLabel = sanitizeStyle(labelColor, 'color');

        const safeSecPadding = sanitizeStyle(secPadding, 'size');
        const safeSecBorder = sanitizeStyle(secBorder, 'border');

        // Allow color or gradient for header background
        let safeHeaderBg = sanitizeStyle(headerBg, 'color');
        if (!safeHeaderBg) {
            safeHeaderBg = sanitizeStyle(headerBg, 'gradient');
        }

        // Apply style variables to container
        if (safeBg) container.style.setProperty('--form-bg', safeBg);
        if (safeText) container.style.setProperty('--form-text-color', safeText);
        if (safeFont) container.style.setProperty('--form-font-family', safeFont);
        if (safeRadius) container.style.setProperty('--form-border-radius', safeRadius);

        if (safeInputBg) container.style.setProperty('--form-input-bg', safeInputBg);
        if (safeInputBorder) container.style.setProperty('--form-input-border', safeInputBorder);
        if (safeLabel) container.style.setProperty('--form-label-color', safeLabel);

        if (safeSecPadding) container.style.setProperty('--section-padding', safeSecPadding);
        if (safeSecBorder) container.style.setProperty('--section-border', safeSecBorder);

        if (safeHeaderBg) container.style.setProperty('--header-bg', safeHeaderBg);

        // 5. Apply manual custom CSS overrides
        const customCss = theme.customCss || '';
        if (customCss) {
            const sanitized = sanitizeCustomCss(customCss);
            if (sanitized) {
                const rules = sanitized.split(';');
                for (let rule of rules) {
                    rule = rule.trim();
                    if (!rule) continue;
                    const cIdx = rule.indexOf(':');
                    if (cIdx !== -1) {
                        const prop = rule.substring(0, cIdx).trim();
                        const val = rule.substring(cIdx + 1).trim();
                        if (prop && val) {
                            container.style.setProperty(prop, val);
                        }
                    }
                }
            }
        }

        // Alignment logic
        let flexAlign = 'flex-start';
        let textAlign = 'left';
        if (headerAlign === 'center') {
            flexAlign = 'center';
            textAlign = 'center';
        } else if (headerAlign === 'right') {
            flexAlign = 'flex-end';
            textAlign = 'right';
        }
        container.style.setProperty('--header-flex-align', flexAlign);
        container.style.setProperty('--header-text-align', textAlign);
    }

    get containerClass() {
        const layout = this.formDefinition.layout || {};
        const variant = layout.variant || 'single-page';
        const card = layout.cardStyle || 'flat';
        return `form-wrapper-outer layout-${variant} card-${card}`;
    }

    get headerConfig() {
        const layout = this.formDefinition.layout || {};
        return layout.header || {};
    }

    get isModal() {
        const variant = this.formDefinition.layout?.variant;
        return variant === 'modal' || variant === 'focusModalPopup';
    }
 
    get isSplitPage() {
        const variant = this.formDefinition.layout?.variant;
        return variant === 'split-page' || variant === 'split' || variant === 'splitSidebarImg' || variant === 'splitBgOverlay' || variant === 'asymmetricLanding' || variant === 'floatingCardSplit';
    }
 
    get isSidebar() {
        const variant = this.formDefinition.layout?.variant;
        return variant === 'sidebar' || variant === 'threeColumnDashboard';
    }
 
    get isMultiPage() {
        const variant = this.formDefinition.layout?.variant;
        return variant === 'multi-page' || variant === 'stepped' || variant === 'multiStepWizard';
    }

    get showRightSidebar() {
        return this.formDefinition.layout?.variant === 'threeColumnDashboard';
    }

    get pages() {
        if (!this.formDefinition.pages) return [];
        return this.formDefinition.pages.map((pg, idx) => ({
            ...pg,
            navClass: `sidebar-nav-item ${idx === this.activePageIdx ? 'active' : ''}`
        }));
    }

    get activeSections() {
        if (!this.formDefinition.pages || this.formDefinition.pages.length === 0) return [];
        const activePage = this.formDefinition.pages[this.activePageIdx];
        return activePage ? activePage.sections : [];
    }

    get relatedLists() {
        return this.formDefinition.relatedLists || [];
    }

    get isFirstPage() {
        return this.activePageIdx === 0;
    }

    get isLastPage() {
        if (!this.formDefinition.pages) return true;
        return this.activePageIdx === this.formDefinition.pages.length - 1;
    }

    get showSubmitButton() {
        return !this.isMultiPage || this.isLastPage;
    }

    get progressBarStyle() {
        if (!this.formDefinition.pages || this.formDefinition.pages.length <= 1) return 'width: 0%';
        const pct = (this.activePageIdx / (this.formDefinition.pages.length - 1)) * 100;
        return `width: ${pct}%`;
    }

    handlePageNavClick(event) {
        this.activePageIdx = parseInt(event.target.dataset.index, 10);
    }

    handlePrev() {
        if (this.activePageIdx > 0) {
            this.activePageIdx--;
        }
    }

    handleNext() {
        if (this.formDefinition.pages && this.activePageIdx < this.formDefinition.pages.length - 1) {
            this.activePageIdx++;
        }
    }

    handleElementValueChange(event) {
        const { key, value } = event.detail;
        this.formValues = { ...this.formValues, [key]: value };
    }

    handleRepeaterChange(event) {
        const { relationshipName, records } = event.detail;
        this.repeaterValues = { ...this.repeaterValues, [relationshipName]: records };
    }

    handleSubmit() {
        this.fieldErrors = {};
        
        let isValid = this.validateForm();
        if (!isValid) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Validation Error',
                    message: 'Please resolve form input errors.',
                    variant: 'error'
                })
            );
            return;
        }

        if (this.previewMode) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Preview Mode',
                    message: 'Form submission simulated successfully!',
                    variant: 'success'
                })
            );
            return;
        }

        const finalSubmissionMap = { ...this.formValues, ...this.repeaterValues };

        const payload = {
            formVersionId: this.formVersionId,
            responseJson: JSON.stringify(finalSubmissionMap)
        };

        processSubmission({ payload })
            .then(res => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Form submitted successfully! Record created: ' + res.recordId,
                        variant: 'success'
                    })
                );
            })
            .catch(err => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Submission Failed',
                        message: err.body.message,
                        variant: 'error'
                    })
                );
            });
    }

    validateForm() {
        let isValid = true;
        if (this.formDefinition.pages) {
            this.formDefinition.pages.forEach(pg => {
                if (pg.sections) {
                    pg.sections.forEach(sec => {
                        if (sec.elements) {
                            sec.elements.forEach(el => {
                                if (el.type === 'field') {
                                    const val = this.formValues[el.key];
                                    if (el.required && !val) {
                                        this.fieldErrors[el.key] = 'Field is required';
                                        isValid = false;
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
        return isValid;
    }
}
