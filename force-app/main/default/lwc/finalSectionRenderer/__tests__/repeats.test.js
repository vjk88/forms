import { createElement } from 'lwc';
import FinalSectionRenderer from 'c/finalSectionRenderer';

// Repeatable sections (schema §4.1): defined once, instantiated at runtime;
// entries answer as ONE consolidated `repeat:{sectionId}` value.
const SECTION = () => ({
    id: 'sec_rep',
    title: 'Team members',
    columns: 1,
    repeat: {
        childObject: 'Contact',
        relationshipField: 'AccountId',
        style: 'stacked',
        addLabel: 'Add member',
        entryLabel: 'Member {index}',
        min: 1,
        max: 3
    },
    elements: [
        {
            id: 'el_name',
            type: 'field',
            label: 'Name',
            config: { inputType: 'text' }
        }
    ]
});

const flush = () => Promise.resolve();

async function mount(section = SECTION()) {
    const el = createElement('c-final-section-renderer', {
        is: FinalSectionRenderer
    });
    el.section = section;
    document.body.appendChild(el);
    await flush();
    return el;
}

describe('c-final-section-renderer repeats', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders min entries with instanced ids, {index} labels, and the add button', async () => {
        const el = await mount();
        const entries = el.shadowRoot.querySelectorAll('.rep-entry');
        expect(entries).toHaveLength(1);
        expect(
            el.shadowRoot.querySelector('.rep-entry-label').textContent
        ).toBe('Member 1');
        const renderer = el.shadowRoot.querySelector(
            'c-final-element-renderer'
        );
        expect(renderer.element.id).toContain('el_name::');
        expect(el.shadowRoot.querySelector('.rep-add').textContent).toContain(
            'Add member'
        );
        // min floor: the only entry can't be removed
        expect(el.shadowRoot.querySelector('.rep-remove')).toBeNull();
    });

    it('add/remove respect min & max; every change re-emits the consolidated answer', async () => {
        const el = await mount();
        const answers = [];
        el.addEventListener('valuechange', (e) => answers.push(e.detail));

        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        expect(el.shadowRoot.querySelectorAll('.rep-entry')).toHaveLength(3);
        // max = 3 → the add affordance is gone
        expect(el.shadowRoot.querySelector('.rep-add')).toBeNull();
        expect(answers.at(-1)).toEqual({
            elementId: 'repeat:sec_rep',
            value: [{}, {}, {}]
        });

        el.shadowRoot.querySelector('.rep-remove').click();
        await flush();
        expect(el.shadowRoot.querySelectorAll('.rep-entry')).toHaveLength(2);
        expect(answers.at(-1).value).toEqual([{}, {}]);
    });

    it('entry inputs fold into per-entry maps keyed by the ORIGINAL element id', async () => {
        const el = await mount();
        el.shadowRoot.querySelector('.rep-add').click();
        await flush();
        const answers = [];
        el.addEventListener('valuechange', (e) => answers.push(e.detail));

        const renderers = el.shadowRoot.querySelectorAll(
            'c-final-element-renderer'
        );
        renderers[1].dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: renderers[1].element.id, value: 'Kim' }
            })
        );
        expect(answers.at(-1)).toEqual({
            elementId: 'repeat:sec_rep',
            value: [{}, { el_name: 'Kim' }]
        });

        // removing entry 1 keeps entry 2's values, reordered
        el.shadowRoot.querySelector('.rep-remove').click();
        await flush();
        expect(answers.at(-1).value).toEqual([{ el_name: 'Kim' }]);
    });

    it('non-repeat sections re-emit plain valuechange untouched', async () => {
        const plain = SECTION();
        delete plain.repeat;
        const el = await mount(plain);
        const answers = [];
        el.addEventListener('valuechange', (e) => answers.push(e.detail));
        const renderer = el.shadowRoot.querySelector(
            'c-final-element-renderer'
        );
        renderer.dispatchEvent(
            new CustomEvent('valuechange', {
                detail: { elementId: 'el_name', value: 'x' }
            })
        );
        expect(answers).toEqual([{ elementId: 'el_name', value: 'x' }]);
    });
});
