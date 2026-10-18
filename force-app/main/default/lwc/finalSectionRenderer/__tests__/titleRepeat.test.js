import { createElement } from 'lwc';
import FinalSectionRenderer from 'c/finalSectionRenderer';

const fs = require('fs');
const path = require('path');

/**
 * The section name shown twice (docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md).
 * The viewer marks a lone section whose title would repeat the page name that the
 * layout already shows (`titleRepeatsPage`: 'always', or 'wide' for the side rail
 * and the wizard strip, whose labels give way to chips and dots on a phone); this
 * component then keeps the heading OUT OF SIGHT but IN the page, so a screen
 * reader still finds the heading.
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
const read = (...parts) =>
    fs
        .readFileSync(path.join(__dirname, ...parts), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
const flat = (text) => text.replace(/\s+/g, ' ').trim();

describe('c-final-section-renderer, a title that repeats the page name', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('a normal section shows its heading as before', () => {
        const el = mount(SECTION());
        expect(head(el)).not.toBeNull();
        expect(head(el).className).toBe('sec-head');
        expect(el.shadowRoot.querySelector('.sec-title').textContent).toBe(
            'Contact details'
        );
    });

    it('marked "always": the heading stays in the page (for screen readers) and is flagged to hide at every width', () => {
        const el = mount(SECTION({ titleRepeatsPage: 'always' }));
        expect(head(el).classList.contains('sec-head-repeat-always')).toBe(
            true
        );
        expect(head(el).classList.contains('sec-head-repeat-wide')).toBe(false);
        const title = el.shadowRoot.querySelector('h3.sec-title');
        expect(title).not.toBeNull();
        expect(title.textContent).toBe('Contact details');
    });

    it('marked "wide": flagged to hide only while the navigation has room', () => {
        const el = mount(SECTION({ titleRepeatsPage: 'wide' }));
        expect(head(el).classList.contains('sec-head-repeat-wide')).toBe(true);
        expect(head(el).classList.contains('sec-head-repeat-always')).toBe(
            false
        );
        expect(el.shadowRoot.querySelector('h3.sec-title')).not.toBeNull();
    });

    const CLIP =
        /position:\s*absolute;[^}]*clip-path:\s*inset\(50%\)[^}]*overflow:\s*hidden|overflow:\s*hidden[^}]*clip-path:\s*inset\(50%\)/;

    it('the stylesheet takes "always" out of sight without taking it out of the page (not display:none)', () => {
        const css = read('..', 'finalSectionRenderer.css');
        const rule = css.match(
            /\.sec-head\.sec-head-repeat-always\s*\{([^}]*)\}/
        );
        expect(rule).not.toBeNull();
        const body = flat(rule[1]);
        expect(body).toMatch(CLIP);
        expect(body).not.toMatch(/display:\s*none/);
    });

    it('"wide" hides the same way, but only inside the navigation container while it is wider than 540px, so a phone keeps the title', () => {
        const css = read('..', 'finalSectionRenderer.css');
        const query = css.match(
            /@container\s+pagenav\s*\(width\s*>\s*540px\)\s*\{\s*\.sec-head\.sec-head-repeat-wide\s*\{([^}]*)\}\s*\}/
        );
        expect(query).not.toBeNull();
        expect(flat(query[1])).toMatch(CLIP);
        // and nowhere outside that query
        const outside = css.replace(
            /@container\s+pagenav[^{]*\{\s*\.sec-head\.sec-head-repeat-wide\s*\{[^}]*\}\s*\}/,
            ''
        );
        expect(outside).not.toMatch(/sec-head-repeat-wide/);
    });
});

describe('the navigations that lose their labels on a phone name the container the rule listens to', () => {
    // 540px is the threshold the rail's chips and the wizard strip's dots already use
    it.each([
        ['finalNavRail', 'railnav'],
        ['finalNavStepper', 'stepper']
    ])(
        '%s declares the shared container name pagenav next to its own',
        (bundle, own) => {
            const css = read('..', '..', bundle, `${bundle}.css`);
            expect(css).toMatch(
                new RegExp(`container-name:\\s*${own}\\s+pagenav\\s*;`)
            );
            // the label drop-out the rule mirrors really is at 540px
            expect(css).toMatch(
                new RegExp(`@container\\s+${own}\\s*\\(max-width:\\s*540px\\)`)
            );
        }
    );
});
