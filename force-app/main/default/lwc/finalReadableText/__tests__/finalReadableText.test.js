import {
    adjust,
    adjustSteps,
    inkFor,
    ratio,
    readable,
    textScope,
    readsOn,
    TEXT,
    TEXT_AIM
} from 'c/finalReadableText';
import { exact } from 'c/finalFocusTreatment';

describe('c-final-readable-text', () => {
    it('counts WHOLE steps: a move of exactly 25 steps (50%) reports 25', () => {
        // adding 0.02 twenty-five times overshoots 0.5 (0.5000000000000002),
        // so a cap compared on the decimal would wrongly reject this move
        let t = 0;
        for (let i = 0; i < 25; i += 1) {
            t += 0.02;
        }
        expect(t).toBeGreaterThan(0.5);
        let calls = 0;
        const r = adjustSteps('#000000', '#ffffff', () => {
            calls += 1;
            return calls === 26; // passes on the 26th colour tried = 25 steps
        });
        expect(r.steps).toBe(25);
        expect(r.steps <= 25).toBe(true);
        expect(r.ok).toBe(true);
    });

    it('reports 0 steps when the colour already passes, 50 and ok=false when nothing does', () => {
        expect(adjustSteps('#123456', '#000000', () => true)).toEqual({
            color: '#123456',
            steps: 0,
            ok: true
        });
        const never = adjustSteps('#123456', '#000000', () => false);
        expect(never.steps).toBe(50);
        expect(never.ok).toBe(false);
        expect(never.color).toBe('#000000');
    });

    it('adjust keeps the brand generator contract (colour only)', () => {
        expect(
            adjust('#6b7280', '#000000', (c) => ratio(c, '#ffffff') >= 7)
        ).toBe(
            adjustSteps('#6b7280', '#000000', (c) => ratio(c, '#ffffff') >= 7)
                .color
        );
    });

    it('inkFor falls back to pure black on a mid grey (#777777)', () => {
        expect(ratio('#111827', '#777777')).toBeLessThan(TEXT); // 3.96
        expect(ratio('#ffffff', '#777777')).toBeLessThan(TEXT); // 4.48
        expect(inkFor('#777777')).toBe('#000000');
        expect(ratio('#000000', '#777777')).toBeGreaterThanOrEqual(
            4.69 - 0.005
        );
    });

    it('pure black or white reaches at least 4.58 on any colour', () => {
        for (let v = 0; v < 256; v += 1) {
            const h = v.toString(16).padStart(2, '0');
            const grey = `#${h}${h}${h}`;
            expect(ratio(inkFor(grey), grey)).toBeGreaterThanOrEqual(TEXT);
        }
    });

    it('a scope holds the container, section tints, fields on each, and accent tints for text', () => {
        const s = textScope({
            container: exact('#ffffff'),
            text: '#111827',
            accent: '#2563eb',
            sectionFill: null,
            fieldFills: ['#ffffff', 'transparent', '#ffffff']
        });
        // container + 3 tints; one distinct opaque fill over each of the 4;
        // 2 accent tints for text only
        expect(s.words).toHaveLength(8);
        expect(s.marks).toEqual(s.words);
        expect(s.text).toHaveLength(10);
    });

    it('readable moves a colour until it reads on every range, and says when it cannot', () => {
        const ranges = [exact('#ffffff'), exact('#f3f4f6')];
        const r = readable('#9ca3af', '#111827', ranges, TEXT_AIM);
        expect(r.ok).toBe(true);
        expect(readsOn(r.color, ranges, TEXT_AIM)).toBe(true);
        // black-to-white underneath: nothing can pass
        const none = readable(
            '#9ca3af',
            '#111827',
            [['#000000', '#ffffff']],
            TEXT_AIM
        );
        expect(none.ok).toBe(false);
    });
});
