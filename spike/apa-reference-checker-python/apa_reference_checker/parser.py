"""Parser voor Markdown-documenten: bronnen en inline verwijzingen."""
import re
from .models import Source, InlineRef

# Patroon voor een bronregel: - Auteur. (jaar). ...
# Auteursnaam kan een punt bevatten (bijv. "Mavin, A."), gevolgd door spatie + haakje
_SOURCE_PATTERN = re.compile(
    r"^-\s+(?P<author>.+?)\.\s+\((?P<year>[^)]+)\)\.",
    re.MULTILINE,
)

# Patroon voor een inline verwijzing: (Auteur, jaar) of (Auteur, z.d.)
# Jaar moet eruitzien als een jaartal of z.d./n.d./s.d.
_INLINE_REF_PATTERN = re.compile(
    r"\((?P<author>[^,\n()]+),\s*(?P<year>(?:z\.d\.|n\.d\.|s\.d\.|\d{4}[a-z]?))\)",
)

# Patroon voor een URL in een bronregel
_URL_PATTERN = re.compile(r"https?://\S+")


def find_sources_section(markdown: str) -> int | None:
    """Geeft het regelnummer (0-based) van de ## Bronnen-heading terug, of None."""
    for i, line in enumerate(markdown.splitlines()):
        if re.match(r"^##\s+Bronnen\s*$", line):
            return i
    return None


def _normalize_year(year: str) -> str:
    """
    Normaliseert een jaar-string voor vergelijking.
    '2026, maart' → '2026', 'z.d.' → 'z.d.', '2026' → '2026'.
    Bronnen kunnen een maandaanduiding bevatten (bijv. '2026, maart'),
    maar inline verwijzingen gebruiken alleen het jaar.
    """
    year = year.strip()
    if "," in year:
        # Neem alleen het deel vóór de komma (het jaar)
        return year.split(",")[0].strip()
    return year


def parse_sources(markdown: str) -> list[Source]:
    """
    Extraheert bronnen uit de ## Bronnen-sectie.
    Slaat sub-bullets (inspringende regels) over.
    Geeft lege lijst terug bij ontbrekende of lege Bronsectie.
    """
    sources_line = find_sources_section(markdown)
    if sources_line is None:
        return []

    lines = markdown.splitlines()
    # Verzamel regels van de Bronsectie tot de volgende heading van gelijk/hoger niveau
    section_lines = []
    for line in lines[sources_line + 1:]:
        if re.match(r"^#{1,2}\s", line):
            break
        section_lines.append(line)

    sources = []
    for line in section_lines:
        # Sla sub-bullets over (beginnen met spaties/tabs)
        if re.match(r"^\s+", line):
            continue
        m = _SOURCE_PATTERN.match(line)
        if m:
            url_match = _URL_PATTERN.search(line)
            sources.append(Source(
                author=m.group("author").strip(),
                year=m.group("year").strip(),
                full_text=line.strip(),
                url=url_match.group(0) if url_match else None,
            ))
    return sources


def parse_inline_refs(markdown: str, sources_start_line: int) -> list[InlineRef]:
    """
    Extraheert inline verwijzingen uit de documenttekst BUITEN de Bronsectie.
    sources_start_line: regelnummer waar de Bronsectie begint (exclusief).
    """
    lines = markdown.splitlines()
    text_before_sources = "\n".join(lines[:sources_start_line])

    refs = []
    for line_offset, line in enumerate(text_before_sources.splitlines()):
        for m in _INLINE_REF_PATTERN.finditer(line):
            refs.append(InlineRef(
                author=m.group("author").strip(),
                year=m.group("year").strip(),
                line_number=line_offset + 1,
            ))
    return refs
