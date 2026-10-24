# ADR 024 — A native Brightspace package next to the Common Cartridge

## Status

Proposed. The spike (`bso pack --format brightspace`, #21) exists; the decision waits for an import of its package into a Brightspace sandbox.

## Context

BSO exports an IMS Common Cartridge (`.imscc`). A Common Cartridge import does not carry the text and images of a main menu item (a module's description): this was seen in practice, and a try with `lomimscc:general/description` in the manifest (#13) was not read by Brightspace. Brightspace's own export is a different file, a `.zip` with D2L XML. The reference exports of one course, made on 22 October 2026, show how it differs (#21):

- The HTML of a main menu item is the `description` attribute of the module `<item>`, with a resource `material_type="contentmodule"` and an empty `href`. The Common Cartridge export has no description anywhere.
- Topics are `content` resources with backslash paths (`content\\week-1\\page.html`); links to tools are `contentlink` resources.
- Quizzes are D2L's own format (`quiz_d2l_<id>.xml`), not QTI.
- The package holds the course files only when the export option "include course files" is on. With it, the native zip of that course was 164 MB against 78 MB for the Common Cartridge, because it carries the whole course file area; the size says something about that course, not about the format.

This ADR is based on these exports and on the BSO code (`src/native-packer.ts`); no external documentation of the D2L format was consulted. The format is not documented by D2L as far as is known here, so everything below is reverse-engineered.

### Criteria

- The text and images of a main menu item arrive in Brightspace.
- Little to reverse-engineer and to keep up with when D2L changes the format.
- One source of truth: the same Markdown gives both packages (ADR 021, parity 8.1).
- Quizzes keep working.

## Considered options

### Option A — Only the Common Cartridge

**Pros:** one standard format; no reverse-engineering.

**Cons:** the module descriptions cannot arrive. The course author has to add them by hand in Brightspace.

### Option B — A native package next to the Common Cartridge (chosen for the spike)

`bso pack --format brightspace` writes `<name>.v<version>.d2l.zip` next to the `.imscc`: modules with their lead page as description, the lessons and reader PDFs as topics, and the course files. The `.imscc` stays the way to bring in quizzes.

**Pros:** the module descriptions arrive; the Common Cartridge path is unchanged; the spike is small (one module, no change to the build).

**Cons:** two packages and two imports; the D2L XML is undocumented and may change; quizzes are not in the native package until the D2L quiz format is generated.

### Option C — Only the native package

**Pros:** one import, and everything Brightspace-specific.

**Cons:** needs the D2L quiz format and more reverse-engineering; loses the standard that other LMSs can import; the largest risk.

## Decision

Not decided. **Recommendation: option B**, as an experimental second package, and decide after one import test.

What the import has to show, in a sandbox course:

1. The package imports at all (no error).
2. The module descriptions are visible on the main menu items, with their images.
3. The topics are in the right modules, in the right order, and open.
4. What happens next to an earlier Common Cartridge import: do items double, and is the import additive?

If 1 and 2 fail, option B stops and the module description stays a manual step (option A), recorded here. If they work, the next steps are: the D2L quiz format (or keep importing quizzes from the `.imscc`), the order of topics, the course image, and a decision whether the native package becomes a documented feature.

## Consequences

**If option B is kept**

- Positive: main menu items get their text and images without manual work.
- Negative: a second format to keep working; the quizzes still come from the `.imscc`; a change in D2L's format can break the package without a warning.
- The manual describes the package as experimental and says what is not in it.

**Tests.** The unit tests check the package that BSO writes (manifest shape, escaping, paths, which files are in it). They cannot show that Brightspace accepts it: only the import can. Until that is done the format is a hypothesis.
