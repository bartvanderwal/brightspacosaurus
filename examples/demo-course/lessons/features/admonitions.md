---
sidebar_position: 6
---

# Admonitions

An admonition is a block that stands out from the running text, with a visible start and a visible end. Use it for a remark, a tip, something that is easy to miss, a warning, or content that a learner may skip. The block looks the same in Brightspace and in the preview, and it does not rely on colour alone: every type has its own label, icon and border.

## The six types

> [!NOTE]
> A note adds information that is useful but not required.

> [!TIP]
> A tip shows a quicker or easier way to do something.

> [!IMPORTANT]
> Important content is a rule or a requirement that is easy to miss.

> [!WARNING]
> A warning tells the learner what can go wrong.

> [!CAUTION]
> A caution is for the risk of lost work or lost data.

> [!OPTIONAL]
> Optional content may be skipped: an extra assignment or extra depth.

## A custom title and more than one paragraph

> [!TIP] Run the lint before you build
> `bso lint` finds most mistakes in a few seconds.
>
> The build takes longer, so lint first.

<details>
<summary>How to set up admonitions</summary>

Admonitions need no setup. Write a block quote whose first line is `[!TYPE]`, with `TYPE` one of `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION` or `OPTIONAL`, in any letter case. Text after the marker on the same line is a custom title.

```md
> [!IMPORTANT] Hand in on time
> The deadline is Friday.
```

The marker is the alert syntax of GitHub and GitLab, so a viewer without support shows a normal quote. `OPTIONAL` is a BSO addition.

To change the label of a type, add this to the course configuration. The language of the other labels follows `diagrams.locale`.

```json
{
  "admonitions": {
    "labels": { "optional": "Extra" }
  }
}
```

`bso lint` warns about a mistyped marker such as `[!OPTIONL]`, which would otherwise show as a plain quote, and about a block without content.

</details>
