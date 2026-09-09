# Contract: `diagrams` configuration

The optional `diagrams` object is part of `brightspacosaurus.config.json`.

```json
{
  "diagrams": {
    "krokiUrl": "https://kroki.io",
    "output": "img-html-base64",
    "failOnError": true
  }
}
```

| Property | Accepted values | Default |
|---|---|---|
| `krokiUrl` | Absolute URL string | `https://kroki.io` |
| `output` | `img-html-base64`, `inline-svg`, `img-base64`, `object-base64` | `img-html-base64` |
| `failOnError` | JSON boolean | `true` |

## Validation contract

- `diagrams` MUST be an object when present.
- Unknown or malformed values MUST produce an actionable configuration error.
- A custom endpoint MUST be passed unchanged to the rendering provider.
- Missing values MUST be filled independently; a partial object is valid.
- `KROKI_BASE_URL` remains available to the provider, but explicit project
  configuration is the documented project-level contract.

## Failure contract

With `failOnError: true`, an unreachable endpoint, rejected source, or invalid
parameter fails the build. With `false`, the same condition emits a warning and
retains the original fenced block. Diagnostics identify the source file,
diagram position or title when known, category, and reason.
