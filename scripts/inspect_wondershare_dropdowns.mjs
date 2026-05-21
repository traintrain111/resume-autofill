#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/inspect_wondershare_dropdowns.mjs <url>');
  process.exit(1);
}

const outDir = path.join(process.cwd(), 'run_output');
const context = await chromium.launchPersistentContext(path.join(outDir, 'wondershare-browser-profile'), {
  headless: false,
  viewport: { width: 1440, height: 1400 }
});
const page = context.pages()[0] ?? await context.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(3000);

const labels = {
  9: '家庭常驻地址',
  10: '民族',
  11: '籍贯',
  12: '毕业届次'
};
const result = {};

for (const idx of [9, 10, 11, 12]) {
  await page.keyboard.press('Escape').catch(() => {});
  const locator = page.locator('input:visible, textarea:visible').nth(idx);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    result[idx] = { label: labels[idx], error: 'no box' };
    continue;
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);

  const rows = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    return Array.from(document.querySelectorAll('[role="option"], li, .phoenix-select-option, .phoenix-select-item, .phoenix-cascader-menu-item, .phoenix-dropdown-menu-item, label, span, div'))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(),
          className: String(el.className || ''),
          role: el.getAttribute('role') || '',
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      })
      .filter((row) => row.text && row.text.length <= 80 && row.y >= 0 && row.y <= 1400);
  });

  const unique = [...new Map(rows.map((row) => [`${row.text}@${row.x}@${row.y}`, row])).values()];
  result[idx] = { label: labels[idx], rows: unique.slice(-160) };
  await page.screenshot({ path: path.join(outDir, `dropdown_${idx}.png`), fullPage: false });
}

fs.writeFileSync(path.join(outDir, 'dropdown_inspect.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2).slice(0, 30000));
await context.close();
