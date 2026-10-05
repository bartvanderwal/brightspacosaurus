"""Kernlogica: koppelt parser aan rapport."""
import asyncio

from .bare_url_checker import find_bare_urls
from .claim_checker import find_unfounded_claims
from .grader import GradingConfig, calculate_grade
from .link_checker import check_links as _async_check_links
from .models import (
    CheckResult,
    DeadLink,
    ErrorCode,
    MissingCitation,
    OrphanedRef,
    SourceSectionIssue,
    UnfoundedClaim,
)
from .parser import parse_sources, parse_inline_refs, find_sources_section, _normalize_year


def _authors_match(ref_author: str, source_author: str) -> bool:
    """
    Controleert of een inline-verwijzingsauteur overeenkomt met een bronauteur.
    Strategieën:
    1. Exacte match (hoofdletterongevoelig)
    2. Prefix-match (bronauteur begint met ref-auteur)
    3. Eerste-woord-match (eerste woord van bronauteur == ref-auteur)
    4. Et al.-match: ref "Gebremedhin et al." matcht bron "Gebremedhin, A., et al."
       → vergelijk alleen de achternaam (deel vóór eerste komma of spatie)
    """
    a = ref_author.lower().strip()
    b = source_author.lower().strip()

    # Verwijder "et al." suffix voor vergelijking
    a_base = a.removesuffix(" et al.").removesuffix(" et al").strip()
    b_base = b

    # Als de bron "et al." bevat, neem alleen de achternaam
    if "et al" in b:
        # "Gebremedhin, A., et al." → "gebremedhin"
        b_base = b.split(",")[0].strip()

    if a == b:
        return True
    if a_base == b_base:
        return True
    if b.startswith(a):
        return True
    if b.split()[0] == a:
        return True
    # Achternaam-match voor et al. gevallen
    if a_base == b.split(",")[0].strip():
        return True
    return False


def _check_source_section_purity(
    lines: list[str], sources_line: int
) -> list[SourceSectionIssue]:
    """
    Controleert of de Bronsectie uitsluitend bronvermeldingen bevat.
    Rapporteert sub-bullets en niet-bronregels als waarschuwing.
    """
    import re
    from .parser import _SOURCE_PATTERN

    issues: list[SourceSectionIssue] = []
    section_lines = lines[sources_line + 1:]

    for offset, line in enumerate(section_lines):
        # Stop bij volgende heading van gelijk/hoger niveau
        if re.match(r"^#{1,2}\s", line):
            break
        # Lege regels zijn OK
        if line.strip() == "":
            continue
        # Sub-bullet (inspringende tekst)
        if re.match(r"^\s+", line):
            issues.append(SourceSectionIssue(
                line_number=sources_line + 1 + offset + 1,
                line_text=line.rstrip(),
                code=ErrorCode.ARC_008,
            ))
        # Niet-bronregel (geen match met bronpatroon)
        elif not _SOURCE_PATTERN.match(line):
            issues.append(SourceSectionIssue(
                line_number=sources_line + 1 + offset + 1,
                line_text=line.rstrip(),
                code=ErrorCode.ARC_009,
            ))

    return issues


def check_citations(
    markdown: str,
    check_links: bool = False,
    check_claims: bool = False,
    grading_config: GradingConfig | None = None,
) -> CheckResult:
    """
    Voert de volledige APA-citeercontrole uit op een Markdown-document.
    Geeft een CheckResult terug met ontbrekende citaten en zwevende verwijzingen.
    """
    sources_line = find_sources_section(markdown)
    sources = parse_sources(markdown)
    lines = markdown.splitlines()

    if sources_line is None:
        body_end = len(lines) + 1
        bare_urls = find_bare_urls(markdown, body_end)
        unfounded_claims: list[UnfoundedClaim] = []
        if check_claims:
            unfounded_claims = find_unfounded_claims(markdown, body_end)
        # Bepaal of het document claims bevat (inline refs of
        # feitsclaim-patronen)
        has_claims = (
            len(parse_inline_refs(markdown, body_end)) > 0
            or len(unfounded_claims) > 0
        )
        warning_count = len(bare_urls) + len(unfounded_claims)
        grade = calculate_grade(
            has_sources_section=False,
            missing_count=0,
            dead_links_count=0,
            warning_count=warning_count,
            has_claims=has_claims,
            config=grading_config,
        )
        return CheckResult(
            has_sources_section=False,
            bare_urls=bare_urls,
            unfounded_claims=unfounded_claims,
            grade=grade,
        )

    inline_refs = parse_inline_refs(markdown, sources_line)

    # Bepaal welke bronnen geciteerd zijn
    cited = set()
    orphaned = []

    for ref in inline_refs:
        matched = False
        for i, source in enumerate(sources):
            # Normaliseer jaren: bron kan "2026, maart" zijn, inline is "2026"
            source_year = _normalize_year(source.year)
            ref_year = _normalize_year(ref.year)
            if (ref_year.lower() == source_year.lower()
                    and _authors_match(ref.author, source.author)):
                cited.add(i)
                matched = True
                break
        if not matched:
            orphaned.append(OrphanedRef(ref=ref))

    missing = [
        MissingCitation(
            source=source,
            expected_ref=f"({source.author}, {_normalize_year(source.year)})",
        )
        for i, source in enumerate(sources)
        if i not in cited
    ]

    bare_urls = find_bare_urls(markdown, sources_line)

    # Bronsectie-zuiverheidscheck (req. 11)
    source_section_issues = _check_source_section_purity(
        lines, sources_line
    )

    dead_links: list[DeadLink] = []
    if check_links:
        dead_links = asyncio.run(_async_check_links(sources))

    unfounded_claims = []
    if check_claims:
        unfounded_claims = find_unfounded_claims(markdown, sources_line)

    return CheckResult(
        missing_citations=missing,
        orphaned_refs=orphaned,
        dead_links=dead_links,
        bare_urls=bare_urls,
        unfounded_claims=unfounded_claims,
        source_section_issues=source_section_issues,
        has_sources_section=True,
        total_sources=len(sources),
        cited_sources=len(cited),
        grade=calculate_grade(
            has_sources_section=True,
            missing_count=len(missing),
            dead_links_count=len(dead_links),
            warning_count=(
                len(orphaned) + len(bare_urls)
                + len(unfounded_claims)
                + len(source_section_issues)
            ),
            has_claims=len(inline_refs) > 0,
            config=grading_config,
        ),
    )
