import { createElement } from 'lwc';
import FinalNavOneAtATime from 'c/finalNavOneAtATime';

const PAGES = () => [
    {
        id: 'p1',
        sections: [
            { id: 's1', elements: [] },
            { id: 's2', elements: [] }
        ]
    },
    { id: 'p2', sections: [{ id: 's3', elements: [] }] }
];

async function mount(pages = PAGES()) {
    const cmp = createElement('c-final-nav-one-at-a-time', {
        is: FinalNavOneAtATime
    });
    cmp.pages = pages;
    document.body.appendChild(cmp);
    await Promise.resolve();
    return cmp;
}

const progressText = (cmp) =>
    cmp.shadowRoot.querySelector('.progress-text').textContent;

describe('c-final-nav-one-at-a-time', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('one section per screen on the shared engine', async () => {
        const cmp = await mount();
        expect(progressText(cmp)).toBe('1 of 3');
    });

    it('re-assigning pages preserves the screen position (review F10)', async () => {
        const cmp = await mount();
        cmp.shadowRoot.querySelector('.primary-btn').click();
        await Promise.resolve();
        expect(progressText(cmp)).toBe('2 of 3');

        // P3 visibility rules will re-pass a same-shape pages array mid-fill —
        // the user must NOT teleport back to question one.
        cmp.pages = PAGES();
        await Promise.resolve();
        expect(progressText(cmp)).toBe('2 of 3');
    });

    it('shrinking the screen list clamps the position (review F10)', async () => {
        const cmp = await mount();
        cmp.shadowRoot.querySelector('.primary-btn').click();
        await Promise.resolve();
        cmp.shadowRoot.querySelector('.primary-btn').click();
        await Promise.resolve();
        expect(progressText(cmp)).toBe('3 of 3');

        cmp.pages = [{ id: 'p1', sections: [{ id: 's1', elements: [] }] }];
        await Promise.resolve();
        expect(progressText(cmp)).toBe('1 of 1');
    });

    it('last screen swaps the primary to Submit and dispatches submit', async () => {
        const cmp = await mount([
            { id: 'p1', sections: [{ id: 's1', elements: [] }] }
        ]);
        const handler = jest.fn();
        cmp.addEventListener('submit', handler);
        const btn = cmp.shadowRoot.querySelector('.primary-btn');
        expect(btn.textContent).toBe('Submit');
        btn.click();
        expect(handler).toHaveBeenCalled();
    });
});
