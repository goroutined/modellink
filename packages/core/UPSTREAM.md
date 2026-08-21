# Upstream compatibility

The catalog schema, model-family list, inheritance rules, and generator in this directory are based on models.dev commit:

```text
98aa3b425ab4216419d5f5d9d7308c88d57f3f8a
```

Upstream repository: <https://github.com/anomalyco/models.dev>

ModelLink intentionally extends the upstream schema with `protocol` and `endpoints` on providers, model-level `endpoints`, and `cost_cn` on provider models. The legacy `protocol`/`api` pair remains the default endpoint for compatibility. `cost_cn.thinking` records the complete input/output rates used when thinking mode has different pricing. `cost_cn.tiers[].tier.type = "conditional"` supports joint input/output token ranges and timezone-aware daily pricing windows; the upstream-compatible `context` tier remains supported. These fields are maintained locally and must be preserved when refreshing upstream files.

Before importing a new data batch, compare these files with the current upstream versions:

```text
packages/core/src/schema.ts
packages/core/src/family.ts
packages/core/src/generate.ts
```

Any upstream schema change should be adopted and validated before synchronizing data that depends on it.
