# Living Specification & Design Docs Rule

Treat `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` as living documents for AaruDB:

1. **Product & Math Specs (`PRODUCT.md`):** Whenever we finalize and keep new product features, planner formulas, calendar rules, or data/ETL pipelines, update `PRODUCT.md` in the same session so product truth never lags behind the codebase.
2. **Visual System & Sidecar (`DESIGN.md` + `.impeccable/design.json`):** Whenever visual tokens, typography, layout structure, or component patterns are finalized and kept (never during throwaway or rolled-back experiments), update `DESIGN.md` and regenerate `.impeccable/design.json` right afterward so the sidecar stays in sync and `impeccable doctor` stays clean.
3. **Never pollute canonical specs mid-spike:** If a visual direction is still experimental or gets rolled back, leave `DESIGN.md` and `.impeccable/design.json` untouched until the user confirms the direction.
