"""CLI entry point voor de APA Reference Checker (ARC)."""
import sys
import argparse
import json
from .checker import check_citations


def main():
    parser = argparse.ArgumentParser(
        prog="apa-reference-checker",
        description="Controleert Markdown-documenten op APA-referentieregels.",
    )
    parser.add_argument("bestand", nargs="?", help="Pad naar het Markdown-bestand")
    parser.add_argument("--stdin", action="store_true", help="Lees van stdin")
    parser.add_argument("--check-links", action="store_true", help="Controleer URLs")
    parser.add_argument("--check-claims", action="store_true", help="Signaleer ongefundeerde beweringen")
    parser.add_argument("--json", action="store_true", help="JSON-uitvoer")
    args = parser.parse_args()

    if not args.bestand and not args.stdin:
        parser.print_help()
        sys.exit(3)

    if args.stdin:
        content = sys.stdin.read()
    else:
        try:
            with open(args.bestand, encoding="utf-8") as f:
                content = f.read()
        except FileNotFoundError:
            print(f"Fout: bestand niet gevonden: {args.bestand}", file=sys.stderr)
            sys.exit(2)
        except OSError as e:
            print(f"Fout: kan bestand niet lezen: {args.bestand}: {e}", file=sys.stderr)
            sys.exit(2)

    result = check_citations(content, check_links=args.check_links, check_claims=args.check_claims)

    if args.json:
        import dataclasses
        data = dataclasses.asdict(result)
        data["grade"] = result.grade
        print(json.dumps(data, indent=2))
    else:
        # Score prominent bovenaan (req. 12.3)
        if result.grade:
            print(f"Score: {result.grade}\n")

        if not result.has_sources_section:
            print("Geen ## Bronnen-sectie gevonden.")
        elif result.ok:
            print(
                f"✓ Alle {result.total_sources} bronnen"
                " zijn geciteerd."
            )
        else:
            print(
                f"✗ {len(result.missing_citations)}"
                " bron(nen) zonder inline verwijzing:\n"
            )
            for mc in result.missing_citations:
                print(f"  Ontbreekt: {mc.expected_ref}")
                print(f"  Bron:      {mc.source.full_text}\n")
        if result.orphaned_refs:
            print(
                f"⚠ {len(result.orphaned_refs)}"
                " zwevende inline verwijzing(en):"
            )
            for o in result.orphaned_refs:
                print(
                    f"  Regel {o.ref.line_number}:"
                    f" ({o.ref.author}, {o.ref.year})"
                )
        if result.unfounded_claims:
            print(
                f"\n⚠ {len(result.unfounded_claims)} "
                "mogelijke ongefundeerde bewering(en):"
            )
            for c in result.unfounded_claims:
                print(f"  Regel {c.line_number}: {c.sentence}")

        if result.bare_urls:
            print(
                f"\n⚠ {len(result.bare_urls)}"
                " losse URL('s) in de tekst:"
            )
            for bu in result.bare_urls:
                code = (
                    bu.code.value
                    if hasattr(bu.code, "value")
                    else bu.code
                )
                severity_label = (
                    "waarschuwing"
                    if bu.severity == "warning"
                    else "info"
                )
                print(
                    f"  Regel {bu.line_number}: {bu.url}"
                    f" [{code}] ({severity_label})"
                )

        if result.source_section_issues:
            print(
                f"\n⚠ {len(result.source_section_issues)}"
                " probleem/problemen in de Bronsectie:"
            )
            for issue in result.source_section_issues:
                code = (
                    issue.code.value
                    if hasattr(issue.code, "value")
                    else issue.code
                )
                print(
                    f'  Regel {issue.line_number}:'
                    f' "{issue.line_text}"'
                    f" [{code}]"
                )

        if result.dead_links:
            print(
                f"\n✗ {len(result.dead_links)}"
                " dode link(s):"
            )
            for dl in result.dead_links:
                code = (
                    dl.code.value
                    if hasattr(dl.code, "value")
                    else dl.code
                )
                print(
                    f"  {dl.url}"
                    f" \u2192 {dl.status}"
                    f" [{code}]"
                )

    sys.exit(0 if result.ok else 1)


if __name__ == "__main__":
    main()
