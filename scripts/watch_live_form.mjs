#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/watch_live_form.mjs <url>');
  process.exit(1);
}

const outDir = path.join(process.cwd(), 'run_output');
fs.mkdirSync(outDir, { recursive: true });

const profileName = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
const userDataDir = path.join(outDir, `${profileName}-browser-profile`);
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1440, height: 1400 }
});
const page = context.pages()[0] ?? await context.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

const rl = readline.createInterface({ input, output });

async function snapshot() {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
    const short = (value, max = 500) => (value || '').replace(/\s+/g, ' ').trim().slice(0, max);

    const controls = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="radio"], [role="checkbox"]'))
      .filter(visible)
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const ancestors = [];
        let cur = el;
        for (let i = 0; i < 5 && cur; i += 1, cur = cur.parentElement) {
          ancestors.push(short(text(cur), 700));
        }
        return {
          index,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          type: el.getAttribute('type') || '',
          name: el.getAttribute('name') || '',
          id: el.id || '',
          placeholder: el.getAttribute('placeholder') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          title: el.getAttribute('title') || '',
          value: el.value || el.getAttribute('value') || '',
          text: short(text(el), 300),
          ancestors,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      });

    const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'))
      .filter(visible)
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        return {
          index,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || '',
          text: short(text(el), 160),
          href: el.getAttribute('href') || '',
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        };
      });

    return {
      url: location.href,
      title: document.title,
      bodyText: short(text(document.body), 8000),
      controls,
      buttons
    };
  });

  fs.writeFileSync(path.join(outDir, `${profileName}_live_form_snapshot.json`), JSON.stringify(data, null, 2));
  await page.screenshot({ path: path.join(outDir, `${profileName}_live_form_screenshot.png`), fullPage: true });

  console.log(`URL: ${data.url}`);
  console.log(`TITLE: ${data.title}`);
  console.log(`CONTROLS: ${data.controls.length}`);
  console.log(`BUTTONS: ${data.buttons.length}`);
  console.log(`Snapshot: ${path.join(outDir, `${profileName}_live_form_snapshot.json`)}`);
  console.log(`Screenshot: ${path.join(outDir, `${profileName}_live_form_screenshot.png`)}`);
}

console.log('浏览器会保持打开。按 Enter 抓取当前页面；输入 q 后回车才关闭。');
while (true) {
  const answer = await rl.question('> ');
  if (answer.trim().toLowerCase() === 'q') break;
  await snapshot();
}

rl.close();
await context.close();
