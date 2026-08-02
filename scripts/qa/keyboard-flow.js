/**
 * Org keyboard-flow QA for the OneAtATime runtime (PRs #188–#194):
 * Enter-on-Back goes back, Enter-on-chip selects without advancing,
 * scale radiogroup composes end labels, Enter-in-input still advances.
 *
 * Usage (frontdoor URLs are ONE-SHOT — mint fresh per run):
 *   FD=$(sf org open --url-only -p "/apex/FinalStudio?c__formId=<id>" | grep -o 'https://[^ ]*' | tail -1)
 *   node scripts/qa/keyboard-flow.js "$FD"
 *
 * Standing QA form: "QA Enter Key" (oneAtATime + advanceTrigger=keyboard,
 * text · scale w/ end labels · text — 3 screens via onePerScreen).
 */
const { chromium } = require('playwright');

const URL = process.argv[2];
const SHOT_DIR = __dirname;
const NAV = 'c-final-preview-stage';

let failures = 0;
function check(name, ok, detail) {
    console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`
    );
    if (!ok) failures++;
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 }
    });
    page.setDefaultTimeout(45000);
    try {
        await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
        await page.waitForSelector('.st-modes', { timeout: 90000 });

        // Design mode hosts the interactive preview; only click over if the
        // counter isn't already up.
        const counterSel = `${NAV} .counter`;
        if (!(await page.locator(counterSel).count())) {
            await page
                .locator('.st-modes button', { hasText: 'Design' })
                .first()
                .click();
        }
        await page.waitForSelector(counterSel);
        const counter = () => page.locator(counterSel).first().innerText();

        check('preview renders OneAtATime', true);

        const helper = await page
            .locator(`${NAV} .key-helper`)
            .first()
            .innerText()
            .catch(() => '');
        check(
            'keyboard advance enabled (helper row)',
            helper.includes('Return'),
            `helper="${helper}"`
        );
        check('starts on screen 1', (await counter()).trim() === '1 / 3');

        await page.locator(`${NAV} .primary-btn`).first().click();
        await page.waitForTimeout(400);
        check(
            'Continue reaches screen 2',
            (await counter()).trim() === '2 / 3'
        );

        // Enter on the Back button must go BACK (pre-#188: advanced)
        await page.locator(`${NAV} .back-link`).first().focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
        check('Enter on Back goes BACK', (await counter()).trim() === '1 / 3');

        await page.locator(`${NAV} .primary-btn`).first().click();
        await page.waitForTimeout(400);

        // Enter on a scale chip selects it and does NOT advance
        await page
            .locator(`${NAV} button[role="radio"][data-value="4"]`)
            .first()
            .focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
        const checked = await page
            .locator(`${NAV} button[role="radio"][data-value="4"]`)
            .first()
            .getAttribute('aria-checked');
        check('Enter on chip selects it', checked === 'true');
        check(
            'Enter on chip does not advance',
            (await counter()).trim() === '2 / 3'
        );

        const groupLabel = await page
            .locator(`${NAV} .scale-row`)
            .first()
            .getAttribute('aria-label');
        check(
            'scale group aria-label composes end labels',
            groupLabel === 'Rate it, 1 = Bad to 5 = Great',
            `aria-label="${groupLabel}"`
        );

        // Enter in a single-line input still advances (the feature itself)
        await page.locator(`${NAV} .back-link`).first().click();
        await page.waitForTimeout(400);
        const input = page.locator(`${NAV} input`).first();
        await input.click();
        await input.type('hello');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
        check(
            'Enter in text input still advances',
            (await counter()).trim() === '2 / 3'
        );

        await page.screenshot({ path: `${SHOT_DIR}/keyboard-flow-final.png` });
    } catch (e) {
        failures++;
        console.log('FAIL  script error —', e.message);
        await page
            .screenshot({ path: `${SHOT_DIR}/keyboard-flow-error.png` })
            .catch(() => {});
    } finally {
        await browser.close();
    }
    console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
    process.exit(failures ? 1 : 0);
})();
