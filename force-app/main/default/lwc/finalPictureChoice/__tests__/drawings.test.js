import { createElement } from 'lwc';
import FinalPictureChoice from 'c/finalPictureChoice';
import { designArt } from 'c/finalDesignArt';

// Design's picture tiles: drawings from data and 3 or 4 tiles per row.
const OPTIONS = ['underline', 'pills', 'enclosed'].map((value) => ({
    value,
    label: value,
    drawing: designArt('tabStyle', value)
}));

function mount(props = {}) {
    const el = createElement('c-final-picture-choice', {
        is: FinalPictureChoice
    });
    Object.assign(el, {
        label: 'Style',
        options: OPTIONS,
        value: 'pills',
        ...props
    });
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-picture-choice drawings', () => {
    it('draws every shape of each option as svg, decorative only', () => {
        const el = mount();
        const svgs = el.shadowRoot.querySelectorAll('.pc-art-draw');
        expect(svgs).toHaveLength(3);
        const shapes = svgs[1].querySelectorAll('rect, circle, path');
        expect(shapes).toHaveLength(OPTIONS[1].drawing.shapes.length);
        expect(svgs[1].closest('.pc-art').getAttribute('aria-hidden')).toBe(
            'true'
        );
        // no select-box fallback drawing on a drawn tile
        expect(el.shadowRoot.querySelector('.pc-art-select')).toBeNull();
    });

    it('columns sets 3 or 4 tiles per row, else the 2-column grid', async () => {
        const el = mount({ columns: 3 });
        expect(el.shadowRoot.querySelector('.pc-grid--3')).not.toBeNull();
        el.columns = 4;
        await Promise.resolve();
        expect(el.shadowRoot.querySelector('.pc-grid--4')).not.toBeNull();
        el.columns = 7;
        await Promise.resolve();
        expect(el.shadowRoot.querySelector('.pc-grid').className).toBe(
            'pc-grid'
        );
    });

    it('a mesh blob keeps its own color', () => {
        const el = mount({
            options: [
                {
                    value: 'x',
                    label: 'X',
                    drawing: {
                        viewBox: '0 0 56 36',
                        shapes: [
                            {
                                t: 'circle',
                                cx: 5,
                                cy: 5,
                                r: 3,
                                c: 'pa-blob',
                                fill: '#ff0000'
                            }
                        ]
                    }
                }
            ],
            value: 'x'
        });
        const blob = el.shadowRoot.querySelector('circle.pa-blob');
        expect(blob.getAttribute('style')).toContain('#ff0000');
    });
});
