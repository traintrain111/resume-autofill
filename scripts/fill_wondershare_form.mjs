#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'js-yaml';
import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/fill_wondershare_form.mjs <url>');
  process.exit(1);
}

const root = process.cwd();
const outDir = path.join(root, 'run_output');
const profile = yaml.load(fs.readFileSync(path.join(root, 'resume_profile.yaml'), 'utf8'));
const userDataDir = path.join(outDir, 'wondershare-browser-profile');
fs.mkdirSync(outDir, { recursive: true });

const firstEdu = profile.education?.[0] ?? {};
const educations = profile.education ?? [];
const internships = profile.internships ?? [];

const values = {
  name: profile.personal?.name_zh,
  email: profile.personal?.email,
  gender: profile.personal?.gender,
  birthDate: profile.personal?.birth_date,
  birthMonth: profile.personal?.birth_month,
  highestDegree: profile.personal?.highest_education || firstEdu.degree,
  graduationClass: firstEdu.graduation_class || (firstEdu.end ? `${String(firstEdu.end).slice(0, 4)}届` : ''),
  homeAddress: profile.personal?.home_address,
  ethnicity: profile.personal?.ethnicity,
  nativePlace: profile.personal?.native_place,
  expectedCity: profile.personal?.expected_cities?.[0],
  availability: profile.personal?.availability,
  award: profile.awards?.[0]?.name
};

// These indexes refer to visible controls only:
// page.locator('input:visible, textarea:visible').
// Dropdown/date widgets are skipped because Beisen can display typed text
// without committing a real option selection.
const fieldPlan = [
  { index: 3, label: '姓名', value: values.name, path: 'personal.name_zh' },
  { index: 5, label: '邮箱', value: values.email, path: 'personal.email' }
].filter((item) => item.value && String(item.value).trim());

const skipped = [
  { label: '推荐码', reason: 'resume_profile.yaml 未提供' },
  { label: '证件号码', reason: '敏感身份证字段，暂停人工填写' },
  { label: '证件照', reason: '文件/照片上传，需要用户确认' },
  { label: '意向城市选择原因', reason: 'resume_profile.yaml 未提供，开放题不猜测' },
  { label: '招聘信息获取渠道', reason: 'resume_profile.yaml 未提供' },
  { label: '期望月薪', reason: 'resume_profile.yaml 未提供，薪资不猜测' },
  { label: '预计报到时间', reason: `下拉/日期控件未自动选择；来源值 ${values.availability}` },
  { label: '学院名称', reason: 'resume_profile.yaml 未提供' },
  { label: '研究方向', reason: 'resume_profile.yaml 未提供' },
  { label: '项目经历', reason: 'resume_profile.yaml 中 projects 为空' },
  { label: '证书', reason: 'resume_profile.yaml 中 certificates 为空' },
  { label: '兴趣爱好/特长', reason: '开放字段未在 resume_profile.yaml 中明确提供' },
  { label: '简历附件/附件上传', reason: '文件上传需用户确认；未自动上传' }
];

async function fillVisibleControl(controls, item, filled, failed) {
  const locator = controls.nth(item.index);
  try {
    await locator.scrollIntoViewIfNeeded();
    await locator.fill(String(item.value), { timeout: 3000 });
    await locator.blur();
    filled.push(item);
  } catch (error) {
    failed.push({ ...item, error: error.message });
  }
}

function normalizeDateForPage(dateValue, fallbackKind = 'start') {
  if (!dateValue) return '';
  const value = String(dateValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }
  return value;
}

