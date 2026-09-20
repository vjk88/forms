import { api } from 'lwc';
import LightningModal from 'lightning/modal';

/**
 * The publish confirmation **for a publish that has consequences**.
 *
 * A plain publish does not come here: it is one sentence, and the Studio
 * keeps it on `LightningConfirm`, which is the right size for one sentence.
 *
 * What a plain string could not do is hold a LIST. Several warnings ran
 * together into one paragraph, the bullet characters read as stray dots
 * mid-sentence, and "The live form updates immediately" landed after the
 * last warning, where it looked like part of it. A warning nobody can
 * separate from its neighbours is a warning nobody reads.
 *
 * Closing resolves `true` to publish and `false` to cancel — the same
 * contract the caller already had, so only the presentation changed.
 */
export default class FinalPublishDialog extends LightningModal {
    /** The form's name, for the question being asked. */
    @api formName;

    /** Plain sentences from FinalPublishWarnings; may be empty. */
    @api warnings = [];

    get hasWarnings() {
        return Boolean(this.warnings && this.warnings.length);
    }

    get question() {
        return `Publish "${this.formName}"?`;
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
        const count = this.warnings ? this.warnings.length : 0;
        if (count === 1) {
            return 'One thing to know before publishing';
        }
        // Not a path — a publish with nothing to report stays on
        // LightningConfirm. This only keeps a stray open from reading
        // "0 things to know before publishing".
        if (count === 0) {
            return 'Publish form';
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
