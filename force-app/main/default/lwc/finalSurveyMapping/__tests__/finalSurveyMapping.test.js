import {
    compatInputTypes,
    mappedElements,
    pruneRecordRules
} from 'c/finalSurveyMapping';

/** SO review round: disconnect/change must clean record rules SAFELY —
 *  row surgery for all/any, whole-config removal for custom logic. */

const recordRow = (field) => ({
    source: `record:${field}`,
    operator: 'equals',
    value: 'x'
});
const answerRow = { source: 'el_a', operator: 'equals', value: 'y' };

const spec = (visibility) => ({
    pages: [
        {
            id: 'pg_1',
            sections: [
                {
                    id: 'sec_1',
                    elements: [
                        { id: 'el_a', type: 'field', label: 'A' },
                        {
                            id: 'el_b',
                            type: 'field',
                            label: 'Gated',
                            visibility
                        }
                    ]
                }
            ]
        }
    ]
});

describe('pruneRecordRules', () => {
    it('disconnect (null liveFields) removes record rows, keeps answer rows', () => {
        const s = spec({
            action: 'show',
            logic: 'all',
            rules: [recordRow('Status__c'), answerRow]
        });
        const casualties = pruneRecordRules(s, null);
        const vis = s.pages[0].sections[0].elements[1].visibility;
        expect(vis.rules).toEqual([answerRow]);
        expect(casualties).toEqual(['"Gated" — 1 record rule removed']);
    });

    it('object change keeps rows whose field lives on the new object', () => {
        const s = spec({
            action: 'show',
            logic: 'any',
            rules: [recordRow('Keep__c'), recordRow('Gone__c')]
        });
        pruneRecordRules(s, new Set(['Keep__c']));
        const vis = s.pages[0].sections[0].elements[1].visibility;
        expect(vis.rules).toEqual([recordRow('Keep__c')]);
    });

    it('a config left with zero rows is deleted outright', () => {
        const s = spec({
            action: 'show',
            logic: 'all',
            rules: [recordRow('Status__c')]
        });
        const casualties = pruneRecordRules(s, null);
        expect(s.pages[0].sections[0].elements[1].visibility).toBeUndefined();
        expect(casualties).toEqual(['"Gated" — rules removed']);
    });

    it('custom logic never gets spliced — the whole config dies instead', () => {
        // removing row 2 from "1 AND (2 OR 3)" would silently rewire the
        // expression; whole-config removal is the predictable failure
        const s = spec({
            action: 'show',
            logic: 'custom',
            customLogic: '1 AND (2 OR 3)',
            rules: [answerRow, recordRow('Status__c'), answerRow]
        });
        const casualties = pruneRecordRules(s, null);
        expect(s.pages[0].sections[0].elements[1].visibility).toBeUndefined();
        expect(casualties).toEqual([
            '"Gated" — rules removed (custom logic referenced the object)'
        ]);
    });

    it('answer-only configs and clean specs are untouched (no casualties)', () => {
        const s = spec({ action: 'show', logic: 'all', rules: [answerRow] });
        expect(pruneRecordRules(s, null)).toEqual([]);
        expect(s.pages[0].sections[0].elements[1].visibility.rules).toEqual([
            answerRow
        ]);
    });

    it('exports stay intact (regression guard for the shared module)', () => {
        expect(compatInputTypes({ type: 'nps' })).toEqual(['number']);
        expect(mappedElements({ pages: [] })).toEqual([]);
    });
});