async function fillDateControl(page, item, filled, failed) {
  if (!item.value) return;
  const value = normalizeDateForPage(item.value, item.kind);
  const [year, monthRaw] = value.split('-');
  const monthText = `${Number(monthRaw)}月`;
  const locator = page.locator('input:visible, textarea:visible').nth(item.index);
  try {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await page.waitForTimeout(300);
    const box = await locator.boundingBox();
    if (!box) throw new Error('日期控件不可见');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    const yearSelect = page.locator('.phoenix-calendar-month-panel-year-select, .phoenix-calendar-year-select').first();
    await yearSelect.click({ force: true, timeout: 3000 });
    await page.waitForTimeout(300);
    await page
      .locator('.phoenix-calendar-year-panel-year')
      .filter({ hasText: new RegExp(`^${year}$`) })
      .first()
      .click({ force: true, timeout: 3000 });
    await page.waitForTimeout(300);
    await page
      .locator('.phoenix-calendar-month-panel-month')
      .filter({ hasText: new RegExp(`^${monthText}$`) })
      .first()
      .click({ force: true, timeout: 3000 });
    await page.waitForTimeout(500);
    const committed = await locator.inputValue().catch(() => '');
    if (!committed.includes(value)) {
      throw new Error(`日期未提交到页面，页面值: ${committed || '空'}`);
    }
    filled.push({ ...item, value });
  } catch (error) {
    failed.push({ ...item, value, error: error.message });
    await page.keyboard.press('Escape').catch(() => {});
  }
}

function displayValueForDropdown(label, value) {
  if ((label === '最高学历' || label.includes('学历')) && value === '硕士') return '硕士研究生';
  return value;
}

async function clickVisibleExactText(page, text) {
  const target = await page.evaluate((targetText) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const normalized = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const candidates = Array.from(document.querySelectorAll('*'))
      .filter((el) => isVisible(el) && normalized(el) === targetText);
    const clickable = candidates
      .filter((el) => {
        const className = String(el.className || '');
        const role = el.getAttribute('role') || '';
        return role === 'option' || /option|item|cascader|select|checkbox/.test(className) || el.tagName === 'LI';
      });
    const targetEl = clickable.at(-1) || candidates.at(-1);
    if (!targetEl) return null;
    targetEl.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = targetEl.getBoundingClientRect();
    const className = String(targetEl.className || '');
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      className
    };
  }, text);

  if (!target) return false;

  let x = target.x + target.width / 2;
  if (text !== '确定') {
    if (/area-text-label|item-text-label/.test(target.className)) {
      x = target.x - 12;
    } else if (/list-item-container|area-item-name/.test(target.className)) {
      x = target.x + 8;
    }
  }
  const y = target.y + target.height / 2;
  await page.mouse.click(x, y);
  return true;
}

async function fillDropdown(page, item, filled, failed) {
  if (!item.value || !String(item.value).trim()) return;

  const optionPath = item.optionPath ?? [displayValueForDropdown(item.label, String(item.value))];
  const locator = page.locator('input:visible, textarea:visible').nth(item.index);
  try {
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ force: true, timeout: 3000 });
    await page.waitForTimeout(500);

    for (const optionText of optionPath) {
      let clicked = await clickVisibleExactText(page, optionText);
      if (!clicked) {
        const searchInput = page.locator('input[placeholder="搜索"]:visible');
        if (await searchInput.count()) {
          await searchInput.last().fill(optionText);
          await page.waitForTimeout(500);
          clicked = await clickVisibleExactText(page, optionText);
        }
      }
      if (!clicked) {
        throw new Error(`未找到可选项: ${optionText}`);
      }
      await page.waitForTimeout(300);
    }

    if (item.confirm) {
      await clickVisibleExactText(page, '确定');
      await page.waitForTimeout(300);
    }

    await page.keyboard.press('Escape').catch(() => {});
    const committedText = await page.locator('input:visible, textarea:visible').nth(item.index).evaluate((el) => {
      let current = el;
      for (let depth = 0; depth < 4 && current; depth += 1, current = current.parentElement) {
        const text = (current.innerText || current.textContent || '').replace(/\s+/g, ' ').trim();
        if (text && !/^请选择$/.test(text)) return text;
      }
      return el.value || '';
    }).catch(() => '');
    const expectedText = optionPath.at(-1);
    if (!committedText.includes(expectedText)) {
      throw new Error(`选项未提交到页面，页面显示: ${committedText || '空'}`);
    }
    filled.push({
      label: item.label,
      value: item.value,
      selected: optionPath.join('/'),
      path: item.path
    });
  } catch (error) {
    await page.keyboard.press('Escape').catch(() => {});
    failed.push({ label: item.label, value: item.value, path: item.path, error: error.message });
  }
}

