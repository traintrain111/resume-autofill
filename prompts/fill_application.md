# Fill Job Application Prompt

Use this prompt with Codex or another browser-capable coding agent.

```text
Read `SKILL.md` first and follow it strictly.

Task:
Help me fill this job application form: {{JOB_URL}}

Inputs:
- `resume_profile.yaml` is the only source of factual resume data.
- You may inspect and modify files in this project if needed.
- You may use Playwright or browser automation to interact with the page.

Rules:
1. Do not click final submit/apply/confirm/sign/authorize buttons.
2. Let me manually handle login, CAPTCHA, SMS/email verification, passwords, and sensitive identity fields.
3. Fill only fields that can be confidently mapped to `resume_profile.yaml`.
4. For ambiguous fields, pause and ask me.
5. For open-ended questions, draft only from existing profile facts and mark them for my review.
6. After each page, check visible errors and required fields.
7. At the end, give me a review report with filled, inferred, skipped, uncertain, and needs-review fields.

Suggested workflow:
1. Inspect `resume_profile.yaml` and summarize available profile data.
2. Open the target URL.
3. Wait for me to complete login if necessary.
4. Inspect form fields and map them to profile paths.
5. Fill the fields.
6. Stop before final submission.
```
