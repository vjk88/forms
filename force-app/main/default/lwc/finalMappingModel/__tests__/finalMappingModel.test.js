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
    actionState,
    setFilterMode,
    soqlTokenIds
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

describe('typed conditions (D50)', () => {
    const findStep = (match) => ({
        id: 'act_a',
        object: 'Contact',
        operation: 'findOrCreate',
        match: {
            field: 'Email',
            source: answer('el_e'),
            onMatch: 'reuse',
            filter: { logic: 'all', rows: [] },
            ...match
        },
        fields: [{ field: 'LastName', source: answer('el_n') }]
    });
    const specWith = (action) => ({
        ...base(),
        mapping: { actions: [action] }
    });

    it('setFilterMode switches to typed text and back', () => {
        let spec = specWith(
            findStep({
                filter: {
                    logic: 'all',
                    rows: [{ fieldPath: 'Title', operator: 'eq', value: 'x' }]
                }
            })
        );
        spec = setFilterMode(spec, 'act_a', 'soql', 'LastName = {!el_n}');
        let m = actionsOf(spec)[0].match;
        expect(m.filterMode).toBe('soql');
        expect(m.soql).toBe('LastName = {!el_n}');
        expect(m.filter.rows).toEqual([]);
        spec = setFilterMode(spec, 'act_a', 'rows');
        m = actionsOf(spec)[0].match;
        expect(m.filterMode).toBeUndefined();
        expect(m.soql).toBeUndefined();
    });

    it('reads token ids outside quoted text only', () => {
        expect(
            soqlTokenIds("A = {!el_a} AND B = '{!el_b}' OR C = {!el_c}")
        ).toEqual(['el_a', 'el_c']);
    });

    it('answerIndex marks answers that narrow the search, typed or built', () => {
        const typed = answerIndex(
            specWith(findStep({ filterMode: 'soql', soql: 'Title = {!el_t}' }))
        );
        expect(typed.get('el_t')[0].use).toBe('filter');
        const rows = answerIndex(
            specWith(
                findStep({
                    filter: {
                        logic: 'all',
                        rows: [
                            {
                                fieldPath: 'Title',
                                operator: 'eq',
                                value: '$field.el_t'
                            },
                            {
                                fieldPath: 'Dept',
                                operator: 'in',
                                values: ['$field.el_d']
                            }
                        ]
                    }
                })
            )
        );
        expect(rows.get('el_t')[0].use).toBe('filter');
        expect(rows.get('el_d')[0].use).toBe('filter');
    });

    it('a typed step is complete only with text', () => {
        expect(
            actionState([findStep({ filterMode: 'soql', soql: '  ' })], 0)
        ).toBe('incomplete');
        expect(
            actionState(
                [findStep({ filterMode: 'soql', soql: 'Title = {!el_t}' })],
                0
            )
        ).toBe('ok');
    });
});

describe('pre-filling the searched field (decision 12)', () => {
    const step = () => ({
        ...base(),
        mapping: {
            actions: [
                {
                    id: 'act_a',
                    object: 'Contact',
                    operation: 'findOrCreate',
                    match: { filter: { logic: 'all', rows: [] } },
                    fields: [{ field: 'LastName', source: answer('el_n') }]
                }
            ]
        }
    });
    const fieldsOf = (spec) => actionsOf(spec)[0].fields;
    const pickEmail = (spec) =>
        setMatch(setMatch(spec, 'act_a', { field: 'Email' }), 'act_a', {
            source: answer('el_e')
        });

    it('adds the searched field, fed by its answer, once both are chosen', () => {
        const spec = setMatch(step(), 'act_a', { field: 'Email' });
        expect(fieldsOf(spec).map((x) => x.field)).toEqual(['LastName']);
        const done = setMatch(spec, 'act_a', { source: answer('el_e') });
        expect(fieldsOf(done)[0]).toEqual({
            field: 'Email',
            source: answer('el_e'),
            prefilled: true
        });
    });

    it('follows a source change while untouched', () => {
        const spec = setMatch(pickEmail(step()), 'act_a', {
            source: answer('el_x')
        });
        expect(fieldsOf(spec)[0].source).toEqual(answer('el_x'));
    });

    it('stays as the author set it once edited', () => {
        let spec = setFieldSource(pickEmail(step()), 'act_a', 'Email', {
            kind: 'literal',
            value: 'x@y.z'
        });
        expect(fieldsOf(spec)[0].prefilled).toBeUndefined();
        spec = setMatch(spec, 'act_a', { source: answer('el_x') });
        expect(fieldsOf(spec)[0].source).toEqual({
            kind: 'literal',
            value: 'x@y.z'
        });
    });

    it('is not re-added after deletion when the filter or source changes', () => {
        let spec = removeField(pickEmail(step()), 'act_a', 'Email');
        spec = setMatch(spec, 'act_a', {
            filter: {
                logic: 'all',
                rows: [{ fieldPath: 'Title', operator: 'eq', value: 'x' }]
            }
        });
        spec = setMatch(spec, 'act_a', { source: answer('el_x') });
        expect(fieldsOf(spec).map((x) => x.field)).toEqual(['LastName']);
    });

    it('is offered again when the search field changes', () => {
        let spec = removeField(pickEmail(step()), 'act_a', 'Email');
        spec = setMatch(spec, 'act_a', { field: 'Phone' });
        expect(fieldsOf(spec)[0]).toEqual({
            field: 'Phone',
            source: answer('el_e'),
            prefilled: true
        });
    });

    it('drops the old untouched pre-fill when the search field changes', () => {
        const spec = setMatch(pickEmail(step()), 'act_a', { field: 'Phone' });
        expect(fieldsOf(spec).map((x) => x.field)).toEqual([
            'Phone',
            'LastName'
        ]);
    });
});