async function fillDropdowns(page, values, filled, failed) {
  const dropdownPlan = [
    { index: 8, label: '最高学历', value: values.highestDegree, path: 'personal.highest_education' },
    { index: 9, label: '家庭常驻地址', value: values.homeAddress, path: 'personal.home_address', optionPath: values.homeAddress ? [values.homeAddress] : [], confirm: true },
    { index: 10, label: '民族', value: values.ethnicity, path: 'personal.ethnicity', confirm: true },
    {
      index: 11,
      label: '籍贯',
      value: values.nativePlace,
      path: 'personal.native_place',
      optionPath: values.nativePlace ? [values.nativePlace.replace(/(省|市|自治区|特别行政区).*/, '$1')] : [],
      confirm: true
    },
    { index: 12, label: '毕业届次', value: values.graduationClass, path: 'education[0].graduation_class', confirm: true },
    { index: 13, label: '意向工作城市', value: values.expectedCity, path: 'personal.expected_cities[0]', confirm: true }
  ];

  for (const item of dropdownPlan) {
    await fillDropdown(page, item, filled, failed);
  }
}

async function ensureEducationRows(page, targetCount, filled, failed) {
  if (targetCount <= 1) return;

  for (let attempt = 1; attempt < targetCount; attempt += 1) {
    const before = await page.locator('input:visible, textarea:visible').count();
    const addButtons = page.getByText('添加教育经历', { exact: true });
    const addCount = await addButtons.count();
    if (addCount === 0) {
      failed.push({
        label: `添加教育经历 ${attempt + 1}`,
        value: '',
        path: 'education',
        error: '页面未找到“添加教育经历”按钮'
      });
      return;
    }

    try {
      await addButtons.nth(addCount - 1).scrollIntoViewIfNeeded();
      await addButtons.nth(addCount - 1).click({ timeout: 3000 });
      await page.waitForFunction((oldCount) => {
        const visible = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')).filter((el) => {
          return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        });
        return visible.length > oldCount;
      }, before, { timeout: 5000 });
      filled.push({
        label: `添加教育经历 ${attempt + 1}`,
        value: '已添加空白教育经历块',
        path: `education[${attempt}]`
      });
    } catch (error) {
      failed.push({
        label: `添加教育经历 ${attempt + 1}`,
        value: '',
        path: `education[${attempt}]`,
        error: error.message
      });
      return;
    }
  }
}

