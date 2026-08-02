/**
 * Org hydration QA (PR #196): a typed native-input answer must survive
 * Next → Back — paginated layouts unmount non-current pages, and the
 * remounted control rehydrates from the viewer's answers store.
 *
 * Usage (frontdoor URLs are ONE-SHOT — mint fresh per run):
 *   FD=$(sf org open --url-only -p "/apex/FinalStudio?c__formId=<id>" | grep -o 'https://[^ ]*' | tail -1)
 *   node scripts/qa/answer-hydration.js "$FD"
 */
const { chromium } = require('playwright');

const URL = process.argv[2];
const NAV = 'c-final-preview-stage';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 }
    });
    page.setDefaultTimeout(45000);
    await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
    await page.waitForSelector(`${NAV} .counter`, { timeout: 90000 });
    const counter = () => page.locator(`${NAV} .counter`).first().innerText();

    const input = page.locator(`${NAV} input`).first();
    await input.click();
    await input.type('hello world');
    console.log('typed value:', await input.inputValue());

    await page.locator(`${NAV} .primary-btn`).first().click();
    await page.waitForTimeout(500);
    console.log('advanced to:', (await counter()).trim());

    await page.locator(`${NAV} .back-link`).first().click();
    await page.waitForTimeout(500);
    console.log('back on:', (await counter()).trim());
    const after = await page.locator(`${NAV} input`).first().inputValue();
    console.log('input value after Back:', JSON.stringify(after));
    const ok = after === 'hello world';
    console.log(ok ? 'VALUE SURVIVES' : 'VALUE BLANKED — regression');
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
