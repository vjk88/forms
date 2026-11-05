import { shouldAutoRedirect } from '../completionRules';

describe('shouldAutoRedirect (IMPL_PLAN_FORM_PDF §6.1)', () => {
    it('redirects when the author asked and nothing is offered', () => {
        expect(shouldAutoRedirect({ autoRedirect: true }, false)).toBe(true);
        expect(
            shouldAutoRedirect(
                { autoRedirect: true, downloadCopy: true },
                false
            )
        ).toBe(true);
    });

    it('never counts down away from a PDF copy on offer', () => {
        expect(
            shouldAutoRedirect({ autoRedirect: true, downloadCopy: true }, true)
        ).toBe(false);
    });

    it('stays when auto-redirect is off; toast always leaves', () => {
        expect(shouldAutoRedirect({}, true)).toBe(false);
        expect(shouldAutoRedirect(null, false)).toBe(false);
        expect(
            shouldAutoRedirect({ mode: 'toast', downloadCopy: true }, true)
        ).toBe(true);
    });
});
