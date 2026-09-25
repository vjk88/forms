import { api } from 'lwc';
import LightningModal from 'lightning/modal';

const BLOCKER = 'blocker';

/**
 * Groups what the publish check found by where the author fixes it (round 2):
 * one group per mapping step ("Data · Mapping · Step 2 · Contact"), one per
 * question on the Build tab, and one per question that several steps rely on
 * — a question that can be skipped is said ONCE, with every step that needs
 * it, because making it required fixes them all.
 *
 * Returns groups, those that stop publishing first:
 * [{ key, area, where, goTo, lead, blocker, lines: [{ key, section, text,
 * blocker }] }]. `goTo` is { mode: 'data', actionId } | { mode: 'build',
 * elementId } | null.
 */
export function groupItems(items) {
    const groups = [];
    const byKey = new Map();
    const group = (key, make) => {
        if (!byKey.has(key)) {
            const g = { key, lines: [], blocker: false, ...make() };
            byKey.set(key, g);
            groups.push(g);
        }
        return byKey.get(key);
    };
    (items || []).forEach((item, i) => {
        const blocker = item.severity === BLOCKER;
        let g;
        if (item.questionKey) {
            g = group(`q:${item.questionKey}`, () => ({
                area: 'Build',
                where: `“${item.elementLabel || 'A question'}”`,
                // The fix is made where the reason is: the question, or the
                // section or page whose rule can hide it.
                goTo: {
                    mode: 'build',
                    kind: item.fixKind || 'element',
                    id: item.fixId || item.questionKey
                },
                question: true,
                why: item.questionWhy || 'can be skipped',
                fix: item.questionFix || 'Make it required.'
            }));
            const line = {
                key: `l${i}`,
                section: item.step || '',
                text: item.questionUse || item.text,
                blocker
            };
            // Two conditions on one step using the same answer are one use.
            const same = g.lines.find(
                (l) => l.section === line.section && l.text === line.text
            );
            if (same) {
                same.blocker = same.blocker || blocker;
            } else {
                g.lines.push(line);
            }
        } else if (item.area === 'data') {
            g = group(`a:${item.actionId || 'mapping'}`, () => ({
                // Mapping opens from the Build rail (IMPL_PLAN_F2_AUTOFILL
                // D63); the goTo keeps its old 'data' name.
                area: 'Build',
                where: item.step ? `Mapping · ${item.step}` : 'Mapping',
                goTo: {
                    mode: 'data',
                    actionId: item.actionId || null,
                    section: item.section || null
                }
            }));
            g.lines.push({
                key: `l${i}`,
                section: item.section || '',
                text: item.text,
                blocker
            });
        } else {
            g = group(`b:${item.elementId || i}`, () => ({
                area: item.area === 'build' ? 'Build' : '',
                where: item.elementLabel ? `“${item.elementLabel}”` : '',
                goTo: item.elementId
                    ? { mode: 'build', kind: 'element', id: item.elementId }
                    : null
            }));
            g.lines.push({
                key: `l${i}`,
                section: '',
                text: item.text,
                blocker
            });
        }
        g.blocker = g.blocker || blocker;
    });
    groups.forEach((g) => {
        if (g.question) {
            // One fix for every step listed under it.
            const why = g.why.charAt(0).toUpperCase() + g.why.slice(1);
            g.lead = `${why}, but ${
                g.lines.length === 1 ? 'this step needs' : 'these steps need'
            } it. ${g.fix}`;
        }
        g.lines.sort((a, b) => Number(b.blocker) - Number(a.blocker));
    });
    // Stable: what stops publishing first, otherwise in the order found.
    return groups
        .map((g, i) => ({ g, i }))
        .sort((a, b) => Number(b.g.blocker) - Number(a.g.blocker) || a.i - b.i)
        .map(({ g }) => g);
}

/** How many things: a folded question is one, however many steps use it. */
function countOf(groups, blocker) {
    return groups.reduce((n, g) => {
        if (g.question) {
            return n + (g.blocker === blocker ? 1 : 0);
        }
        return n + g.lines.filter((l) => l.blocker === blocker).length;
    }, 0);
}

