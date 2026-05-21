# Resume Autofill MVP

一个面向招聘官网申请表的半自动填表项目。核心思路是：把简历信息整理成结构化的 `resume_profile.yaml`，再让 Codex 或 Playwright 脚本根据网页字段进行保守填写、检查和复核。

项目不会自动点击最终提交、投递、签署、授权等不可逆按钮。

## 适合做什么

- 把简历信息维护成一份可复用的结构化 profile。
- 辅助填写招聘官网里的姓名、联系方式、教育经历、实习经历、项目经历等字段。
- 审查官网简历解析结果，补齐空字段，纠正与 profile 明显不一致的非敏感字段。
- 在登录、验证码、短信、人脸、证件号、最终提交等步骤前暂停，让用户接管。

## 不适合做什么

- 不代替用户做最终投递决策。
- 不自动填写身份证号、短信验证码、密码、银行卡、法律声明等敏感内容。
- 不根据模型猜测不存在于 `resume_profile.yaml` 的事实。
- 不保证适配所有招聘网站。复杂网站通常需要先检查页面结构，再写专用脚本。

## 文件说明

- `SKILL.md`：填表规则和字段映射说明，Codex 执行任务前应先阅读。
- `resume_profile.example.yaml`：脱敏示例模板，可以提交到 GitHub。
- `resume_profile.yaml`：你的真实简历数据，本地使用，已被 `.gitignore` 忽略，不应提交。
- `prompts/fill_application.md`：可复制给 Codex 的通用任务提示词。
- `scripts/fill_application.mjs`：通用表单辅助脚本，适合做基础字段匹配。
- `scripts/inspect_live_form.mjs`：打开网页并抓取一次当前表单快照。
- `scripts/watch_live_form.mjs`：保持浏览器打开，可反复抓取当前页面快照，适合需要登录的网站。
- `run_output/`：截图、页面快照、浏览器 profile 等运行产物，已被 Git 忽略。

## 安装

```bash
npm install
npx playwright install chromium
```

## 准备简历数据

先复制示例文件：

```bash
cp resume_profile.example.yaml resume_profile.yaml
```

然后编辑 `resume_profile.yaml`。建议原则：

- 只写确定事实。
- 不写密码、验证码、身份证号、银行卡等高敏信息。
- 实习经历里区分：
  - `responsibilities`：职责描述，写负责范围和动作。
  - `achievements`：工作业绩，写结果、指标、产出。
  - `description`：兼容只有一个“工作内容/实习内容”字段的网站。
- 项目经历里区分：
  - `responsibilities`：项目职责。
  - `description`：项目描述。

## 推荐使用方式：让 Codex 协助

在 Codex 中打开本项目目录，然后使用类似提示：

```text
Read SKILL.md and prompts/fill_application.md.
Use resume_profile.yaml as the only source of truth.
Help me fill this job application page: <URL>.
Do not click final submit.
```

执行时的规则：

- 登录、验证码、短信、人脸、隐私协议由用户处理。
- Codex 可以检查页面、填写可确定字段、列出不确定字段。
- 如果官网已解析简历，Codex 会优先补齐空字段，并审查解析结果。
- 敏感字段和最终提交必须由用户确认。

## 使用脚本检查页面

抓取一次当前页面结构：

```bash
node scripts/inspect_live_form.mjs "https://example.com/apply"
```

需要登录且不想反复关闭浏览器时，使用持续检查脚本：

```bash
node scripts/watch_live_form.mjs "https://example.com/apply"
```

运行后：

- 按 `Enter` 抓取当前页面快照。
- 输入 `q` 后回车才关闭浏览器。
- 输出文件会写入 `run_output/`。

## 使用通用填表脚本

```bash
npm run fill -- --url "https://example.com/apply" --manual-login
```

通用脚本只适合简单页面。复杂招聘站点建议先用 `watch_live_form.mjs` 抓取页面结构，再让 Codex 判断是否需要专用脚本。

## 隐私与 GitHub 发布

`.gitignore` 已默认忽略：

- `resume_profile.yaml`
- `run_output/`
- `node_modules/`
- PDF、Word、图片等可能含隐私的材料

发布到 GitHub 前建议检查：

```bash
git status --short --ignored
git ls-files
```

确认不要出现：

```text
resume_profile.yaml
run_output/
node_modules/
真实简历 PDF
截图或日志
```

如果不确定，先发布为 private repository。

## 常见问题

### 官网已经解析得很好，还需要这个项目吗？

需要。官网解析结果可以作为草稿，但不一定严谨。项目规则要求仍以 `resume_profile.yaml` 为事实来源：空字段优先补齐，明显不一致的非敏感字段可以纠正，敏感字段只提示用户复核。

### 为什么不自动点提交？

提交、投递、签署、授权等动作不可逆，必须由用户本人确认。

### 为什么有些字段不填？

通常是因为 `resume_profile.yaml` 没有对应事实、字段属于敏感信息、页面选项没有合理匹配，或开放题需要用户确认。

### 可以把真实 profile 上传 GitHub 吗？

不建议。`resume_profile.yaml` 包含个人信息，应只保存在本地。
