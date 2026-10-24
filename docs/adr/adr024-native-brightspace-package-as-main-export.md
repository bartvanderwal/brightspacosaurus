# ADR 024 — The native Brightspace package as the main export format

## Status

Proposed. It becomes accepted when an import of the spike package into a Brightspace sandbox shows the module descriptions (see Decision).

## Context

BSO exports an IMS Common Cartridge (`.imscc`). A Common Cartridge import does not carry the text and images of a main menu item (a module's description), and Brightspace did not read the manifest metadata that was tried for it (#13). Brightspace's own export, a `.zip` with D2L XML, does carry them, as a `description` on the module. A spike (`bso pack --format brightspace`) builds such a package. The research behind it, the structure of the reference exports and the open questions, is in issue #21; this ADR records the decision only.

### Criteria

- The text and images of a main menu item arrive in Brightspace.
- The main export is the one that carries the most of what a course needs, quizzes included.
- One source of truth: the same Markdown gives every package (ADR 021, parity 8.1).
- The risk of an undocumented format is limited and checked.

## Considered options

### Option A — Stay with the Common Cartridge

**Pros:** a standard format that other learning systems can also import; nothing to reverse-engineer.

**Cons:** module descriptions cannot arrive, so the course author adds them by hand in Brightspace.

### Option B — The native package becomes the main format; the Common Cartridge stays as the portable one

BSO writes the native package as the main export, with everything in it: module descriptions, topics, files and quizzes (in D2L's quiz format). The Common Cartridge stays for portability.

**Pros:** everything Brightspace-specific arrives in one import, including the text and images of main menu items; one main path for the course owner.

**Cons:** the D2L format is not documented by D2L, so it is reverse-engineered and may change; BSO has to keep two packers working.

### Option C — Both formats as equals

**Pros:** no choice for the course owner to make.

**Cons:** two imports and two behaviours to explain, with no clear main path.

## Decision

**Option B, on one condition: the import works.** The spike package (modules, descriptions, topics, files) is imported into a Brightspace sandbox and must show:

1. the package imports without an error;
2. the module descriptions on the main menu items, with their images;
3. the topics in the right modules and order, and they open.

If it does, the native package becomes the main export and the next work is the D2L quiz format, the order of topics and the course image; the Common Cartridge stays. If it does not, BSO stays with the Common Cartridge (option A), and the reason is recorded here.

Until the import is done, the package is described as experimental in the manual, and the unit tests only check what BSO writes: they cannot show that Brightspace accepts it.

## Consequences

**If option B is accepted**

- Positive: main menu items, files and quizzes arrive through one import.
- Negative: a second, undocumented format to keep working; a change by D2L can break the package without a warning, so the import test belongs in the release check.
- The Common Cartridge keeps its place for other systems.
