import { LightningElement, api, track } from 'lwc';
import describeSourceFields from '@salesforce/apex/FinalAutofillController.describeSourceFields';
import getTestRecordValues from '@salesforce/apex/FinalAutofillController.getTestRecordValues';
import mintRecordLink from '@salesforce/apex/FinalStudioController.mintRecordLink';
import mintTrackedLink from '@salesforce/apex/FinalStudioController.mintTrackedLink';
import invalidateLinks from '@salesforce/apex/FinalStudioController.invalidateLinks';
import LightningConfirm from 'lightning/confirm';

function mintId(prefix) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let suffix = '';
    for (const b of bytes) {
        suffix += (b % 36).toString(36);
    }
    return `${prefix}_${suffix}`;
}

export default class FinalAutofillPanel extends LightningElement {
    @api spec;
    @api formId;
    @api isPublic = false;
    @api isSurvey = false;
    @api activeVersionId = null;

    @api
    get testRecordId() {
        return this.activeTestRecordId;
    }
    set testRecordId(value) {
        this.activeTestRecordId = value || null;
    }

    @track draftRule = null;
    isEditing = false;

    // Source fields state
    sourceFields = [];
    loadingSourceFields = false;
    sourceFieldsError = '';
    _lastFetchedObject = null;

    // Test in preview state
    testRecordInput = '';
    testBusy = false;
    testError = '';
    activeTestRecordId = null;

    // Link minting state
    linkRecordId = '';
    linkTracked = false;
    linkRecipient = '';
    linkSingleUse = false;
    linkBusy = false;
    linkError = '';
    linkNotice = '';
    mintedLink = null;
    copiedLink = false;

    get rules() {
        return this.spec?.settings?.prefill?.autofillRules || [];
    }

    get hasRules() {
        return this.rules.length > 0;
    }

    get maxRulesReached() {
        return this.rules.filter((r) => r.enabled).length >= 20;
    }

    get isList() {
        return !this.isEditing;
    }

    get hasActiveTestData() {
        return Boolean(this.activeTestRecordId);
    }

    get policyOptions() {
        return [
            {
                label: 'Preserve respondent edits (default)',
                value: 'preserveEdits'
            },
            {
                label: 'Always replace when the source changes',
                value: 'alwaysReplace'
            }
        ];
    }

    get surveySourceObject() {
        return (
            this.spec?.form?.primaryContextObject ||
            this.spec?.form?.targetObject ||
            'Contact'
        );
    }

    get isSourceLink() {
        return this.draftRule?.source?.type === 'link';
    }

    get isSourceLookup() {
        return this.draftRule?.source?.type === 'lookup';
    }

    get isAlwaysReplace() {
        return this.draftRule?.policy === 'alwaysReplace';
    }

    get isSourceLinkAndPublic() {
        return this.isSourceLink && Boolean(this.isPublic);
    }

    get linkSourceClass() {
        return this.isSourceLink ? 'ap-radio-btn on' : 'ap-radio-btn';
    }

    get lookupSourceClass() {
        return this.isSourceLookup ? 'ap-radio-btn on' : 'ap-radio-btn';
    }

    get formElements() {
        const elements = [];
        (this.spec?.pages || []).forEach((page) => {
            (page.sections || []).forEach((sec) => {
                const inRepeater = Boolean(sec.repeat);
                (sec.elements || []).forEach((el) => {
                    elements.push({ ...el, inRepeater });
                });
            });
        });
        return elements;
    }

    get lookupElements() {
        return this.formElements
            .filter((el) => {
                if (el.type !== 'field' || el.inRepeater) return false;
                const inputType = el.config?.inputType;
                const refTo = el.binding?.referenceTo || el.config?.referenceTo;
                return inputType === 'reference' || Boolean(refTo);
            })
            .map((el) => {
                const refTo =
                    el.binding?.referenceTo ||
                    el.config?.referenceTo ||
                    'Record';
                return {
                    label: `${el.label || el.id} (${refTo})`,
                    value: el.id,
                    objectApiName: refTo,
                    element: el
                };
            });
    }

    get hasLookupElements() {
        return this.lookupElements.length > 0;
    }

