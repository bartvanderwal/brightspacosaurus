# ADR 021 — Convention over configuration and good defaults

## Status

Proposed

## Context

BSO is a generic tool: project-specific settings come from `brightspacosaurus.config.json`. That invites a setting for every choice. Course authors are teachers, not build engineers, so each setting is something they must find, understand and get right. AGENTS.md already states "Easy to use, hard to make" and "Do not add configuration for a choice BSO can make itself", but without a recorded rationale.

Convention over configuration is described as a design paradigm that reduces the number of decisions developers must make by establishing sensible defaults (Wikipedia contributors, n.d.). The same source says: "A developer only needs to specify unconventional aspects of the application." Its stated drawbacks are that it conflicts with "explicit is better than implicit", and that non-conventional behaviour becomes harder to implement (Wikipedia contributors, n.d.).

Atwood, quoting Rico Mariani (Microsoft IT Architect and long time blogger on MSDN), names the goal behind good defaults: "we want our customers to simply fall into winning practices by using our platform and frameworks." (Atwood, 2007). He adds that "a well-designed system makes it easy to do the right things and annoying (but not impossible) to do the wrong things." (Atwood, 2007).

### Criteria

- The default path gives a correct result without any configuration.
- Unconventional needs stay possible.
- The tool says what it did, so convention does not become magic.
- Fewer settings to document, test and support.

## Considered options

### Option A — A setting for every choice

**Pros:** explicit, nothing implicit.

**Cons:** every setting is a decision for the author, a combination to test, and a line in the manual. Wrong defaults hide behind configuration.

### Option B — Convention with sensible defaults, escape hatches where needed (chosen)

BSO picks the conventional behaviour and offers a setting only for a choice that BSO cannot make itself.

**Pros:** correct result with little effort; less to document and test.

**Cons:** conventions must be documented and discoverable; a wrong convention is harder to change later than a setting.

## Decision

We choose Option B.

1. **Default path first.** A command run without options does the right thing in context. `bso lint` follows the configuration of the current directory and says what it scanned.
2. **Settings only for choices BSO cannot make.** Before adding a setting, ask whether BSO can derive the choice from the source. If two reasonable syntaxes exist, support both instead of adding a setting to choose between them.
3. **No magic.** Output states which convention was applied, so an author can see why something happened.
4. **Pit of success.** The right way is the easiest way, and the wrong way is harder but not impossible (Atwood, 2007). Error messages name the fix.
5. **Convention is not tolerance.** Convention sets the default; it does not mean accepting malformed input. Strictness is governed by ADR 020: one canonical form per concept, deviations are errors.

## Consequences

**Positive**

- Authors get a working result with little configuration.
- A smaller configuration surface to document, validate and test.

**Negative**

- Conventions have to be documented in the manual, and kept discoverable.
- A convention that proves wrong is a behaviour change, not a setting change; it needs a version bump and a changelog entry.
- Explicit-over-implicit readers may find the defaults surprising; point 3 (no magic) mitigates this.

## References

Atwood, J. (2007, August 29). *Falling into the pit of success*. Coding Horror. <https://blog.codinghorror.com/falling-into-the-pit-of-success/>

Wikipedia contributors. (n.d.). *Convention over configuration*. Wikipedia. <https://en.wikipedia.org/wiki/Convention_over_configuration>
