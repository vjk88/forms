import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import { reconcileAnswers } from '../previewSession';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));

const question = (id, type = 'field', config = {}) => ({
    id,
    type,
    label: id,
    config
});
const spec = (elements) => ({
    specVersion: 1,
    form: { name: 'Test', type: 'survey' },
    layout: { type: 'stepper' },
    theme: null,
    header: { style: 'none' },
    pages: [{ id: 'p1', sections: [{ id: 's1', elements }] }]
});
const clone = (value) => JSON.parse(JSON.stringify(value));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const nav = (cmp) => cmp.shadowRoot.querySelector('x-test');
const answer = (cmp, elementId, value) =>
    nav(cmp).dispatchEvent(
        new CustomEvent('valuechange', { detail: { elementId, value } })
    );
async function mount(value, preservePreview = true) {
    const cmp = createElement('c-final-form-viewer', { is: FinalFormViewer });
    cmp.preservePreview = preservePreview;
    cmp.spec = value;
    document.body.appendChild(cmp);
    await flush();
    return cmp;
}
afterEach(() => {
    while (document.body.firstChild) document.body.firstChild.remove();
});

describe('preview answer reconciliation', () => {
    it('does not treat an empty options bag on a text field as a choice list', () => {
        const before = spec([
            question('text', 'field', { inputType: 'text', options: [] })
        ]);
        expect(
            reconcileAnswers({ text: 'Keep me' }, before, clone(before))
        ).toEqual({ text: 'Keep me' });
    });
    it('keeps hidden answers and prunes only removed or incompatible questions', () => {
        const before = spec([
            question('keep'),
            question('gone'),
            question('type'),
            question('binding')
        ]);
        const after = clone(before);
        after.pages[0].sections[0].elements = [
            { ...question('keep'), label: 'New', visibility: { rules: [] } },
            question('type', 'field', { inputType: 'number' }),
            {
                ...question('binding'),
                binding: { object: 'Contact', field: 'Email' }
            }
        ];
        expect(
            reconcileAnswers(
                { keep: 'yes', gone: 'old', type: 'abc', binding: 'x' },
                before,
                after
            )
        ).toEqual({ keep: 'yes' });
    });
    it('reconciles choices, Other, rankings, matrix and Likert by value', () => {
        const options = ['a', 'b'].map((value) => ({ value }));
        const before = spec([
            question('multi', 'field', {
                options,
                renderAs: 'Checkbox_Group',
                allowOther: true
            }),
            question('rank', 'ranking', { options }),
            question('matrix', 'matrix', { rows: options }),
            question('likert', 'likert')
        ]);
        const after = clone(before);
        const els = after.pages[0].sections[0].elements;
        els[0].config.options = [{ value: 'b', label: 'renamed' }];
        els[1].config.options = [{ value: 'b' }, { value: 'c' }];
        els[2].config.rows = [{ value: 'b' }];
        els[3].config.points = [{ value: 1 }];
        expect(
            reconcileAnswers(
                {
                    multi: ['a', 'b', 'custom'],
                    rank: ['b', 'a'],
                    matrix: { a: 1, b: 3 },
                    likert: 5
                },
                before,
                after
            )
        ).toEqual({
            multi: ['b', 'custom'],
            rank: ['b', 'c'],
            matrix: { b: 3 }
        });
    });
    it('keeps file object references, drops deleted files and trims single-file answers', () => {
        const file = Object.freeze({ name: 'proof.pdf', base64: 'YWJj' });
        const before = spec([
            question('file', 'file', { multiple: true }),
            question('gone', 'file')
        ]);
        const after = spec([question('file', 'file')]);
        const result = reconcileAnswers(
            { file: [file, file], gone: [file] },
            before,
            after
        );
        expect(result.file).toHaveLength(1);
        expect(result.file[0]).toBe(file);
        expect(result.gone).toBeUndefined();
    });
    it('prunes repeat cells, obeys row limits and resets changed child objects', () => {
        const before = spec([question('a'), question('b')]);
        before.pages[0].sections[0].repeat = {
            childObject: 'Contact',
            relationshipField: 'AccountId',
            min: 1,
            max: 3
        };
        const after = clone(before);
        const section = after.pages[0].sections[0];
        section.elements.pop();
        section.repeat.max = 1;
        const answers = { 'repeat:s1': [{ a: 'one', b: 'old' }, { a: 'two' }] };
        expect(reconcileAnswers(answers, before, after)).toEqual({
            'repeat:s1': [{ a: 'one' }]
        });
        section.repeat.childObject = 'Case';
        expect(reconcileAnswers(answers, before, after)).toEqual({});
        expect(answers['repeat:s1'][0].b).toBe('old');
    });
});

