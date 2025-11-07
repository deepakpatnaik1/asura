import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/tmp/asura-home.png', fullPage: true });
await browser.close();
console.log('Screenshot saved to /tmp/asura-home.png');
