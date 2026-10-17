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
 * Now: the page name is the heading (the text colour, bold, one flat thin line,
 * 1.2x a section title but never bigger than the form title), and under a divider
 * a section title is a subheading (0.9x on a wide form, full size on a narrow
 * one, so never below 18px and never the size of a question). The smaller size is
 * only given to the sections that sit under a divider; a Scroll form with one
 * page has no divider, so its section titles are the top-level headings and keep
 * their full size. A page still called "Page 3" gets a quiet divider (the line,
 * not the words) and its section titles keep their full size.
 *
 * UX review 2026-10-16: the first version made a subheading exactly a question's
 * size (0.8x of 20px = 16px) and, on a phone, smaller than the questions beneath
 * it; it made the page heading (21.6px) bigger than the form title (20px) on a
 * phone; and a placeholder name became the loudest heading on the page.
 */
const read = (...parts) =>
    fs
        .readFileSync(path.join(__dirname, ...parts), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('..', 'finalNavScroll.css');
const frame = read('..', '..', 'finalPageFrame', 'finalPageFrame.css');
const flat = (text) => text.replace(/\s+/g, ' ').trim();

// the narrow-form rule, taken out so the plain rules below are the wide ones
const NARROW =
    /@container\s+final-form-viewport\s*\(max-width:\s*540px\)\s*\{([\s\S]*?\})\s*\}/;
const narrowCss = (css.match(NARROW) || [])[1] || '';
const wideCss = css.replace(NARROW, '');

const bodyOf = (source, selector) => {
    const m = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((x) =>
        x[1]
            .split(',')
            .map((s) => flat(s))
            .includes(selector)
    );
    return m ? flat(m[2]) : '';
};

const CLIP =
    /position:\s*absolute;[^}]*clip-path:\s*inset\(50%\)[^}]*overflow:\s*hidden|overflow:\s*hidden[^}]*clip-path:\s*inset\(50%\)/;

describe('the page divider heading', () => {
    it('is the text colour, not the weak grey, and bold', () => {
        const d = bodyOf(wideCss, '.divider');
        expect(d).toMatch(/color:\s*var\(--c-text\)/);
        expect(d).not.toMatch(/--c-text-weak/);
        expect(d).toMatch(/font-weight:\s*700/);
    });

    it('is bigger than a section title (1.2x) but never bigger than the form title', () => {
        expect(bodyOf(wideCss, '.divider')).toMatch(
            /font-size:\s*min\(calc\(var\(--c-fs-section\)\s*\*\s*1\.2\),\s*var\(--c-fs-title\)\)/
        );
    });

    it('has ONE kind of line: flat and thin, no fading gradient', () => {
        const d = bodyOf(wideCss, '.divider');
        expect(d).toMatch(
            /border-bottom:\s*1px solid color-mix\(in srgb,\s*var\(--c-text\) 18%,\s*transparent\)/
        );
        expect(d).not.toMatch(/border-image|linear-gradient/);
    });
});

describe('a section title under a divider is a subheading', () => {
    it('the zones under a divider redefine the section size from a copy taken above them (a property cannot read itself)', () => {
        expect(bodyOf(wideCss, '.page-block')).toMatch(
            /--nav-fs-section:\s*var\(--c-fs-section\)/
        );
        expect(bodyOf(wideCss, '.zones-under-divider')).toMatch(
            /--c-fs-section:\s*calc\(var\(--nav-fs-section\)\s*\*\s*0\.9\)/
        );
    });

    it('on a narrow form (540px or narrower) it keeps the full section size: no further step down', () => {
        expect(narrowCss).not.toBe('');
        expect(bodyOf(narrowCss, '.zones-under-divider')).toMatch(
            /--c-fs-section:\s*var\(--nav-fs-section\)\s*;?$/
        );
    });
});