describe('real viewer preview session', () => {
    it('keeps answers entered during rapid spec applies and clamps a removed current page', async () => {
        const before = spec([question('a')]);
        before.pages.push({
            id: 'p2',
            sections: [{ id: 's2', elements: [question('b')] }]
        });
        const cmp = await mount(before);
        nav(cmp).dispatchEvent(
            new CustomEvent('pagechange', { detail: { index: 1 } })
        );
        cmp.spec = clone(before);
        cmp.spec = spec([question('a')]);
        answer(cmp, 'a', 'Typed while applying');
        await flush();
        expect(cmp.getPreviewState().answers.a).toBe('Typed while applying');
        expect(cmp.getPreviewState().anchor.key).toBe('p1');
        expect(cmp.getPreviewState().pageIndex).toBe(0);
    });
    it('preserves live answers across edits and anchors the page through insertion and one-per-screen', async () => {
        const before = spec([question('a')]);
        before.pages.push({
            id: 'p2',
            sections: [{ id: 's2', elements: [question('b')] }]
        });
        const cmp = await mount(before);
        answer(cmp, 'a', 'entered');
        nav(cmp).dispatchEvent(
            new CustomEvent('pagechange', { detail: { index: 1 } })
        );
        const after = clone(before);
        after.pages.unshift({ id: 'new', sections: [] });
        cmp.spec = after;
        await flush();
        expect(cmp.getPreviewState().answers).toEqual({ a: 'entered' });
        expect(cmp.getPreviewState().pageIndex).toBe(2);
        expect(nav(cmp).pages[1].sections[0].elements[0].value).toBe('entered');
        cmp.spec = { ...after, settings: { onePerScreen: true } };
        await flush();
        expect(cmp.getPreviewState().anchor.key).toBe('p2~b');
        expect(cmp.getPreviewState().pageIndex).toBe(1);
    });
    it('uses preserved inputs immediately when visibility rules change', async () => {
        const before = spec([question('driver'), question('dependent')]);
        const cmp = await mount(before);
        answer(cmp, 'driver', 'Yes');
        answer(cmp, 'dependent', 'Retain me');
        const after = clone(before);
        after.pages[0].sections[0].elements[1].visibility = {
            action: 'show',
            logic: 'all',
            rules: [{ source: 'driver', operator: 'equals', value: 'No' }]
        };
        cmp.spec = after;
        await flush();
        expect(nav(cmp).pages[0].sections[0].elements).toHaveLength(1);
        expect(cmp.getPreviewState().answers.dependent).toBe('Retain me');
        answer(cmp, 'driver', 'No');
        await flush();
        expect(nav(cmp).pages[0].sections[0].elements[1].value).toBe(
            'Retain me'
        );
    });
    it('leaves ordinary inline viewers on their existing reset behavior', async () => {
        const before = spec([question('a')]);
        const cmp = await mount(before, false);
        answer(cmp, 'a', 'entered');
        cmp.spec = clone(before);
        await flush();
        expect(nav(cmp).pages[0].sections[0].elements[0].value).toBeUndefined();
        expect(cmp.getPreviewState()).toBeUndefined();
    });
});
