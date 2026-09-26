import { LightningElement, api } from 'lwc';
import mintRecordLink from '@salesforce/apex/FinalStudioController.mintRecordLink';
import mintTrackedLink from '@salesforce/apex/FinalStudioController.mintTrackedLink';
import invalidateLinks from '@salesforce/apex/FinalStudioController.invalidateLinks';
import LightningConfirm from 'lightning/confirm';
import { answerTypeOf } from 'c/finalAutofillFit';

/**
 * finalAutofillPanel — the Autofill rail: the list of rules, and the
 * personalized-link tools while a link rule is on. Every rule edits in the
 * Studio's dialog (c/finalAutofillRuleEditor), for every form type
 * (IMPL_PLAN_F2_AUTOFILL 8); this panel only asks for it.
 */
export default class FinalAutofillPanel extends LightningElement {
    @api spec;
    @api formId;
    @api isPublic = false;
    /** 'form' | 'survey' | 'freeform'. */
    @api formType;
    @api activeVersionId = null;

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

    /** A link rule is on: its links can be made here, under the list. */
    get hasEnabledLinkRule() {
        return this.rules.some((r) => r.enabled && r.source?.type === 'link');
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
                // Polymorphic lookups (Task "Related To") have no single object;
                // each rule on one names the object it reads.
                const polymorphic = Boolean(el.config?.polymorphic);
                const refTo = polymorphic
                    ? ''
                    : el.binding?.referenceTo ||
                      el.config?.referenceTo ||
                      'Record';
                return {
                    label: polymorphic
                        ? `${el.label || el.id} (several objects)`
                        : `${el.label || el.id} (${refTo})`,
                    value: el.id,
                    objectApiName: refTo,
                    polymorphic,
                    element: el
                };
            });
    }

    /** What Autofill can fill: the same list the runtime and server use (6.7). */
    get fillableIds() {
        return new Set(
            this.formElements
                .filter(
                    (el) => !el.inRepeater && !el.readOnly && answerTypeOf(el)
                )
                .map((el) => el.id)
        );
    }

    get canMintLink() {
        return Boolean(this.activeVersionId && this.hasEnabledLinkRule);
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
        const polymorphicIds = new Set(
            this.lookupElements.filter((l) => l.polymorphic).map((l) => l.value)
        );
        const fillable = this.fillableIds;

        return (this.rules || []).map((r) => {
            const isLink = r.source?.type === 'link';
            const isUser = r.source?.type === 'user';
            // a survey's link always carries its connected record
            const linkObject =
                this.formType === 'survey'
                    ? this.spec?.form?.primaryContextObject ||
                      this.spec?.form?.targetObject
                    : r.source?.objectApiName;
            let sourceBadge;
            if (isUser) {
                sourceBadge = 'Signed-in person';
            } else if (isLink) {
                sourceBadge = `Link: ${linkObject || 'Unconfigured'}`;
            } else {
                sourceBadge = `Lookup: ${lookupMap.get(r.source?.elementId) || r.source?.elementId || 'Unconfigured'}${r.source?.objectApiName ? ` · ${r.source.objectApiName}` : ''}`;
            }

            const mappingCount = (r.mappings || []).length;
            const mappingCountText = `${mappingCount} mapping${mappingCount === 1 ? '' : 's'}`;
            const policyBadge =
                r.policy === 'alwaysReplace'
                    ? 'Always replace'
                    : 'Preserve edits';

            const errors = [];
            if (isUser) {
                // the signed-in person always has a source record
            } else if (isLink && !linkObject) {
                errors.push(
                    this.formType === 'survey'
                        ? 'Connect this survey to an object first'
                        : 'Choose the object in the link'
                );
            } else if (!isLink && !r.source?.elementId) {
                errors.push('Lookup field missing');
            } else if (!isLink && !lookupMap.has(r.source?.elementId)) {
                errors.push('Lookup field not found on form');
            } else if (
                !isLink &&
                polymorphicIds.has(r.source?.elementId) &&
                !r.source?.objectApiName
            ) {
                errors.push('Choose which object this rule reads');
            }

            if (mappingCount === 0) {
                errors.push('No field mappings');
            } else {
                r.mappings.forEach((m) => {
                    if (!m.from) errors.push('Mapping has no source field');
                    if (!m.to) {
                        errors.push('Mapping has no destination');
                    } else if (!fillable.has(m.to)) {
                        errors.push(
                            this.formType === 'form'
                                ? 'Fills a field that’s gone or can’t be filled'
                                : 'Fills a question that’s gone or can’t be filled'
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

    // ----- Rules -----

    /** The Studio opens the rule in its dialog; null means a new rule. */
    _openInDialog(rule) {
        this.dispatchEvent(
            new CustomEvent('editautofillrule', {
                bubbles: true,
                composed: true,
                detail: { rule: rule ? JSON.parse(JSON.stringify(rule)) : null }
            })
        );
    }

    handleCreateRule() {
        this._openInDialog(null);
    }

    handleEditRule(event) {
        const ruleId = event.currentTarget.dataset.id;
        const rule = this.rules.find((r) => r.id === ruleId);
        if (rule) {
            this._openInDialog(rule);
        }
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
