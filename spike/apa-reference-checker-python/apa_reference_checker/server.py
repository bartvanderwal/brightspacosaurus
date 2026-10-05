"""FastMCP MCP-server voor de APA Reference Checker (ARC)."""
from fastmcp import FastMCP
from .checker import check_citations
from .models import CheckResult
import dataclasses, json

mcp = FastMCP("apa-reference-checker")


def _result_to_dict(result: CheckResult) -> dict:
    d = dataclasses.asdict(result)
    d["ok"] = result.ok  # @property wordt niet meegenomen door dataclasses.asdict
    d["grade"] = result.grade  # expliciet opnemen (req. 12.2)
    return d


@mcp.tool()
def apa_check_citations(
    content: str | None = None,
    file_path: str | None = None,
    check_links: bool = False,
    check_claims: bool = False,
) -> dict:
    """
    Controleert een Markdown-document op APA-citeerregels.

    Geef 'content' mee als Markdown-tekst, of 'file_path' als pad naar een bestand.
    Als beide worden meegegeven, wordt 'content' gebruikt.

    Geeft terug:
    - missing_citations: bronnen zonder inline verwijzing (fout)
    - orphaned_refs: inline verwijzingen zonder bron (waarschuwing)
    - has_sources_section: of het document een ## Bronnen-sectie heeft
    - total_sources / cited_sources: tellingen
    - ok: True als alle bronnen geciteerd zijn
    """
    if content is None and file_path is None:
        return {"error": "Geef 'content' of 'file_path' mee."}

    if content is None:
        try:
            with open(file_path, encoding="utf-8") as f:
                content = f.read()
        except FileNotFoundError:
            return {"error": f"Bestand niet gevonden: {file_path}"}
        except OSError as e:
            return {"error": f"Kan bestand niet lezen: {file_path}: {e}"}

    result = check_citations(
        content,
        check_links=check_links,
        check_claims=check_claims,
    )
    return _result_to_dict(result)


def main():
    mcp.run()


if __name__ == "__main__":
    main()