    get lookupOptions() {
        return this.lookupElements.map((l) => ({
            label: l.label,
            value: l.value
        }));
    }

    get lookupTargetObject() {
        if (!this.draftRule?.source?.elementId) return '';
        const found = this.lookupElements.find(
            (l) => l.value === this.draftRule.source.elementId
        );
        return found ? found.objectApiName : '';
    }

    get destinationOptions() {
        return this.formElements
            .filter((el) => {
                if (el.type !== 'field') return false;
                if (el.inRepeater) return false;
                if (el.readOnly) return false;
                const inputType = (
                    el.config?.inputType || 'text'
                ).toLowerCase();
                return ['text', 'textarea', 'email', 'phone', 'url'].includes(
                    inputType
                );
            })
            .map((el) => ({
                label: `${el.label || el.id} [${el.config?.inputType || 'text'}]`,
                value: el.id
            }));
    }

    get currentSourceObject() {
        if (this.isSourceLink) {
            return this.isSurvey
                ? this.surveySourceObject
                : this.draftRule?.source?.objectApiName;
        }
        if (this.isSourceLookup) {
            return this.lookupTargetObject;
        }
        return null;
    }

    get sourceFieldsUnavailable() {
        return (
            !this.currentSourceObject ||
            this.loadingSourceFields ||
            Boolean(this.sourceFieldsError)
        );
    }

    get sourceFieldOptions() {
        return (this.sourceFields || []).map((f) => ({
            label: `${f.label} (${f.apiName})`,
            value: f.apiName
        }));
    }

    get draftMappings() {
        return this.draftRule?.mappings || [];
    }

    get hasMappings() {
        return this.draftMappings.length > 0;
    }

    get disclosedFieldLabels() {
        const map = new Map(
            (this.sourceFields || []).map((f) => [f.apiName, f.label])
        );
        return (this.draftMappings || [])
            .filter((m) => m.guestAllowed && m.from)
            .map((m) => map.get(m.from) || m.from);
    }

    get hasDisclosedFields() {
        return this.disclosedFieldLabels.length > 0;
    }

    get testApplyDisabled() {
        const id = (this.testRecordInput || '').trim();
        return (
            this.testBusy ||
            ![15, 18].includes(id.length) ||
            !this.hasMappings ||
            !this.currentSourceObject
        );
    }

    get testButtonLabel() {
        return this.testBusy ? 'Loading…' : 'Apply to preview';
    }

    get canMintLink() {
        return Boolean(this.activeVersionId && this.isSourceLink);
    }

    get createLinkDisabled() {
        const id = (this.linkRecordId || '').trim();
        return this.linkBusy || ![15, 18].includes(id.length);
    }

    get createLinkLabel() {
        return this.linkBusy ? 'Creating link…' : 'Create link';
    }

    get copiedLinkText() {
        return this.copiedLink ? 'Copied!' : 'Copy';
    }

    get ruleCards() {
        const lookupMap = new Map(
            this.lookupElements.map((l) => [l.value, l.label])
        );
        const destMap = new Map(
            this.destinationOptions.map((d) => [d.value, d.label])
        );

        return (this.rules || []).map((r) => {
            const isLink = r.source?.type === 'link';
            const sourceBadge = isLink
                ? `Link: ${r.source?.objectApiName || 'Unconfigured'}`
                : `Lookup: ${lookupMap.get(r.source?.elementId) || r.source?.elementId || 'Unconfigured'}`;

            const mappingCount = (r.mappings || []).length;
            const mappingCountText = `${mappingCount} mapping${mappingCount === 1 ? '' : 's'}`;
            const policyBadge =
                r.policy === 'alwaysReplace'
                    ? 'Always replace'
                    : 'Preserve edits';

            const errors = [];
            if (isLink && !r.source?.objectApiName) {
                errors.push('Source object missing');
            } else if (!isLink && !r.source?.elementId) {
                errors.push('Lookup field missing');
            } else if (!isLink && !lookupMap.has(r.source?.elementId)) {
                errors.push('Lookup field not found on form');
            }

            if (mappingCount === 0) {
                errors.push('No field mappings');
            } else {
                r.mappings.forEach((m) => {
                    if (!m.from) errors.push('Mapping has no source field');
                    if (!m.to) {
                        errors.push('Mapping has no destination');
                    } else if (!destMap.has(m.to)) {
                        errors.push(
                            `Destination ${m.to} missing or incompatible`
                        );
                    }
                });
            }

            return {
                id: r.id,
                name: r.name || 'Untitled Rule',
                enabled: Boolean(r.enabled),
                sourceBadge,
                mappingCountText,
                policyBadge,
                cardClass: `ap-rule-card ${r.enabled ? 'is-enabled' : 'is-disabled'}`,
                errors,
                hasErrors: errors.length > 0
            };
        });
    }

