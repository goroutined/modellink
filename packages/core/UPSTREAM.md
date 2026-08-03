# Upstream compatibility

The catalog schema, model-family list, inheritance rules, and generator in this directory are based on models.dev commit:

```text
98aa3b425ab4216419d5f5d9d7308c88d57f3f8a
```

Upstream repository: <https://github.com/anomalyco/models.dev>

Before importing a new data batch, compare these files with the current upstream versions:

```text
packages/core/src/schema.ts
packages/core/src/family.ts
packages/core/src/generate.ts
```

Any upstream schema change should be adopted and validated before synchronizing data that depends on it.
