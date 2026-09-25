import { LightningElement, api } from 'lwc';
import listCreatableObjects from '@salesforce/apex/FinalMappingController.listCreatableObjects';
import describeQuestions from '@salesforce/apex/FinalMappingController.describeQuestions';
import { actionsOf, actionState } from 'c/finalMappingModel';

const STATE_TEXT = {
    incomplete: 'Not finished',
    broken: 'Points at a missing step'
};

/**
 * finalMappingSummary — Mapping in the Build rail (IMPL_PLAN_F2_AUTOFILL
 * 5.4): how many steps, which aren't finished, and the button that opens
 * the whole mapping screen in a dialog. The Studio owns that dialog; this
 * asks for it with `openmapping`. msu- classes.
 */
export default class FinalMappingSummary extends LightningElement {
    _spec;
    objects = [];
    questions = [];
    _questionsFor;

    @api
    get spec() {
        return this._spec;
    }
    set spec(value) {
        this._spec = value;
        this._loadQuestions();
    }

    connectedCallback() {
        listCreatableObjects()
            .then((data) => {
                this.objects = data || [];
            })
            .catch(() => {
                this.objects = [];
            });
    }

    /** Which questions can be skipped decides "Not finished" (D59). */
    async _loadQuestions() {
        const pagesJson = JSON.stringify(
            (this._spec && this._spec.pages) || []
        );
        if (pagesJson === this._questionsFor) return;
        this._questionsFor = pagesJson;
        try {
            this.questions =
                (await describeQuestions({
                    specJson: JSON.stringify(this._spec || {})
                })) || [];
        } catch {
            this.questions = [];
        }
    }

    get actions() {
        return actionsOf(this._spec);
    }

    get hasSteps() {
        return this.actions.length > 0;
    }

    get steps() {
        const labels = new Map(this.objects.map((o) => [o.value, o.label]));
        const all = this.actions;
        const skippable = new Set(
            (this.questions || [])
                .filter((q) => q.skippable)
                .map((q) => q.elementKey)
        );
        return all.map((a, i) => {
            const state = actionState(all, i, skippable);
            return {
                id: a.id,
                title: `${i + 1}. ${labels.get(a.object) || a.object}`,
                detail:
                    a.operation === 'findOrCreate'
                        ? 'Find or create'
                        : 'Always create',
                stateText: STATE_TEXT[state] || '',
                cls: state === 'ok' ? 'msu-step' : 'msu-step msu-step--warn'
            };
        });
    }

    get countText() {
        const all = this.steps;
        const n = all.length;
        const open = all.filter((s) => s.stateText).length;
        const steps = n === 1 ? '1 step' : `${n} steps`;
        return open ? `${steps} · ${open} not finished` : steps;
    }

    get openLabel() {
        return this.hasSteps ? 'Open mapping' : 'Set up mapping';
    }

    /** Back here when the dialog closes (IMPL_PLAN_F2_AUTOFILL 5.1). */
    @api
    focusOpen() {
        const button = this.template.querySelector('.msu-open');
        if (button) {
            button.focus();
        }
    }

    handleOpen() {
        this.dispatchEvent(
            new CustomEvent('openmapping', {
                bubbles: true,
                composed: true,
                detail: { target: null }
            })
        );
    }
}