async function fillEducations(page, educations, filled, failed) {
  if (!educations.length) return;

  await ensureEducationRows(page, educations.length, filled, failed);

  const controls = page.locator('input:visible, textarea:visible');
  const baseIndex = 18;
  const stride = 11;

  for (const [educationIndex, education] of educations.entries()) {
    const offset = baseIndex + educationIndex * stride;
    const textPlan = [
      { index: offset, label: `教育经历${educationIndex + 1} 学校名称`, value: education.school, path: `education[${educationIndex}].school` },
      { index: offset + 3, label: `教育经历${educationIndex + 1} 学院名称`, value: education.college, path: `education[${educationIndex}].college` },
      { index: offset + 4, label: `教育经历${educationIndex + 1} 专业名称`, value: education.major, path: `education[${educationIndex}].major` },
      { index: offset + 6, label: `教育经历${educationIndex + 1} 研究方向`, value: education.research_direction, path: `education[${educationIndex}].research_direction` },
      { index: offset + 8, label: `教育经历${educationIndex + 1} 成绩(GPA)`, value: education.gpa, path: `education[${educationIndex}].gpa` }
    ].filter((item) => item.value && String(item.value).trim());

    for (const item of textPlan) {
      await fillVisibleControl(controls, item, filled, failed);
    }

    await fillDateControl(page, {
      index: offset + 1,
      label: `教育经历${educationIndex + 1} 开始时间`,
      value: education.start_date || education.start,
      kind: 'start',
      path: `education[${educationIndex}].start_date`
    }, filled, failed);

    await fillDateControl(page, {
      index: offset + 2,
      label: `教育经历${educationIndex + 1} 结束时间`,
      value: education.end_date || education.end,
      kind: 'end',
      path: `education[${educationIndex}].end_date`
    }, filled, failed);

    await fillDropdown(page, {
      index: offset + 5,
      label: `教育经历${educationIndex + 1} 学历`,
      value: education.degree,
      path: `education[${educationIndex}].degree`
    }, filled, failed);

    await fillDropdown(page, {
      index: offset + 7,
      label: `教育经历${educationIndex + 1} 学习形式`,
      value: education.study_form,
      path: `education[${educationIndex}].study_form`
    }, filled, failed);

    await fillDropdown(page, {
      index: offset + 9,
      label: `教育经历${educationIndex + 1} 班级排名`,
      value: education.class_ranking,
      path: `education[${educationIndex}].class_ranking`
    }, filled, failed);

    await fillDropdown(page, {
      index: offset + 10,
      label: `教育经历${educationIndex + 1} 专业排名`,
      value: education.professional_ranking,
      path: `education[${educationIndex}].professional_ranking`
    }, filled, failed);
  }
}

async function ensureInternshipRows(page, targetCount, filled, failed) {
  if (targetCount <= 1) return;

  for (let attempt = 1; attempt < targetCount; attempt += 1) {
    const before = await page.locator('input:visible, textarea:visible').count();
    const addButtons = page.getByText('添加实习经历', { exact: true });
    const addCount = await addButtons.count();
    if (addCount === 0) {
      failed.push({
        label: `添加实习经历 ${attempt + 1}`,
        value: '',
        path: 'internships',
        error: '页面未找到“添加实习经历”按钮'
      });
      return;
    }

    try {
      // The page has one visible section-level add link; keep the action scoped to this exact text.
      await addButtons.nth(addCount - 1).scrollIntoViewIfNeeded();
      await addButtons.nth(addCount - 1).click({ timeout: 3000 });
      await page.waitForFunction((oldCount) => {
        const visible = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')).filter((el) => {
          return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        });
        return visible.length > oldCount;
      }, before, { timeout: 5000 });
      filled.push({
        label: `添加实习经历 ${attempt + 1}`,
        value: '已添加空白实习经历块',
        path: `internships[${attempt}]`
      });
    } catch (error) {
      failed.push({
        label: `添加实习经历 ${attempt + 1}`,
        value: '',
        path: `internships[${attempt}]`,
        error: error.message
      });
      return;
    }
  }
}

async function fillInternships(page, internships, educationCount, filled, failed) {
  if (!internships.length) return;

  await ensureInternshipRows(page, internships.length, filled, failed);

  const controls = page.locator('input:visible, textarea:visible');
  const baseIndex = 29 + Math.max((educationCount || 1) - 1, 0) * 11;
  const stride = 7;
  const internshipPlan = internships.flatMap((internship, internshipIndex) => {
    const offset = baseIndex + internshipIndex * stride;
    return [
      { index: offset, label: `实习经历${internshipIndex + 1} 单位名称`, value: internship.company, path: `internships[${internshipIndex}].company` },
      { index: offset + 1, label: `实习经历${internshipIndex + 1} 所在部门`, value: internship.department, path: `internships[${internshipIndex}].department` },
      { index: offset + 5, label: `实习经历${internshipIndex + 1} 职位名称`, value: internship.title, path: `internships[${internshipIndex}].title` },
      {
        index: offset + 6,
        label: `实习经历${internshipIndex + 1} 实习内容`,
        value: (internship.description ?? [...(internship.responsibilities ?? []), ...(internship.achievements ?? [])]).join('\n'),
        path: `internships[${internshipIndex}].description`
      }
    ];
  }).filter((item) => item.value && String(item.value).trim());

  for (const item of internshipPlan) {
    await fillVisibleControl(controls, item, filled, failed);
  }

  for (const [internshipIndex, internship] of internships.entries()) {
    const offset = baseIndex + internshipIndex * stride;
    await fillDateControl(page, {
      index: offset + 2,
      label: `实习经历${internshipIndex + 1} 开始时间`,
      value: internship.start,
      kind: 'start',
      path: `internships[${internshipIndex}].start`
    }, filled, failed);

    await fillDateControl(page, {
      index: offset + 3,
      label: `实习经历${internshipIndex + 1} 结束时间`,
      value: internship.end,
      kind: 'end',
      path: `internships[${internshipIndex}].end`
    }, filled, failed);
  }
}

