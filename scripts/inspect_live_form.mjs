#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/inspect_live_form.mjs <url>');
  process.exit(1);
}

const outDir = path.join(process.cwd(), 'run_output');
fs.mkdirSync(outDir, { recursive: true });

const userDataDir = path.join(outDir, 'wondershare-browser-profile');
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1440, height: 1400 }
});
const page = context.pages()[0] ?? await context.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

const rl = readline.createInterface({ input, output });
await rl.question('请在浏览器中完成登录/验证码/隐私协议。完成后回到这里按 Enter 继续检查表单...');

await page.waitForLoadState('domcontentloaded').catch(() => {});
await page.waitForTimeout(3000);

const snapshot = await page.evaluate(() => {
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  const text = (el) => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  const short = (value, max = 260) => (value || '').replace(/\s+/g, ' ').trim().slice(0, max);

  const controls = Array.from(document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="radio"], [role="checkbox"]'))
    .filter(visible)
    .map((el, index) => {
      const rect = el.getBoundingClientRect();
      const ancestors = [];
      let cur = el;
      for (let i = 0; i < 5 && cur; i += 1, cur = cur.parentElement) {
        ancestors.push(short(text(cur), 500));
      }
      const labelFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
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
        text: short(text(el), 240),
        labelFor: short(text(labelFor), 240),
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
        text: short(text(el), 120),
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
    bodyText: short(text(document.body), 6000),
    controls,
    buttons
  };
});

fs.writeFileSync(path.join(outDir, 'live_form_snapshot.json'), JSON.stringify(snapshot, null, 2));
await page.screenshot({ path: path.join(outDir, 'live_form_screenshot.png'), fullPage: true });

console.log(`URL: ${snapshot.url}`);
console.log(`TITLE: ${snapshot.title}`);
console.log(`CONTROLS: ${snapshot.controls.length}`);
console.log(`BUTTONS: ${snapshot.buttons.length}`);
console.log(`Snapshot: ${path.join(outDir, 'live_form_snapshot.json')}`);
console.log(`Screenshot: ${path.join(outDir, 'live_form_screenshot.png')}`);
console.log('检查完成。浏览器会保持打开，请不要点击最终提交。');

await rl.question('按 Enter 关闭浏览器，或先不要按以便人工查看...');
rl.close();
await context.close();
