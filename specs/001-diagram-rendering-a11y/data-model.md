# Data Model: Accessible Diagram Rendering

## DiagramConfig

Author-provided optional configuration.

| Field | Type | Required | Validation |
|---|---|---:|---|
| `krokiUrl` | string | No | Absolute parseable URL |
| `output` | enum | No | `img-html-base64`, `inline-svg`, `img-base64`, or `object-base64` |
| `failOnError` | boolean | No | Boolean only |

## ResolvedDiagramConfig

Configuration after defaults are applied.

| Field | Type | Default |
|---|---|---|
| `krokiUrl` | string | `https://kroki.io` |
| `output` | output enum | `img-html-base64` |
| `failOnError` | boolean | `true` |
| `locale` | `nl` or `en` | `nl` |

The option mapper converts this entity to provider options. `krokiUrl` maps to
the provider's `server`, `output` remains `output`, aliases include PlantUML and
Mermaid, and the diagram-mode toggle is disabled for Brightspace.

## DiagramIssue

A problem detectable without contacting the rendering service.

| Field | Type | Required |
|---|---|---:|
| `kind` | `unsupported-language`, `unknown-fence-option`, `invalid-src`, `empty-diagram`, or `invalid-option-value` | Yes |
| `sourceFile` | string | Yes |
| `position` | line and column | No |
| `diagramTitle` | string | No |
| `message` | string | Yes |

## DiagramError

A failure surfaced while rendering or applying the failure policy.

| Field | Type | Required |
|---|---|---:|
| `category` | `kroki-unreachable`, `invalid-source`, or `invalid-parameter` | Yes |
| `sourceFile` | string | Yes |
| `diagram` | optional position/title object | Yes |
| `reason` | string | Yes |

### State Transition

```text
detected error
  ├── failOnError=true  -> throw -> build failed
  └── failOnError=false -> warn -> original code block -> build continues
```

Author errors never transition to `kroki-unreachable`, even if the endpoint is
also unavailable.

## DiagramAdaptContext

Context supplied to the Brightspace output adapter.

| Field | Type | Purpose |
|---|---|---|
| `sourceFile` | string | Stable source identity and diagnostics |
| `makeId` | function | Deterministic ID for title, description, and source |

## AccessibleDiagramOutput

An output invariant rather than persisted data:

- one rendered image or inline SVG;
- a non-empty accessible name;
- a deterministic association to a textual description when present;
- one native source disclosure containing the exact original source;
- one native description disclosure when a description exists;
- no script required for display or disclosure behavior.