    _lookupName(elementId) {
        if (!elementId) return 'Unconfigured';
        const found = this.lookupElements.find((l) => l.value === elementId);
        return found ? found.label : elementId;
    }

    // ----- Rule Navigation & Editor Lifecycle -----

    handleCreateRule() {
        const defaultObject = this.isSurvey ? this.surveySourceObject : '';
        this.draftRule = {
            id: mintId('af'),
            name: 'New Autofill Rule',
            enabled: true,
            policy: 'preserveEdits',
            source: {
                type: 'link',
                objectApiName: defaultObject
            },
            mappings: []
        };
        this.isEditing = true;
        this.sourceFields = [];
        this.sourceFieldsError = '';
        this._lastFetchedObject = null;
        if (defaultObject) {
            this._fetchSourceFields(defaultObject);
        }
    }

    handleEditRule(event) {
        const ruleId = event.currentTarget.dataset.id;
        const rule = (this.rules || []).find((r) => r.id === ruleId);
        if (!rule) return;

        this.draftRule = JSON.parse(JSON.stringify(rule));
        if (!this.draftRule.mappings) this.draftRule.mappings = [];
        if (!this.draftRule.policy) this.draftRule.policy = 'preserveEdits';
        if (!this.draftRule.source) this.draftRule.source = { type: 'link' };

        this.isEditing = true;
        this.sourceFields = [];
        this.sourceFieldsError = '';
        this._lastFetchedObject = null;

        const obj = this.currentSourceObject;
        if (obj) {
            this._fetchSourceFields(obj);
        }
    }

    handleBackToList() {
        this.isEditing = false;
        this.draftRule = null;
    }

    handleCancelEdit() {
        this.isEditing = false;
        this.draftRule = null;
    }

    handleSaveRule() {
        if (!this.draftRule) return;

        const updatedRules = JSON.parse(JSON.stringify(this.rules));
        const idx = updatedRules.findIndex((r) => r.id === this.draftRule.id);

        if (idx >= 0) {
            updatedRules[idx] = this.draftRule;
        } else {
            updatedRules.push(this.draftRule);
        }

        this._commitRules(updatedRules);
        this.isEditing = false;
        this.draftRule = null;
    }

    handleToggleRule(event) {
        const ruleId = event.currentTarget.dataset.id;
        const checked = event.target.checked;
        const updatedRules = JSON.parse(JSON.stringify(this.rules));
        const rule = updatedRules.find((r) => r.id === ruleId);
        if (rule) {
            rule.enabled = checked;
            this._commitRules(updatedRules);
        }
    }

    handleDeleteRule(event) {
        const ruleId = event.currentTarget.dataset.id;
        const updatedRules = (this.rules || []).filter((r) => r.id !== ruleId);
        this._commitRules(updatedRules);
    }

    _commitRules(updatedRules) {
        const nextSpec = JSON.parse(JSON.stringify(this.spec || {}));
        if (!nextSpec.settings) nextSpec.settings = {};
        if (!nextSpec.settings.prefill) nextSpec.settings.prefill = {};
        nextSpec.settings.prefill.rulesVersion = 1;
        nextSpec.settings.prefill.autofillRules = updatedRules;

        this.dispatchEvent(
            new CustomEvent('ruleschange', {
                bubbles: true,
                composed: true,
                detail: { rules: updatedRules }
            })
        );
        this.dispatchEvent(
            new CustomEvent('specchange', {
                bubbles: true,
                composed: true,
                detail: { spec: nextSpec }
            })
        );
    }

