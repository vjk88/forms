/**
 * finalHistoryManager — undo/redo over spec snapshots (BUILD_PHASES P3
 * slice 6: in-memory, per-studio-session, coalescing).
 *
 * Pure module: no LWC, no DOM. Snapshots are OPAQUE strings (the studio
 * passes JSON.stringify(spec)) — string identity doubles as the no-op
 * check, and parsing stays the caller's business.
 *
 * Coalescing: edits landing within `coalesceMs` of the previous one REPLACE
 * the present instead of minting a new step — a typed word is one undo, not
 * five. The step BEFORE a burst is always preserved.
 *
 * Redo dies on a new edit (the universal convention); `limit` caps memory
 * (oldest steps fall off — never the present).
 */

export function createHistory({ limit = 50, coalesceMs = 800 } = {}) {
    let past = [];
    let future = [];
    let present = null;
    let lastRecordAt = 0;

    return {
        /** Start over from a loaded spec — nothing to undo into. */
        reset(snapshot) {
            past = [];
            future = [];
            present = snapshot;
            lastRecordAt = 0;
        },

        /** A new state arrived from an edit. */
        record(snapshot, now = Date.now()) {
            if (snapshot === present) {
                return;
            }
            const coalesce =
                lastRecordAt !== 0 && now - lastRecordAt < coalesceMs;
            if (!coalesce) {
                past.push(present);
                if (past.length > limit) {
                    past.shift();
                }
            }
            present = snapshot;
            future = [];
            lastRecordAt = now;
        },

        /** Step back; returns the restored snapshot or null. */
        undo() {
            if (!past.length) {
                return null;
            }
            future.push(present);
            present = past.pop();
            lastRecordAt = 0; // an undo ends any burst
            return present;
        },

        /** Step forward again; returns the restored snapshot or null. */
        redo() {
            if (!future.length) {
                return null;
            }
            past.push(present);
            present = future.pop();
            lastRecordAt = 0;
            return present;
        },

        get canUndo() {
            return past.length > 0;
        },

        get canRedo() {
            return future.length > 0;
        }
    };
}
