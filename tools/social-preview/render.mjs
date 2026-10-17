import { chromium } from 'playwright';
const [html, out] = process.argv.slice(2);
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(`file://${html}`); await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();