async function fillAward(page, internships, educationCount, values, filled, failed) {
  if (!values.award) return;
  const controls = page.locator('input:visible, textarea:visible');
  const extraInternshipRows = Math.max((internships.length || 1) - 1, 0);
  const extraEducationRows = Math.max((educationCount || 1) - 1, 0);
  await fillVisibleControl(controls, {
    index: 42 + extraEducationRows * 11 + extraInternshipRows * 7,
    label: '获奖项',
    value: values.award,
    path: 'awards[0].name'
  }, filled, failed);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1440, height: 1400 }
});
const page = context.pages()[0] ?? await context.newPage();

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(3000);

if (page.url().includes('/login')) {
  console.error('仍在登录页，请先在浏览器中完成登录。');
  process.exitCode = 2;
} else {
  const controls = page.locator('input:visible, textarea:visible');
  const filled = [];
  const failed = [];

  if (values.gender) {
    try {
      await page.getByText(values.gender, { exact: true }).first().click({ timeout: 3000 });
      filled.push({ label: '性别', value: values.gender, path: 'personal.gender' });
    } catch (error) {
      failed.push({ label: '性别', value: values.gender, path: 'personal.gender', error: error.message });
    }
  }

  if (values.birthDate) {
    const item = { index: 4, label: '出生日期', value: values.birthDate, path: 'personal.birth_date' };
    const locator = controls.nth(item.index);
    try {
      await locator.scrollIntoViewIfNeeded();
      await locator.click({ timeout: 3000 });
      await page.locator('.phoenix-calendar-year-select').click({ timeout: 3000 });
      await page.getByText(String(item.value).slice(0, 4), { exact: true }).click({ timeout: 3000 });
      const day = String(Number(String(item.value).slice(8, 10)));
      await page
        .locator('.phoenix-calendar-cell:not(.phoenix-calendar-last-month-cell):not(.phoenix-calendar-next-month-btn-day)')
        .filter({ hasText: new RegExp(`^${day}$`) })
        .first()
        .click({ timeout: 3000 });
      filled.push(item);
    } catch (error) {
      failed.push({ ...item, error: error.message });
    }
  }

  for (const item of fieldPlan) {
    await fillVisibleControl(controls, item, filled, failed);
  }

  await fillDropdowns(page, values, filled, failed);
  await fillEducations(page, educations, filled, failed);
  await fillInternships(page, internships, educations.length, filled, failed);
  await fillAward(page, internships, educations.length, values, filled, failed);

  fs.writeFileSync(path.join(outDir, 'wondershare_filled_fields.json'), JSON.stringify({ filled, failed, skipped }, null, 2));
  await page.screenshot({ path: path.join(outDir, 'wondershare_after_fill.png'), fullPage: true });

  console.log(`已尝试填写: ${filled.length}`);
  console.log(`未能自动填写: ${failed.length}`);
  console.log(`已跳过/需人工确认: ${skipped.length}`);
  console.log(`日志: ${path.join(outDir, 'wondershare_filled_fields.json')}`);
  console.log(`截图: ${path.join(outDir, 'wondershare_after_fill.png')}`);
  console.log('未点击“暂存”“预览并提交”或任何最终提交按钮。浏览器保持打开供你检查。');
}

// Keep browser open for manual review.
await new Promise(() => {});
