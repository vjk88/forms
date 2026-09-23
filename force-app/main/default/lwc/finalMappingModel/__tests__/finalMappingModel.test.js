import {
    MAX_STEPS,
    actionsOf,
    addAction,
    removeAction,
    moveAction,
    setOperation,
    setFieldSource,
    removeField,
    setMatch,
    setOnMatch,
    setWriteOnMatch,
    answerIndex,
    actionState
} from 'c/finalMappingModel';

const base = () => ({ specVersion: 1, pages: [] });
const answer = (elementKey) => ({ kind: 'answer', elementKey });

describe('finalMappingModel', () => {
    it('adds steps with fresh ids and never mutates its input', () => {
        const spec = base();
        const { spec: next, actionId } = addAction(spec, 'Contact', 'create');
        expect(spec.mapping).toBeUndefined();
        expect(actionId).toMatch(/^act_[a-z0-9]{8}$/);
        expect(actionsOf(next)).toEqual([
            { id: actionId, object: 'Contact', operation: 'create', fields: [] }
        ]);
    });

    it('stops at the cap', () => {
        let spec = base();
        for (let i = 0; i < MAX_STEPS; i++)
            spec = addAction(spec, 'Contact', 'create').spec;
        const { spec: same, actionId } = addAction(spec, 'Contact', 'create');
        expect(actionId).toBeNull();
        expect(actionsOf(same)).toHaveLength(MAX_STEPS);
    });

    it('a new find-or-create step has no match answer', () => {
        const { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
        const a = actionsOf(spec).find((x) => x.id === actionId);
        expect(a.match).toEqual({
            field: null,
            source: null,
            filter: { logic: 'all', rows: [] }
        });
        expect('onMatch' in a.match).toBe(false);
    });

    it('moves steps', () => {
        let spec = addAction(base(), 'Contact', 'create').spec;
        spec = addAction(spec, 'Case', 'create').spec;
        expect(actionsOf(moveAction(spec, 1, 0)).map((a) => a.object)).toEqual([
            'Case',
            'Contact'
        ]);
    });

    it('removing a step leaves references to it for publish to name', () => {
        let { spec, actionId: first } = addAction(base(), 'Contact', 'create');
        const r = addAction(spec, 'Contact', 'create');
        spec = setFieldSource(r.spec, r.actionId, 'ReportsToId', {
            kind: 'recordRef',
            ref: `action:${first}`
        });
        spec = removeAction(spec, first);
        const left = actionsOf(spec)[0];
        expect(left.fields[0].source.ref).toBe(`action:${first}`);
        expect(actionState(actionsOf(spec), 0)).toBe('broken');
    });

    it('sets, replaces and removes a field source', () => {
        const { spec, actionId } = addAction(base(), 'Contact', 'create');
        let next = setFieldSource(spec, actionId, 'LastName', answer('el_a'));
        next = setFieldSource(next, actionId, 'LastName', answer('el_b'));
        expect(actionsOf(next)[0].fields).toEqual([
            { field: 'LastName', source: answer('el_b') }
        ]);
        expect(
            actionsOf(removeField(next, actionId, 'LastName'))[0].fields
        ).toEqual([]);
    });

    it('switching back to create drops the match and every overwrite flag', () => {
        let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
        spec = setFieldSource(spec, actionId, 'Title', answer('el_t'));
        spec = setOnMatch(spec, actionId, 'update');
        spec = setWriteOnMatch(spec, actionId, 'Title', true);
        spec = setOperation(spec, actionId, 'create');
        const a = actionsOf(spec)[0];
        expect(a.match).toBeUndefined();
        expect(a.fields[0].writeOnMatch).toBeUndefined();
    });

    it('reuse clears overwrite flags; the match field can never be flagged', () => {
        let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
        spec = setMatch(spec, actionId, {
            field: 'Email',
            source: answer('el_e')
        });
        spec = setFieldSource(spec, actionId, 'Email', answer('el_e'));
        spec = setFieldSource(spec, actionId, 'Title', answer('el_t'));
        spec = setOnMatch(spec, actionId, 'update');
        spec = setWriteOnMatch(spec, actionId, 'Email', true);
        spec = setWriteOnMatch(spec, actionId, 'Title', true);
        let a = actionsOf(spec)[0];
        expect(
            a.fields.find((f) => f.field === 'Email').writeOnMatch
        ).toBeUndefined();
        expect(a.fields.find((f) => f.field === 'Title').writeOnMatch).toBe(
            true
        );
        spec = setOnMatch(spec, actionId, 'reuse');
        a = actionsOf(spec)[0];
        expect(
            a.fields.find((f) => f.field === 'Title').writeOnMatch
        ).toBeUndefined();
    });

    it('indexes answers by where they go', () => {
        let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
        spec = setMatch(spec, actionId, {
            field: 'Email',
            source: answer('el_e')
        });
        spec = setFieldSource(spec, actionId, 'Email', answer('el_e'));
        const index = answerIndex(spec);
        expect(index.get('el_e')).toEqual([
            {
                actionId,
                object: 'Contact',
                field: 'Email',
                use: 'match',
                step: 1
            },
            {
                actionId,
                object: 'Contact',
                field: 'Email',
                use: 'value',
                step: 1
            }
        ]);
    });

    it('calls a step incomplete until its match question is answered', () => {
        let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
        spec = setMatch(spec, actionId, {
            field: 'Email',
            source: answer('el_e'),
            filter: {
                logic: 'all',
                rows: [{ fieldPath: 'LastName', operator: 'isNotBlank' }]
            }
        });
        spec = setFieldSource(spec, actionId, 'LastName', answer('el_l'));
        expect(actionState(actionsOf(spec), 0)).toBe('incomplete');
        spec = setOnMatch(spec, actionId, 'reuse');
        expect(actionState(actionsOf(spec), 0)).toBe('ok');
    });

    it('a filter row still waiting for its value is unfinished', () => {
        let { spec, actionId } = addAction(base(), 'Contact', 'findOrCreate');
        spec = setMatch(spec, actionId, {
            field: 'Email',
            source: answer('el_e'),
            filter: {
                logic: 'all',
                rows: [{ fieldPath: 'Id', operator: 'eq', value: '' }]
            }
        });
        spec = setFieldSource(spec, actionId, 'LastName', answer('el_l'));
        spec = setOnMatch(spec, actionId, 'reuse');
        expect(actionState(actionsOf(spec), 0)).toBe('incomplete');
    });

    it('a field with no source picked yet is unfinished, not fine', () => {
        const created = addAction(base(), 'Contact', 'create');
        // exactly what "Add a field" leaves behind
        const spec = setFieldSource(
            created.spec,
            created.actionId,
            'Email',
            null
        );
        expect(actionState(actionsOf(spec), 0)).toBe('incomplete');
    });

    it('counts false and 0 as real fixed values', () => {
        const created = addAction(base(), 'Contact', 'create');
        let spec = setFieldSource(created.spec, created.actionId, 'DoNotCall', {
            kind: 'literal',
            value: false
        });
        expect(actionState(actionsOf(spec), 0)).toBe('ok');
        spec = setFieldSource(created.spec, created.actionId, 'Level__c', {
            kind: 'literal',
            value: 0
        });
        expect(actionState(actionsOf(spec), 0)).toBe('ok');
    });

    it('an empty fixed value is unfinished', () => {
        const created = addAction(base(), 'Contact', 'create');
        const spec = setFieldSource(created.spec, created.actionId, 'Title', {
            kind: 'literal',
            value: ''
        });
        expect(actionState(actionsOf(spec), 0)).toBe('incomplete');
    });

    it('indexes the record picked in a lookup question as a link', () => {
        const created = addAction(base(), 'Contact', 'create');
        const spec = setFieldSource(
            created.spec,
            created.actionId,
            'ReportsToId',
            {
                kind: 'recordRef',
                ref: 'answer:el_pick'
            }
        );
        expect(answerIndex(spec).get('el_pick')).toEqual([
            {
                actionId: created.actionId,
                object: 'Contact',
                field: 'ReportsToId',
                use: 'link',
                step: 1
            }
        ]);
    });
});
