# CardSnap by Vision71

The internal architecture pilot, setup instructions, validation evidence and production limitations are documented in [docs/README-pilot.md](docs/README-pilot.md). Run `npm run pilot:setup` then `npm run pilot` for the named-user pilot at `http://localhost:3000/pilot/`.

The readiness report is in `artifacts/CardSnap-Architecture-Readiness.pdf`. The React application remains a fictional-only public demonstration; arbitrary public uploads are disabled.

## Original frontend development notes

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

### OCR benchmark and Constant Contact export

`npm run test:ocr` recognizes the cards in `validation/ocr/manifest.json` and exports their extracted name, email, company, primary/alternate phone, and benchmark source to the configured Constant Contact list. It uses `.env`, the pilot's stored OAuth connection and destination configuration, `DATA_PATH`, and `DATA_KEY`. `CC_TENANT` defaults to `demo`. Connect and configure a confirmed test account in the pilot first.

Each card's export status and remote contact ID are saved in `validation/ocr/results.json`. Existing email addresses are skipped without overwriting contacts. Missing names or invalid emails are reported, and any invalid contact or failed export makes the command exit nonzero. OCR accuracy mismatches remain visible in the report; exported values come from OCR, not the expected fixture values. Interrupted or uncertain writes require reconciliation through the pilot before retrying.

Use `npm run test:ocr -- --no-export` for a local benchmark without Constant Contact writes.
