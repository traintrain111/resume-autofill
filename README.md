# Resume Autofill MVP

This MVP is a Codex-ready project for semi-automated job application form filling.

It does **not** click final submit buttons. The intended workflow is:

1. Copy `resume_profile.example.yaml` to `resume_profile.yaml`, then put your verified resume data into `resume_profile.yaml`.
2. Open this folder in Codex.
3. Ask Codex to follow `SKILL.md` and `prompts/fill_application.md`.
4. Use the optional Playwright helper in `scripts/fill_application.mjs` for basic field filling.
5. Manually review every page before submitting.

## Why this MVP works

Most career sites parse PDF resumes badly. This project avoids that by using a structured resume profile as the source of truth. The browser automation only maps visible form fields to that profile.

## Install

```bash
npm install
npx playwright install chromium
```

## Usage

Create your local profile first:

```bash
cp resume_profile.example.yaml resume_profile.yaml
```

Edit `resume_profile.yaml`, then run:

```bash
npm run fill -- --url "https://example.com/apply" --manual-login
```

Recommended Codex prompt:

```text
Read SKILL.md and prompts/fill_application.md. Use resume_profile.yaml as the only source of truth. Help me fill this job application page: <URL>. Do not click final submit.
```

## Files

- `resume_profile.example.yaml`: sanitized example profile schema safe to commit.
- `resume_profile.yaml`: your local structured resume data. This file is ignored by Git.
- `SKILL.md`: reusable operating rules for Codex or another coding/browser agent.
- `prompts/fill_application.md`: reusable task prompt.
- `scripts/fill_application.mjs`: optional Playwright helper.
- `examples/field_mapping_notes.md`: notes on mapping page fields to profile fields.

## Safety rules

- Do not store passwords, SMS codes, ID card numbers, passport numbers, bank details, or private account tokens in this repo.
- Do not let an agent click final submit, sign, authorize background checks, or accept legal agreements without your manual confirmation.
- Treat every generated answer to open-ended questions as a draft.