describe('the size ladder that results (read from the real stylesheets)', () => {
    const rem = (value) => parseFloat(value) * 16;
    // the page frame declares the roles twice: wide, then the narrow-form column
    const declared = [...frame.matchAll(/(?<![\w-])\.page\s*\{([^{}]*)\}/g)]
        .map((m) => m[1])
        .filter((body) => /--c-fs-title\s*:/.test(body));
    const roles = (body) => ({
        title: rem(body.match(/--c-fs-title\s*:\s*([\d.]+)rem/)[1]),
        section: rem(body.match(/--c-fs-section\s*:\s*([\d.]+)rem/)[1])
    });
    const LABEL = 16; // --c-fs-label, 1rem in the standard size set
    const pageMultiplier = parseFloat(
        bodyOf(wideCss, '.divider').match(
            /min\(calc\(var\(--c-fs-section\)\s*\*\s*([\d.]+)\)/
        )[1]
    );
    const subWide = parseFloat(
        bodyOf(wideCss, '.zones-under-divider').match(/\*\s*([\d.]+)\)/)[1]
    );

    it('finds the wide and the narrow roles', () => {
        expect(declared.length).toBeGreaterThanOrEqual(2);
        expect(roles(declared[0])).toEqual({ title: 28, section: 20 });
        expect(roles(declared[declared.length - 1])).toEqual({
            title: 20,
            section: 18
        });
    });

    it.each([
        ['wide', 0, subWide],
        ['narrow', 1, 1]
    ])(
        '%s form: form title >= page heading > section subheading, and a subheading is at least 18px and above a question label',
        (_name, which, subMultiplier) => {
            const r = roles(
                which === 0 ? declared[0] : declared[declared.length - 1]
            );
            const page = Math.min(r.section * pageMultiplier, r.title);
            const sub = r.section * subMultiplier;
            expect(page).toBeLessThanOrEqual(r.title);
            expect(page).toBeGreaterThan(sub);
            expect(sub).toBeGreaterThanOrEqual(18);
            expect(sub).toBeGreaterThan(LABEL);
        }
    );

    it('the numbers the reviewer asked for: wide 28 / 24 / 18 / 16, phone 20 / 20 / 18 / 16', () => {
        const wide = roles(declared[0]);
        const narrow = roles(declared[declared.length - 1]);
        expect([
            wide.title,
            Math.min(wide.section * pageMultiplier, wide.title),
            wide.section * subWide,
            LABEL
        ]).toEqual([28, 24, 18, 16]);
        expect([
            narrow.title,
            Math.min(narrow.section * pageMultiplier, narrow.title),
            narrow.section,
            LABEL
        ]).toEqual([20, 20, 18, 16]);
    });
});

describe('a placeholder page name gets a quiet divider', () => {
    it('the words are taken out of sight without leaving the page, the line stays', () => {
        const name = bodyOf(wideCss, '.divider-quiet .divider-name');
        expect(name).toMatch(CLIP);
        expect(name).not.toMatch(/display:\s*none/);
        // the rule is still drawn by the divider itself (the ordinary line)
        expect(bodyOf(wideCss, '.divider-quiet')).not.toMatch(/border-bottom/);
    });

    it('the first page has nothing above it to separate from, so it draws no line', () => {
        const first = bodyOf(wideCss, '.divider-quiet.divider-first');
        expect(first).toMatch(/border-bottom:\s*0/);
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

const zonesOf = (el) => [
    ...el.shadowRoot.querySelectorAll('c-final-layout-zones')
];

describe('c-final-nav-scroll', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('with dividers on, each page has its divider and its sections get the subheading size', () => {
        const el = mount(PAGES(2), { showDividers: true });
        expect(el.shadowRoot.querySelectorAll('h2.divider')).toHaveLength(2);
        expect(el.shadowRoot.querySelector('.divider-quiet')).toBeNull();
        const zones = zonesOf(el);
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

    it.each(['Page 3', 'Step 2', 'Part 1', 'Section 4', '2', '', 'Untitled'])(
        'a page named "%s" gets the quiet divider and its sections keep their full size',
        (name) => {
            const pages = PAGES(3);
            pages[2].name = name;
            const el = mount(pages, { showDividers: true });
            const dividers = [...el.shadowRoot.querySelectorAll('h2.divider')];
            expect(dividers).toHaveLength(3);
            expect(
                dividers.map((d) => d.classList.contains('divider-quiet'))
            ).toEqual([false, false, true]);
            // the words are still in the page, for screen readers
            expect(dividers[2].querySelector('.divider-name').textContent).toBe(
                name
            );
            expect(
                zonesOf(el).map((z) =>
                    z.classList.contains('zones-under-divider')
                )
            ).toEqual([true, true, false]);
        }
    );

    it('a quiet FIRST page is marked, so it draws no line above the form', () => {
        const pages = PAGES(2);
        pages[0].name = 'Page 1';
        const el = mount(pages, { showDividers: true });
        const [first, second] = [
            ...el.shadowRoot.querySelectorAll('h2.divider')
        ];
        expect(first.className).toBe('divider divider-quiet divider-first');
        expect(second.className).toBe('divider');
    });

    it('a quiet page that is not first keeps its separating line', () => {
        const pages = PAGES(3);
        pages[1].name = 'Page 2';
        const el = mount(pages, { showDividers: true });
        const quiet = el.shadowRoot.querySelector('.divider-quiet');
        expect(quiet.className).toBe('divider divider-quiet');
    });
});
