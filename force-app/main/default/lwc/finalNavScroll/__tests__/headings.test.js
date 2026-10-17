import { createElement } from 'lwc';
import FinalNavScroll from 'c/finalNavScroll';

const fs = require('fs');
const path = require('path');

/**
 * The Scroll layout's headings (owner 2026-10-11, DEFERRED 38; plan:
 * docs/FinalDesign/IMPL_PLAN_SECTION_HEADINGS.md section 5).
 *
 * What a person saw: each page's name as a divider heading, GREY with a fading
 * line, and under it each section's title, BLACK at the same size with no line:
 * the page, which is the bigger thing, looked lighter than the section inside it,
 * and the form had two kinds of line.
 *
 * Now: the page name is the heading (the text colour, 1.2x the section size,
 * bold, one flat thin line), and under a divider a section title is a subheading
 * (0.8x). The smaller size is only given to the sections that sit under a divider;
 * a Scroll form with one page has no divider, so its section titles are the
 * top-level headings and keep their full size.
 */
const css = fs
    .readFileSync(path.join(__dirname, '..', 'finalNavScroll.css'), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const flat = (text) => text.replace(/\s+/g, ' ').trim();
const bodyOf = (selector) => {
    const m = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((x) =>
        x[1]
            .split(',')
            .map((s) => flat(s))
            .includes(selector)
    );
    return m ? flat(m[2]) : '';
};

describe('the page divider heading', () => {
    it('is the text colour, not the weak grey, and bold', () => {
        const d = bodyOf('.divider');
        expect(d).toMatch(/color:\s*var\(--c-text\)/);
        expect(d).not.toMatch(/--c-text-weak/);
        expect(d).toMatch(/font-weight:\s*700/);
    });

    it('is bigger than a section title: 1.2 x the section size role', () => {
        expect(bodyOf('.divider')).toMatch(
            /font-size:\s*calc\(var\(--c-fs-section\)\s*\*\s*1\.2\)/
        );
    });

    it('has ONE kind of line: flat and thin, no fading gradient', () => {
        const d = bodyOf('.divider');
        expect(d).toMatch(
            /border-bottom:\s*1px solid color-mix\(in srgb,\s*var\(--c-text\) 18%,\s*transparent\)/
        );
        expect(d).not.toMatch(/border-image|linear-gradient/);
    });
});

describe('a section title under a divider is a subheading', () => {
    it('the zones under a divider redefine the section size to 0.8 x, from a copy taken above them (a property cannot read itself)', () => {
        expect(bodyOf('.page-block')).toMatch(
            /--nav-fs-section:\s*var\(--c-fs-section\)/
        );
        expect(bodyOf('.zones-under-divider')).toMatch(
            /--c-fs-section:\s*calc\(var\(--nav-fs-section\)\s*\*\s*0\.8\)/
        );
    });
});

const PAGES = (n) =>
    Array.from({ length: n }, (_, i) => ({
        id: `pg_${i}`,
        name: `Page name ${i}`,
        sections: [
            { id: `s_${i}`, title: `Section ${i}`, elements: [], columns: 1 }
        ]
    }));

function mount(pages, options) {
    const el = createElement('c-final-nav-scroll', { is: FinalNavScroll });
    el.pages = pages;
    el.options = options;
    document.body.appendChild(el);
    return el;
}

describe('c-final-nav-scroll', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('with dividers on, each page has its divider and its sections get the subheading size', () => {
        const el = mount(PAGES(2), { showDividers: true });
        expect(el.shadowRoot.querySelectorAll('h2.divider')).toHaveLength(2);
        const zones = [
            ...el.shadowRoot.querySelectorAll('c-final-layout-zones')
        ];
        expect(zones).toHaveLength(2);
        expect(
            zones.every((z) => z.classList.contains('zones-under-divider'))
        ).toBe(true);
    });

    it('a one-page form, or dividers off, has no divider and keeps the full section size', () => {
        for (const el of [
            mount(PAGES(1), { showDividers: true }),
            mount(PAGES(2), { showDividers: false }),
            mount(PAGES(2), undefined)
        ]) {
            expect(el.shadowRoot.querySelector('h2.divider')).toBeNull();
            expect(
                el.shadowRoot.querySelector('.zones-under-divider')
            ).toBeNull();
        }
    });
});