    // ----- Rule Field Handlers -----

    handleNameChange(event) {
        if (!this.draftRule) return;
        this.draftRule.name = event.target.value;
    }

    handleSourceTypeSelect(event) {
        const type = event.currentTarget.dataset.type;
        if (!this.draftRule || this.draftRule.source?.type === type) return;

        this.draftRule.source.type = type;
        if (type === 'link') {
            delete this.draftRule.source.elementId;
            this.draftRule.source.objectApiName = this.isSurvey
                ? this.surveySourceObject
                : '';
            // Reset mappings guestAllowed if needed
        } else if (type === 'lookup') {
            delete this.draftRule.source.objectApiName;
            this.draftRule.source.elementId =
                this.lookupElements[0]?.value || '';
            // Lookup mappings cannot be guest allowed
            (this.draftRule.mappings || []).forEach((m) => {
                m.guestAllowed = false;
            });
        }

        const obj = this.currentSourceObject;
        if (obj) {
            this._fetchSourceFields(obj);
        } else {
            this.sourceFields = [];
        }
    }

    handleSourceObjectChange(event) {
        if (!this.draftRule || !this.isSourceLink) return;
        const obj = event.target.value ? event.target.value.trim() : '';
        this.draftRule.source.objectApiName = obj;
        if (obj) {
            this._fetchSourceFields(obj);
        } else {
            this.sourceFields = [];
        }
    }

    handleLookupElementChange(event) {
        if (!this.draftRule || !this.isSourceLookup) return;
        this.draftRule.source.elementId = event.target.value;
        const obj = this.lookupTargetObject;
        if (obj) {
            this._fetchSourceFields(obj);
        } else {
            this.sourceFields = [];
        }
    }

    handlePolicyChange(event) {
        if (!this.draftRule) return;
        this.draftRule.policy = event.target.value;
    }

    handleGoToFields() {
        this.dispatchEvent(
            new CustomEvent('navigatetab', {
                bubbles: true,
                composed: true,
                detail: { tab: 'fields' }
            })
        );
    }

    async _fetchSourceFields(objectApiName) {
        if (!objectApiName || objectApiName === this._lastFetchedObject) return;
        this._lastFetchedObject = objectApiName;
        this.loadingSourceFields = true;
        this.sourceFieldsError = '';
        try {
            const fields = await describeSourceFields({
                formId: this.formId || null,
                objectApiName
            });
            this.sourceFields = fields || [];
        } catch (e) {
            this.sourceFields = [];
            this.sourceFieldsError =
                e?.body?.message ||
                `Could not load fields for ${objectApiName}.`;
        } finally {
            this.loadingSourceFields = false;
        }
    }

    // ----- Mappings Table Handlers -----

    handleAddMapping() {
        if (!this.draftRule) return;
        if (!this.draftRule.mappings) this.draftRule.mappings = [];
        this.draftRule.mappings.push({
            id: mintId('afm'),
            from: this.sourceFieldOptions[0]?.value || '',
            to: this.destinationOptions[0]?.value || '',
            guestAllowed: false
        });
    }

    handleRemoveMapping(event) {
        const idx = Number(event.currentTarget.dataset.index);
        if (isNaN(idx) || !this.draftRule?.mappings) return;
        this.draftRule.mappings.splice(idx, 1);
    }

    handleMappingFromChange(event) {
        const idx = Number(event.currentTarget.dataset.index);
        if (isNaN(idx) || !this.draftRule?.mappings?.[idx]) return;
        this.draftRule.mappings[idx].from = event.target.value;
    }

    handleMappingToChange(event) {
        const idx = Number(event.currentTarget.dataset.index);
        if (isNaN(idx) || !this.draftRule?.mappings?.[idx]) return;
        this.draftRule.mappings[idx].to = event.target.value;
    }

    handleGuestAllowedChange(event) {
        const idx = Number(event.currentTarget.dataset.index);
        if (isNaN(idx) || !this.draftRule?.mappings?.[idx]) return;
        this.draftRule.mappings[idx].guestAllowed = event.target.checked;
    }

