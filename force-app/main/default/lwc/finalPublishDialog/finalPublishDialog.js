import { api } from 'lwc';
import LightningModal from 'lightning/modal';

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
 * Closing resolves `true` to publish and `false` to cancel — the same
 * contract the caller already had, so only the presentation changed.
 */
export default class FinalPublishDialog extends LightningModal {
    /** The form's name, for the question being asked. */
    @api formName;

    /** Plain sentences from FinalPublishWarnings; may be empty. */
    @api warnings = [];

    /**
     * Reasons publishing will be refused; may be empty. While any exist,
     * Publish is off. The server refuses them anyway (FinalSpecController
     * runs the same checks) — this only says so before the author tries.
     */
    @api blockers = [];

    get hasBlockers() {
        return Boolean(this.blockers && this.blockers.length);
    }

    get blockerItems() {
        return (this.blockers || []).map((text, i) => ({
            key: `b${i}`,
            text
        }));
    }

    get hasWarnings() {
        return Boolean(this.warnings && this.warnings.length);
    }

    get question() {
        return this.hasBlockers
            ? `"${this.formName}" can’t be published yet.`
            : `Publish "${this.formName}"?`;
    }

    /**
     * Keyed for the template, and numbered: an author who is told there are
     * two consequences reads for two, where an unnumbered list invites
     * stopping at the first.
     */
    get consequences() {
        return (this.warnings || []).map((text, i) => ({
            key: `w${i}`,
            text
        }));
    }

    get heading() {
        const blocked = this.blockers ? this.blockers.length : 0;
        if (blocked === 1) {
            return 'Fix this before publishing';
        }
        if (blocked > 1) {
            return `Fix ${blocked} things before publishing`;
        }
        const count = this.warnings ? this.warnings.length : 0;
        if (count === 0) {
            return 'Publish form';
        }
        if (count === 1) {
            return 'One thing to know before publishing';
        }
        return `${count} things to know before publishing`;
    }

    /** The affirmative names the act, not "OK" — it is not a dismissal. */
    get confirmLabel() {
        return this.hasWarnings ? 'Publish anyway' : 'Publish';
    }

    handlePublish() {
        this.close(true);
    }

    handleCancel() {
        this.close(false);
    }
}
