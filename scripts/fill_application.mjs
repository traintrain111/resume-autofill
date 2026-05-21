#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import yaml from 'js-yaml';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const PROFILE_PATH = path.join(ROOT, 'resume_profile.yaml');
const OUT_DIR = path.join(ROOT, 'run_output');
const FILLED_LOG = path.join(OUT_DIR, 'filled_fields.json');
const UNCERTAIN_LOG = path.join(OUT_DIR, 'uncertain_fields.json');

function parseArgs(argv) {
  const args = { manualLogin: false, headless: false, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--url') args.url = argv[++i];
    else if (item === '--profile') args.profile = argv[++i];
    else if (item === '--manual-login') args.manualLogin = true;
    else if (item === '--headless') args.headless = true;
    else if (item === '--dry-run') args.dryRun = true;
    else if (item === '--help' || item === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function usage() {
  console.log(`Usage:\n  npm run fill -- --url "https://example.com/apply" [--manual-login] [--dry-run]\n\nOptions:\n  --url            Target job application URL\n  --profile        Path to resume_profile.yaml. Defaults to ./resume_profile.yaml\n  --manual-login   Pause after navigation so you can log in manually\n  --headless       Run browser headlessly\n  --dry-run        Do not type into fields; only print proposed mapping\n`);
}

function loadProfile(profilePath) {
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile file not found: ${profilePath}`);
  }
  const raw = fs.readFileSync(profilePath, 'utf8');
  return yaml.load(raw);
}

function joinBullets(items) {
  if (!items || !Array.isArray(items)) return '';
  return items.join('\n');
}

function compact(items) {
  return items.filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
}

function flattenProfile(profile) {
  const education = profile.education?.[0] ?? {};
  const internship = profile.internships?.[0] ?? {};
  const project = profile.projects?.[0] ?? {};
  const cert = profile.certificates?.[0] ?? {};

  const nameEn = profile.personal?.name_en ?? '';
  const nameParts = nameEn.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  return [
    { path: 'personal.name_zh', value: profile.personal?.name_zh, keywords: ['姓名', '中文名', '真实姓名', 'name', 'full name', 'legal name'] },
    { path: 'personal.name_en', value: profile.personal?.name_en, keywords: ['英文名', 'english name', 'preferred name'] },
    { path: 'personal.first_name', value: firstName, keywords: ['first name', 'given name', '名'] },
    { path: 'personal.last_name', value: lastName, keywords: ['last name', 'family name', 'surname', '姓'] },
    { path: 'personal.email', value: profile.personal?.email, keywords: ['邮箱', '电子邮箱', 'email', 'e-mail', 'mail'] },
    { path: 'personal.phone', value: profile.personal?.phone, keywords: ['手机', '手机号', '电话', '联系电话', 'phone', 'mobile', 'tel'] },
    { path: 'personal.location', value: profile.personal?.location, keywords: ['所在地', '现居地', '城市', 'location', 'current city', 'city'] },
    { path: 'personal.linkedin', value: profile.personal?.linkedin, keywords: ['linkedin'] },
    { path: 'personal.github', value: profile.personal?.github, keywords: ['github'] },
    { path: 'personal.portfolio', value: profile.personal?.portfolio, keywords: ['个人网站', '作品集', 'portfolio', 'website', 'homepage'] },
    { path: 'personal.expected_role', value: profile.personal?.expected_role, keywords: ['求职意向', '期望岗位', '目标岗位', 'desired role', 'target role'] },
    { path: 'personal.availability', value: profile.personal?.availability, keywords: ['到岗', '入职时间', '可入职', 'availability', 'start work'] },

    { path: 'education[0].school', value: education.school, keywords: ['学校', '毕业院校', '院校', '大学', 'university', 'college', 'institution', 'school'] },
    { path: 'education[0].degree', value: education.degree, keywords: ['学历', '学位', 'degree', 'education level'] },
    { path: 'education[0].major', value: education.major, keywords: ['专业', 'major', 'field of study'] },
    { path: 'education[0].start', value: education.start, keywords: ['入学', '教育开始', 'start date', 'education start'] },
    { path: 'education[0].end', value: education.end, keywords: ['毕业', '教育结束', 'graduation', 'end date', 'education end'] },
    { path: 'education[0].gpa', value: education.gpa, keywords: ['gpa', '绩点'] },
    { path: 'education[0].ranking', value: education.ranking, keywords: ['排名', 'ranking', 'rank'] },

    { path: 'internships[0].company', value: internship.company, keywords: ['公司', '雇主', '实习单位', 'company', 'employer'] },
    { path: 'internships[0].title', value: internship.title, keywords: ['职位', '岗位', '职务', 'title', 'position', 'role'] },
    { path: 'internships[0].department', value: internship.department, keywords: ['部门', 'department'] },
    { path: 'internships[0].location', value: internship.location, keywords: ['工作地点', '实习地点', 'work location'] },
    { path: 'internships[0].start', value: internship.start, keywords: ['实习开始', '工作开始', 'start date'] },
    { path: 'internships[0].end', value: internship.end, keywords: ['实习结束', '工作结束', 'end date'] },
    { path: 'internships[0].responsibilities', value: joinBullets(internship.responsibilities ?? internship.description), keywords: ['职责描述', '工作职责', '职责', 'responsibilities', 'duties'] },
    { path: 'internships[0].achievements', value: joinBullets(internship.achievements), keywords: ['工作业绩', '工作成果', '主要成果', 'achievements', 'results', 'impact'] },
    { path: 'internships[0].description', value: joinBullets(internship.description ?? [...(internship.responsibilities ?? []), ...(internship.achievements ?? [])]), keywords: ['工作内容', '实习内容', 'description'] },

    { path: 'projects[0].name', value: project.name, keywords: ['项目名称', 'project name'] },
    { path: 'projects[0].role', value: project.role, keywords: ['项目角色', 'role in project', 'project role'] },
    { path: 'projects[0].start', value: project.start, keywords: ['项目开始', 'project start'] },
    { path: 'projects[0].end', value: project.end, keywords: ['项目结束', 'project end'] },
    { path: 'projects[0].responsibilities', value: joinBullets(project.responsibilities), keywords: ['项目职责', '项目责任', 'project responsibilities'] },
    { path: 'projects[0].description', value: joinBullets(project.description), keywords: ['项目描述', 'project description'] },

    { path: 'skills.all', value: compact([...(profile.skills?.tools ?? []), ...(profile.skills?.programming ?? [])]).join(', '), keywords: ['技能', 'skills', 'technical skills'] },
    { path: 'skills.languages', value: compact(profile.skills?.languages ?? []).join(', '), keywords: ['语言', 'languages', 'language ability'] },
    { path: 'certificates[0].name', value: cert.name, keywords: ['证书', 'certification', 'certificate'] },

    { path: 'open_ended_answers.self_introduction', value: profile.open_ended_answers?.self_introduction, keywords: ['自我介绍', '个人介绍', 'about you', 'self introduction'] },
    { path: 'open_ended_answers.career_goal', value: profile.open_ended_answers?.career_goal, keywords: ['职业规划', 'career goal', 'career objective'] },
    { path: 'open_ended_answers.why_this_company', value: profile.open_ended_answers?.why_this_company, keywords: ['为什么选择我们公司', 'why this company'] },
    { path: 'open_ended_answers.why_this_role', value: profile.open_ended_answers?.why_this_role, keywords: ['为什么选择该岗位', 'why this role', 'why are you interested'] }
  ].filter((item) => item.value && String(item.value).trim() && !String(item.value).includes('MANUAL_INPUT_ONLY'));
}

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s:_\-*/\\()[\]{}.,;|]+/g, ' ')
    .trim();
}

function scoreField(fieldText, candidate) {
  const text = normalize(fieldText);
  if (!text) return 0;
  let score = 0;
  for (const kw of candidate.keywords) {
    const key = normalize(kw);
    if (!key) continue;
    if (text === key) score += 12;
    else if (text.includes(key)) score += 8;
    else {
      const tokens = key.split(' ').filter(Boolean);
      if (tokens.length > 1 && tokens.every((t) => text.includes(t))) score += 5;
    }
  }

  if (/password|验证码|captcha|sms|code|身份证|id card|passport|bank|salary|薪资|期望薪资/.test(text)) {
    score -= 100;
  }
  return score;
}

function bestCandidate(fieldText, candidates) {
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreField(fieldText, candidate) }))
    .sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}

async function waitForEnter(message) {
  const rl = readline.createInterface({ input, output });
  await rl.question(message);
  rl.close();
}

async function collectControls(page) {
  return page.locator('input, textarea, select').evaluateAll((els) => {
    function textOf(el) {
      return (el?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function labelText(el) {
      const parts = [];
      if (el.id) {
        const direct = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (direct) parts.push(textOf(direct));
      }
      const parentLabel = el.closest('label');
      if (parentLabel) parts.push(textOf(parentLabel));
      const group = el.closest('[class*="form"], [class*="field"], [class*="item"], [class*="row"], [class*="control"], div, li');
      if (group) parts.push(textOf(group).slice(0, 240));
      return [...new Set(parts.filter(Boolean))].join(' | ');
    }

    return els.map((el, index) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const options = tag === 'select'
        ? Array.from(el.options).map((opt) => ({ value: opt.value, text: opt.textContent.trim() }))
        : [];
      return {
        index,
        tag,
        type,
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        label: labelText(el),
        required: Boolean(el.required || el.getAttribute('aria-required') === 'true'),
        disabled: Boolean(el.disabled),
        readonly: Boolean(el.readOnly),
        value: el.value || '',
        options
      };
    });
  });
}

function fieldText(control) {
  return compact([control.label, control.placeholder, control.name, control.id, control.ariaLabel, control.type]).join(' | ');
}

function shouldSkipControl(control) {
  if (control.disabled || control.readonly) return true;
  if (['hidden', 'password', 'file', 'submit', 'button', 'reset', 'checkbox', 'radio'].includes(control.type)) return true;
  const text = normalize(fieldText(control));
  return /password|验证码|captcha|sms|verification code|身份证|id card|passport|bank/.test(text);
}

function chooseSelectOption(control, value) {
  if (!control.options?.length) return null;
  const wanted = normalize(value);
  const exact = control.options.find((opt) => normalize(opt.text) === wanted || normalize(opt.value) === wanted);
  if (exact) return exact.value || exact.text;
  const partial = control.options.find((opt) => normalize(opt.text).includes(wanted) || wanted.includes(normalize(opt.text)));
  if (partial) return partial.value || partial.text;
  return null;
}

async function fillControlByIndex(page, controlIndex, value, control) {
  const locator = page.locator('input, textarea, select').nth(controlIndex);
  if (control.tag === 'select') {
    const selected = chooseSelectOption(control, value);
    if (!selected) return { ok: false, reason: 'no_matching_option' };
    await locator.selectOption(selected);
    return { ok: true, value: selected };
  }
  await locator.fill(String(value));
  return { ok: true, value };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.url) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const profile = loadProfile(args.profile ? path.resolve(args.profile) : PROFILE_PATH);
  const candidates = flattenProfile(profile);

  const browser = await chromium.launch({ headless: args.headless });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  console.log(`[open] ${args.url}`);
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (args.manualLogin) {
    await waitForEnter('Complete login/CAPTCHA in the browser, then press Enter here to continue...');
  }

  await page.waitForTimeout(1000);
  const controls = await collectControls(page);
  const filled = [];
  const uncertain = [];

  for (const control of controls) {
    if (shouldSkipControl(control)) continue;
    if (control.value && String(control.value).trim()) continue;

    const text = fieldText(control);
    const match = bestCandidate(text, candidates);
    const proposed = match?.candidate;
    const score = match?.score ?? 0;

    if (!proposed || score < 8) {
      uncertain.push({ control, fieldText: text, reason: 'low_confidence', score });
      continue;
    }

    const record = {
      control: {
        index: control.index,
        tag: control.tag,
        type: control.type,
        name: control.name,
        id: control.id,
        label: control.label,
        placeholder: control.placeholder
      },
      profilePath: proposed.path,
      value: proposed.value,
      score
    };

    if (args.dryRun) {
      record.status = 'dry_run';
      filled.push(record);
      continue;
    }

    try {
      const result = await fillControlByIndex(page, control.index, proposed.value, control);
      record.status = result.ok ? 'filled' : 'skipped';
      if (!result.ok) record.reason = result.reason;
      filled.push(record);
    } catch (error) {
      uncertain.push({ control, fieldText: text, profilePath: proposed.path, reason: 'fill_error', error: error.message, score });
    }
  }

  fs.writeFileSync(FILLED_LOG, JSON.stringify(filled, null, 2));
  fs.writeFileSync(UNCERTAIN_LOG, JSON.stringify(uncertain, null, 2));

  console.log(`\nFilled or proposed fields: ${filled.length}`);
  console.log(`Uncertain/skipped fields: ${uncertain.length}`);
  console.log(`Logs written to:\n- ${FILLED_LOG}\n- ${UNCERTAIN_LOG}`);
  console.log('\nReview the browser manually. This script will not click final submit.');

  if (!args.headless) {
    await waitForEnter('Press Enter to close the browser...');
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