    // ----- Test in Preview Handlers -----

    handleTestRecordInputChange(event) {
        this.testRecordInput = event.target.value;
        this.testError = '';
    }

    async handleApplyTestRecord() {
        const recordId = (this.testRecordInput || '').trim();
        if (![15, 18].includes(recordId.length) || !this.currentSourceObject) {
            return;
        }

        this.testBusy = true;
        this.testError = '';
        try {
            const fieldNames = (this.draftMappings || [])
                .map((m) => m.from)
                .filter(Boolean);

            const vals = await getTestRecordValues({
                formId: this.formId || null,
                objectApiName: this.currentSourceObject,
                recordId,
                fieldApiNames: fieldNames
            });

            const elementValues = {};
            (this.draftMappings || []).forEach((m) => {
                if (m.from && m.to && vals[m.from] !== undefined) {
                    elementValues[m.to] = vals[m.from];
                }
            });

            this.activeTestRecordId = recordId;
            this.dispatchEvent(
                new CustomEvent('testpreview', {
                    bubbles: true,
                    composed: true,
                    detail: {
                        recordId,
                        ruleId: this.draftRule?.id,
                        values: elementValues
                    }
                })
            );
        } catch (e) {
            this.testError =
                e?.body?.message || 'Could not load test record values.';
        } finally {
            this.testBusy = false;
        }
    }

    handleClearTestData() {
        this.activeTestRecordId = null;
        this.testRecordInput = '';
        this.testError = '';
        this.dispatchEvent(
            new CustomEvent('cleartestpreview', {
                bubbles: true,
                composed: true
            })
        );
    }

    // ----- Create Personalized Link Handlers -----

    handleLinkRecordIdChange(event) {
        this.linkRecordId = event.target.value;
    }

    handleLinkTrackedChange(event) {
        this.linkTracked = event.target.checked;
    }

    handleLinkRecipientChange(event) {
        this.linkRecipient = event.target.value;
    }

    handleLinkSingleUseChange(event) {
        this.linkSingleUse = event.target.checked;
    }

    async handleCreateLink() {
        const recordId = (this.linkRecordId || '').trim();
        if (![15, 18].includes(recordId.length) || this.linkBusy) {
            return;
        }

        this.linkBusy = true;
        this.linkError = '';
        this.linkNotice = '';
        this.mintedLink = null;
        this.copiedLink = false;

        try {
            const res = this.linkTracked
                ? await mintTrackedLink({
                      formId: this.formId,
                      recordId,
                      recipient: this.linkRecipient || null,
                      singleUse: Boolean(this.linkSingleUse)
                  })
                : await mintRecordLink({ formId: this.formId, recordId });

            this.mintedLink = res?.query || null;
        } catch (e) {
            this.linkError =
                e?.body?.message || "Couldn't create personalized link.";
        } finally {
            this.linkBusy = false;
        }
    }

    async handleInvalidateLinks() {
        if (this.linkBusy) return;
        const ok = await LightningConfirm.open({
            message:
                'Invalidate every personalized link already created for this form? ' +
                'Links created afterward will still work; earlier links will stop autofilling.',
            label: 'Invalidate all links'
        });
        if (!ok) return;

        this.linkBusy = true;
        this.linkError = '';
        try {
            await invalidateLinks({ formId: this.formId });
            this.mintedLink = null;
            this.linkNotice =
                'All earlier personalized links are now invalid. New links you generate will work.';
        } catch (e) {
            this.linkError =
                e?.body?.message || "Couldn't invalidate personalized links.";
        } finally {
            this.linkBusy = false;
        }
    }

    handleCopyLink() {
        if (!this.mintedLink) return;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(this.mintedLink);
            this.copiedLink = true;
            // Reset the "Copied!" affordance. Tracked and cleared on unmount:
            // an untracked timer fires into a destroyed component if the author
            // closes the panel inside the 2s window.
            clearTimeout(this._copyTimer);
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            this._copyTimer = setTimeout(() => {
                this.copiedLink = false;
            }, 2000);
        }
    }

    disconnectedCallback() {
        clearTimeout(this._copyTimer);
    }
}
