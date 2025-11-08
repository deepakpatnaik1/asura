import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

// Navigate with cache disabled
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

console.log('Page reloaded');

// Keep browser open
await new Promise(() => {});
