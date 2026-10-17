import { createElement } from 'lwc';
import FinalSectionRenderer from 'c/finalSectionRenderer';

const fs = require('fs');
const path = require('path');

/**
 * The section name shown twice (docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md).
 * The viewer marks a lone section whose title would repeat the page name that the
 * layout already shows (`titleRepeatsPage`); this component then keeps the heading
 * OUT OF SIGHT but IN the page, so a screen reader still finds the heading.
 */
const SECTION = (extra = {}) => ({
    id: 's1',
    title: 'Contact details',
    style: 'card',
    elements: [],
    ...extra
});

function mount(section) {
    const el = createElement('c-final-section-renderer', {
        is: FinalSectionRenderer
    });
    el.section = section;
    document.body.appendChild(el);
    return el;
}

const head = (el) => el.shadowRoot.querySelector('.sec-head');

describe('c-final-section-renderer, a title that repeats the page name', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a normal section shows its heading as before', () => {
        const el = mount(SECTION());
        expect(head(el)).not.toBeNull();
        expect(head(el).classList.contains('sec-head-repeat')).toBe(false);
        expect(el.shadowRoot.querySelector('.sec-title').textContent).toBe(
            'Contact details'
        );
    });

    it('a marked section keeps the heading in the page (for screen readers) and flags it for the stylesheet to hide', () => {
        const el = mount(SECTION({ titleRepeatsPage: true }));
        expect(head(el).classList.contains('sec-head-repeat')).toBe(true);
        const title = el.shadowRoot.querySelector('h3.sec-title');
        expect(title).not.toBeNull();
        expect(title.textContent).toBe('Contact details');
    });

    it('the stylesheet takes it out of sight without taking it out of the page', () => {
        const css = fs
            .readFileSync(
                path.join(__dirname, '..', 'finalSectionRenderer.css'),
                'utf8'
            )
            .replace(/\r\n/g, '\n')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        const rule = css.match(/\.sec-head\.sec-head-repeat\s*\{([^}]*)\}/);
        expect(rule).not.toBeNull();
        const body = rule[1].replace(/\s+/g, ' ');
        expect(body).toMatch(/position:\s*absolute/);
        expect(body).toMatch(/clip-path:\s*inset\(50%\)/);
        expect(body).toMatch(/overflow:\s*hidden/);
        // display:none would drop it from the accessibility tree
        expect(body).not.toMatch(/display:\s*none/);
    });
});
