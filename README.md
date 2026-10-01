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

### Constant Contact approval integration

Captures go to the reviewer portal and Google Sheet. Constant Contact receives a contact only after an authenticated reviewer approves it. Administrators connect the account once from the Users page. Server credentials stay in `.env`; OAuth tokens are encrypted in MongoDB.

See [setup](docs/SETUP.md) and [integration details](docs/CONSTANT_CONTACT.md). Existing Constant Contact records are preserved. Transfer status reflects provider confirmation, and uncertain creates require reconciliation before another write.

Run `node --test server/integrations/constantContact.test.mjs` for mocked provider tests.
