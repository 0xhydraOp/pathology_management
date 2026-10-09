# Clinical-rule review pack

**Pending qualified laboratory approval. This is a software review, not medical approval.**

The deterministic [CLINICAL_RULE_INVENTORY.json](CLINICAL_RULE_INVENTORY.json) lists every shipped parameter, formula, dependency, unit, decimal precision, reference rule and critical threshold, with the catalogue SHA-256. Generate it with `node scripts/generate-clinical-review.cjs`. The generator reads repository files only; it never opens any lab database. Customer-configured approved intervals must be reviewed separately in that lab's settings and approval history. No interval, formula or critical threshold was replaced during this pass.

## Calculated parameters

| Code | Existing formula | Input units | Output | Decimals | Existing applicability |
|---|---|---|---|---|---|
| GLOB | TP − ALB | TP, ALB: g/dL | g/dL | 2 | Finite ordered inputs |
| AGRATIO | ALB / GLOB | ALB, GLOB: g/dL | Unitless | 2 | GLOB must not equal zero |
| LDL | TC − HDL − TG/5 | TC, HDL, TG: mg/dL | mg/dL | 0 | Existing implementation withholds at TG > 400 |
| VLDL | TG/5 | TG: mg/dL | mg/dL | 0 | Finite ordered input |

**Clinical source provenance is unknown per rule.** The catalogue carries a general literature/laboratory source claim, reproduced as unverified metadata in the inventory. It does not provide traceable method-, population- or instrument-specific approval. The TG threshold is existing software behavior, not a newly recommended cutoff. VLDL has no analogous threshold in current policy. Whether additional applicability conditions are medically required is for qualified personnel to decide; this pass must not invent them.

## Calculation and classification contract

- Numeric input uses strict finite decimal parsing. Blank means missing; zero and valid abnormal values remain allowed. Prefixes such as `12abc`, hexadecimal, NaN and infinity are rejected.
- Missing dependencies and division by zero/non-finite output clear the derived value and prevent completion/finalization. A persisted NULL-value review placeholder explains why calculation is unavailable; it is never counted as a filled result. Previously saved derived values must not survive a dependency being cleared.
- Inputs must be ordered tests; unrelated saved rows must not supply dependencies. Cycles must remain uncalculated.
- Formula arithmetic uses JavaScript binary64. `toFixed(decimal_places)` rounds for storage/display; a derived dependency is subsequently consumed at that stored precision. Review this chained rounding clinically, particularly AGRATIO.
- Classification of the final calculation uses its raw value, not the rounded display. A synthetic raw value `1.004` displayed as `1.00` can therefore be H against synthetic high `1.003`. This may require an explanatory report policy approved by the lab; changing it silently would be a clinical policy change.
- Known shipped formula expressions/dependencies are checked against the source input and output units. Changing a dependency or output unit withholds incompatible calculations with an explicit review message; there is no implicit conversion. Custom or historical unknown-source formulas cannot establish clinically approved units from this inventory; their provenance remains explicitly unknown and requires qualified review. Units are clinically meaningful even when input values remain finite.
- Approved reference rules are separate from critical thresholds. Qualitative reference text does not automatically produce N/L/H. Independent critical thresholds can produce C even without an approved reference interval; C is not an inferred normal/abnormal range flag.
- Reference boundaries respect inclusive/exclusive settings and one-sided limits. Ambiguous matching must withhold the range flag. Unknown sex only matches an `any` rule.
- Registration stores completed years, so matching requires coverage of the whole `[age, age+1)` uncertainty window. Infants, fractional years, missing age and age-boundary uncertainty require manual review. The software does not approximate infant age.
- Issued reports use immutable saved content. Legacy `legacy-at-upgrade` snapshots preserve only what was available at upgrade, not the original historical issuance state. Older versions without captured formula provenance cannot reconstruct their original formula or dependencies; do not infer these from the current catalogue.

## Synthetic worked examples and software evidence

The inventory includes worked formula examples, the existing TG applicability boundary, missing/invalid input, division by zero, incompatible unit and raw-versus-display classification examples. Run `node --test scripts/test-clinical-software.cjs` for catalogue formula outputs, save/restart behavior, input/output unit guards with restart/resumption, issuance denial while unavailable and frontend/backend demographic/flag parity. Existing result-integrity and reference-hardening suites cover rollback, ordered completion, approval, missing ages and issuance invariance. A green suite demonstrates these specified software behaviors only.

## Qualified review and sign-off checklist

For each lab, record reviewer name, professional role, review date, instrument/method, applicable population, source/version, decision and unresolved concerns. Keep approval in the app's interval approval/audit workflow rather than editing this pack to fabricate approval.

- [ ] Verify every catalogue parameter identity/name/unit and local instrument method.
- [ ] Validate each formula and dependency, denominator handling and applicability conditions with independently calculated examples.
- [ ] Approve decimal precision, chained rounding and raw-versus-display flag policy.
- [ ] Review each age/sex reference interval against an identifiable source and local validation; review gaps/overlaps and unknown demographics.
- [ ] Confirm infant results remain manual until exact age representation and approved matching are available.
- [ ] Approve qualitative reference text and interpretation without treating it as a numerical rule.
- [ ] Review critical thresholds separately from reference intervals and diagnostic cutoffs; establish clinical notification procedures.
- [ ] Verify the report communicates missing interval/manual review and preserves units/provenance on issuance/amendment.
- [ ] Review historical-report limitations; never reinterpret an unchanged issued result with today's interval/formula.
- [ ] Perform local parallel validation using synthetic/authorized controlled material before routine release; document acceptance criteria and discrepancies.

No reviewer has been assigned and no medical approval is recorded by this software pass. These approvals remain release-readiness limitations.
