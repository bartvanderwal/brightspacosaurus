# Lesson 3: Links, Includes and Export

**Manual test:** test internal links (#7/#8), external links, Markdown includes and content ordering.

{@include: [Learning goals](../../partials/learning-goals.md)}

Use the [FizzBuzz lesson](lesson-1-fizzbuzz.md) and the [test strategy lesson](lesson-2-test-strategy.md) to test internal topic links.

An external link to [Deno](https://deno.com/) must open in a new browser window.

The include above must be visible in the HTML export and produce the same content in the reader/PDF route. In the source, its target remains clickable in VS Code and Docusaurus.

| Scenario | Expected result |
| --- | --- |
| Internal `.md` link | Common Cartridge resource link to the HTML resource |
| External `https://` link | New browser window |
| `{@include: [label](path.md)}` | Included Markdown content |
