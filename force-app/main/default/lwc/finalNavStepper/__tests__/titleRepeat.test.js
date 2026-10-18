import { createElement } from 'lwc';
import FinalNavStepper from 'c/finalNavStepper';

/**
 * The wizard strip and a section title the viewer tucked away "while wide"
 * (DEFERRED 37, docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md).
 *
 * A step's name is on screen while the strip shows its labels. The stylesheet
 * gives the title back when the form is 540px wide or narrower (the strip drops
 * to dots). The measured fit ladder can ALSO drop the labels at any width: ten
 * steps need 580px for numbers plus the active label, so in a 560px form they
 * collapse to dots and no step shows its name. There the title is the page's only
 * name, and the strip gives it back itself.
 */
let observers = [];

beforeEach(() => {
    observers = [];
    global.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            observers.push(this);
        }

        observe() {}

        disconnect() {}
    };
});

afterEach(() => {
    delete global.ResizeObserver;
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

const pages = (n) =>
    Array.from({ length: n }, (_, i) => ({
        id: `pg_${i}`,
        name: `Step name ${i}`,
        sections: [
            {
                id: `s_${i}`,
                title: `Title ${i}`,
                titleRepeatsPage: 'wide',
                elements: []
            },
            // a section the viewer did not mark is never touched
            { id: `t_${i}`, title: `Other ${i}`, elements: [] }
        ]
    }));

function mount(list) {
    const el = createElement('c-final-nav-stepper', { is: FinalNavStepper });
    el.pages = list;
    el.currentPageIndex = 0;
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve();
const marks = (el) =>
    el.shadowRoot
        .querySelector('c-final-layout-zones')
        .sections.map((s) => s.titleRepeatsPage);
const resize = async (width) => {
    observers[0].callback([{ contentRect: { width } }]);
    await flush();
};

describe('c-final-nav-stepper, a section title the viewer tucked away while wide', () => {
    it('keeps the mark while every step shows its label (full) or the active one does (compact)', async () => {
        const el = mount(pages(10));
        await flush();
        await resize(1400); // 10 x 120 fits: full
        expect(marks(el)).toEqual(['wide', undefined]);
        await resize(650); // 10 x 44 + 140 fits: numbers + the active label
        expect(marks(el)).toEqual(['wide', undefined]);
    });

    it('gives the title back when the strip collapses to dots at a wide width: no step shows its name', async () => {
        const el = mount(pages(10));
        await flush();
        await resize(560); // 580 needed: collapse
        expect(marks(el)).toEqual([false, undefined]);
    });

    it('and takes it away again when the form gets wide enough for the labels', async () => {
        const el = mount(pages(10));
        await flush();
        await resize(560);
        expect(marks(el)).toEqual([false, undefined]);
        await resize(1400);
        expect(marks(el)).toEqual(['wide', undefined]);
    });

    it('a small wizard never collapses at a wide width, so nothing changes', async () => {
        const el = mount(pages(3));
        await flush();
        await resize(600); // 3 x 120 fits
        expect(marks(el)).toEqual(['wide', undefined]);
    });
});
