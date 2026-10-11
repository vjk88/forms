/**
 * The 0-10 (NPS) question: centered, balanced rows, labels at the ends
 * (docs/FinalDesign/IMPL_PLAN_NPS_LAYOUT.md, wrapping reworked in
 * docs/FinalDesign/IMPL_PLAN_STAGE3_NARROW_FORMS.md).
 *
 * The owner's reference: the buttons centered in the column, wrapping into
 * balanced rows (6 + 5, never 10 + a lone "10"), "Not at all likely" above the 0
 * and "Extremely likely" below the 10.
 *
 * Mechanism: the group is a three-row grid (left label, buttons, right label);
 * the end-label container is `display: contents` so its two spans become grid
 * items; a button row that has to wrap is capped to the measured width of N
 * buttons (finalScaleLayout writes --scale-row-max), so the browser wraps after
 * exactly N. The wrapping itself is tested in finalScaleLayout; these tests pin
 * the structure and that only the 0-10 question is touched (rating, opinion
 * scale and emoji share its markup).
 */
import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

const fs = require('fs');
const path = require('path');

const read = (...parts) =>
    fs
        .readFileSync(path.join(__dirname, ...parts), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

const css = read('..', 'finalElementRenderer.css');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
    body: m[2]
}));
const bodiesFor = (selector) =>
    rules
        .filter((r) => r.selectors.includes(selector))
        .map((r) => r.body)
        .join('\n');

const GROUP = '.scale-group.nps-group';

describe('only the 0-10 question gets the new layout', () => {
    const mount = (element) => {
        const el = createElement('c-final-element-renderer', {
            is: FinalElementRenderer
        });
        el.element = element;
        document.body.appendChild(el);
        return el;
    };
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('the 0-10 group carries nps-group', () => {
        const el = mount({ id: 'e1', type: 'nps', label: 'Recommend us?' });
        expect(
            el.shadowRoot.querySelector('.scale-group.nps-group')
        ).not.toBeNull();
    });

    it.each(['rating', 'scale', 'emojiScale'])(
        '%s keeps the plain scale-group',
        (type) => {
            const el = mount({ id: 'e1', type, label: 'Question' });
            expect(el.shadowRoot.querySelector('.scale-group')).not.toBeNull();
            expect(el.shadowRoot.querySelector('.nps-group')).toBeNull();
        }
    );
});

describe('the 0-10 block is centered, with its labels at the ends', () => {
    it('is a three-row grid (left label, buttons, right label), centered in the column', () => {
        const body = bodiesFor(GROUP);
        expect(body).toMatch(/display\s*:\s*grid\s*;/);
        expect(body).toMatch(
            /grid-template-areas\s*:\s*['"]left['"]\s*['"]row['"]\s*['"]right['"]/
        );
        expect(body).toMatch(/align-self\s*:\s*center\s*;/);
    });

    it('the end-label container disappears so its two spans become grid items', () => {
        expect(bodiesFor(`${GROUP} .scale-endlabels`)).toMatch(
            /display\s*:\s*contents\s*;/
        );
    });

    it('the left label sits above the buttons at the left edge, the right label below them at the right edge', () => {
        const left = bodiesFor(`${GROUP} .scale-endlabels > :first-child`);
        const right = bodiesFor(`${GROUP} .scale-endlabels > :last-child`);
        expect(left).toMatch(/grid-area\s*:\s*left\s*;/);
        expect(left).toMatch(/justify-self\s*:\s*start\s*;/);
        expect(right).toMatch(/grid-area\s*:\s*right\s*;/);
        expect(right).toMatch(/justify-self\s*:\s*end\s*;/);
    });

    it('an empty label takes no room', () => {
        expect(bodiesFor(`${GROUP} .scale-endlabels > :empty`)).toMatch(
            /display\s*:\s*none\s*;/
        );
    });

    it('the button row is centered', () => {
        const body = bodiesFor(`${GROUP} .scale-row`);
        expect(body).toMatch(/grid-area\s*:\s*row\s*;/);
        expect(body).toMatch(/justify-content\s*:\s*center\s*;/);
        expect(body).toMatch(/justify-self\s*:\s*center\s*;/);
    });
});

describe('the row wraps by what is measured, never by a ladder of widths', () => {
    it('the cap on a wrapping row is the measured --scale-row-max, with no fallback (unset leaves max-width at none)', () => {
        const body = bodiesFor('.scale-group .scale-row').replace(/\s+/g, ' ');
        expect(body).toContain('max-width: var(--scale-row-max);');
    });

    it('no width ladder is left: a ladder written for one button size broke every other size (6 + 5 where all eleven fit)', () => {
        expect(css).not.toMatch(/--nps-n|--scale-per-row|scale-n-\d/);
        expect(css).not.toMatch(
            /@container\s+(section|convo)\s*\(\s*max-width:\s*\d+\.98px/
        );
    });

    it('the conversational section needs no second container name any more', () => {
        const section = read(
            '..',
            '..',
            'finalSectionRenderer',
            'finalSectionRenderer.css'
        );
        expect(section).not.toMatch(/container-name\s*:\s*section\s+convo/);
        expect(css).not.toContain('@container convo');
    });
});
