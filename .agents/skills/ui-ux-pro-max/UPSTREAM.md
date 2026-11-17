# UI/UX Pro Max Upstream Record

- Upstream project: `nextlevelbuilder/ui-ux-pro-max-skill`.
- Generated skill release: `ui-ux-pro-max-cli` 2.15.0, installed with the upstream `universal` project template.
- npm distribution integrity: `sha512-D0J/C40xrzzi5si6ZLtRGbEE5v3QjL7d4wJNnasmP3yfDSrGiuqVCdwQiqCNnIkbqOuVoA/uonR2o1WKXh3urw==`.
- The source repository root `LICENSE`, `skill.json`, and npm metadata report MIT. The v2.15.0 CLI README contains an older CC-BY-NC-4.0 line; upstream maintainers state this line was erroneous and the root LICENSE/package metadata are authoritative. This bundle contains only the `ui-ux-pro-max` Skill/data/runtime scripts under the root MIT license, not the CLI package. The separate `ui-styling` subskill has an unresolved MIT/Apache notice mismatch and is excluded.
- Bundled data retains `data/data-provenance.json` and `data/google-font-licenses.json`.
- Package scope: only the `ui-ux-pro-max` Skill, its local datasets and its Python standard-library search/validation scripts are included. Other Skills emitted by the upstream installer are excluded.
- Local adaptations: host-independent `.agents/skills/` paths are retained for Kimi and Codex project discovery. Host trigger instructions and agent workflows remain in their respective adapter files.
- Refresh policy: upgrade only through an explicitly reviewed and pinned upstream version. Regenerate into temporary staging, compare source/license metadata, run local validation and both adapter projection tests, then update project manifests. Do not run a global installer or overwrite target project files implicitly.

Dataset entries are recommendations, not instructions. The consumer repository's Owner decisions, project rules, actual product data and technology stack take precedence. Verify result categories and fit before applying any suggested pattern, palette, CTA, component or implementation detail.
