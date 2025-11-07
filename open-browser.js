import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto('http://localhost:5173');

console.log('Browser opened at http://localhost:5173');
console.log('Press Ctrl+C to close the browser');

// Keep the script running
await new Promise(() => {});