/**
 * The publish confirmation — for every publish, with or without warnings.
 *
 * Publish is the one confirmation in this app whose CONTENT varies. The
 * others ("Reset all customizations?", "Make this form public?") are fixed
 * sentences and stay on `LightningConfirm`, which is the right size for a
 * sentence. This one carries nought to N consequences, and D26 promises a
 * fourth the day a change-type control lands.
 *
 * A plain string cannot hold a LIST. Several warnings ran together into one
 * paragraph, the bullet characters read as stray dots mid-sentence, and "The
 * live form updates immediately" landed after the last warning, where it
 * looked like part of it. A warning nobody can separate from its neighbours
 * is a warning nobody reads.
 *
 * It handles the empty case too rather than letting the Studio switch
 * dialogs by count: an author publishing the same form twice should not find
 * the buttons moved and the wording changed because a warning appeared.
 *
 * Closing resolves `true` to publish, `false` to cancel, and
 * `{ goTo }` when the author picks Go there on a group.
 */
export default class FinalPublishDialog extends LightningModal {
    /** The form's name, for the question being asked. */
    @api formName;

    /** Plain sentences from FinalPublishWarnings; may be empty. */
    @api warnings = [];

    /**
     * The same findings, each placed where it's fixed (FinalPublishWarnings
     * Item). When present, these are what the dialog shows.
     */
    @api items = [];

    /**
     * Reasons publishing will be refused; may be empty. While any exist,
     * Publish is off. The server refuses them anyway (FinalSpecController
     * runs the same checks) — this only says so before the author tries.
     */
    @api blockers = [];

    /** Placed items, or the plain sentences as unplaced ones. */
    get _found() {
        if (this.items && this.items.length) {
            return this.items;
        }
        return [
            ...(this.blockers || []).map((text) => ({
                severity: BLOCKER,
                text
            })),
            ...(this.warnings || []).map((text) => ({
                severity: 'warning',
                text
            }))
        ];
    }

    get groups() {
        return groupItems(this._found).map((g) => ({
            ...g,
            hasWhere: Boolean(g.area || g.where),
            areaClass: g.where ? 'pd-area pd-area--sep' : 'pd-area',
            goLabel: g.goTo ? `Go to ${g.where || g.area}` : '',
            lines: g.lines.map((l) => ({
                ...l,
                icon: l.blocker ? 'utility:error' : 'utility:warning',
                variant: l.blocker ? 'error' : 'warning',
                alt: l.blocker ? 'Must fix' : 'Warning',
                cls: l.blocker ? 'pd-line pd-line--blocker' : 'pd-line'
            }))
        }));
    }

    get _blockerCount() {
        return countOf(groupItems(this._found), true);
    }

    get _warningCount() {
        return countOf(groupItems(this._found), false);
    }

    get hasBlockers() {
        return this._blockerCount > 0;
    }

    get hasWarnings() {
        return this._warningCount > 0;
    }

    get question() {
        if (this.hasBlockers) {
            const more = this._warningCount;
            return `"${this.formName}" can’t be published yet.${
                more === 1
                    ? ' There’s also 1 thing to know.'
                    : more > 1
                      ? ` There are also ${more} things to know.`
                      : ''
            }`;
        }
        return `Publish "${this.formName}"?`;
    }

    get heading() {
        const blocked = this._blockerCount;
        if (blocked === 1) {
            return 'Fix this before publishing';
        }
        if (blocked > 1) {
            return `Fix ${blocked} things before publishing`;
        }
        const count = this._warningCount;
        if (count === 0) {
            return 'Publish form';
        }
        if (count === 1) {
            return 'One thing to know before publishing';
        }
        return `${count} things to know before publishing`;
    }

    /** The affirmative names the act, not "OK" — it is not a dismissal.
     *  "Anyway" only when there is something to publish past. */
    get confirmLabel() {
        return this.hasWarnings && !this.hasBlockers
            ? 'Publish anyway'
            : 'Publish';
    }

    /** Nothing reaches the live form while something blocks the publish. */
    get showLiveNote() {
        return !this.hasBlockers;
    }

    handlePublish() {
        this.close(true);
    }

    handleCancel() {
        this.close(false);
    }

    /** Closes without publishing, and tells the Studio where to take the author. */
    handleGo(event) {
        const g = groupItems(this._found).find(
            (x) => x.key === event.currentTarget.dataset.key
        );
        if (g && g.goTo) {
            this.close({ goTo: g.goTo });
        }
    }
}
