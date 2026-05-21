# Field Mapping Notes

Use these heuristics when improving `scripts/fill_application.mjs`.

## Label sources

For a form control, inspect:

- `<label for="id">` text
- parent label text
- nearby text in the same form group
- `placeholder`
- `name`
- `id`
- `aria-label`
- section headings such as education, work experience, project experience

## Confidence scoring idea

High confidence:

- Exact label match, e.g. `邮箱` -> `personal.email`
- Unique placeholder, e.g. `请输入手机号` -> `personal.phone`
- Standard field name, e.g. `email`, `mobile`, `firstName`

Medium confidence:

- Semantic match with section context, e.g. `名称` under education -> school name
- Dropdown option clearly matches profile value

Low confidence:

- Generic label, e.g. `名称`, `说明`, `备注`, `其他`
- Legal or demographic questions
- Salary and availability questions when not explicit in profile

## Suggested next improvements

- Add LLM-based field classification behind a manual approval mode.
- Add screenshot capture before and after each page.
- Add persistent `uncertain_fields.json` and `filled_fields.json` logs.
- Add support for iframes.
- Add company-specific adapters for high-frequency career systems.
