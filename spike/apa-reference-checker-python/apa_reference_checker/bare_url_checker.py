"""Detectie van losse URLs in de documenttekst buiten de Bronsectie."""
import re
from urllib.parse import urlparse

from .models import BareUrl


# Patroon dat alle URLs matcht (http en https)
_URL_PATTERN = re.compile(r'https?://[^\s\)\]>,"\']+')

# Patroon voor Markdown-links: [tekst](url)
_MARKDOWN_LINK_PATTERN = re.compile(r'\[([^\]]*)\]\(([^)]+)\)')

# Patroon voor URLs tussen haakjes: (url) of (tekst url) of (Auteur, jaar, url)
_PARENTHESIZED_PATTERN = re.compile(r'\([^)]*https?://[^\s)]+[^)]*\)')


def _is_domain_only(url: str) -> bool:
    """
    Geeft True als de URL uitsluitend een domeinnaam is zonder pad
    (bijv. https://example.com of https://example.com/).
    """
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    return path == ""


def _collect_source_urls(lines: list[str], sources_start_line: int) -> set[str]:
    """Verzamelt alle URLs die voorkomen in de Bronsectie."""
    source_urls: set[str] = set()
    for line in lines[sources_start_line - 1:]:
        for match in _URL_PATTERN.finditer(line):
            # Verwijder eventuele afsluitende leestekens die geen deel zijn van de URL
            url = match.group(0).rstrip(".,;:!?")
            source_urls.add(url)
    return source_urls


def find_bare_urls(markdown: str, sources_start_line: int) -> list[BareUrl]:
    """
    Vindt losse URLs in de documenttekst buiten de Bronsectie.

    Een URL is "los" als hij:
    - niet voorkomt als [tekst](url) (Markdown-link),
    - niet tussen haakjes staat,
    - niet in de Bronsectie staat (req. 10.4).

    Domein-only URLs (bijv. https://example.com) krijgen severity 'info' (req. 10.2).
    URLs met een pad (bijv. https://example.com/pagina) krijgen severity 'warning' (req. 10.3).
    """
    lines = markdown.splitlines()
    body_lines = lines[: sources_start_line - 1] if sources_start_line > 1 else lines

    # Verzamel URLs die al in de Bronsectie staan (req. 10.4)
    source_urls = _collect_source_urls(lines, sources_start_line)

    bare_urls: list[BareUrl] = []

    for line_index, line in enumerate(body_lines, start=1):
        # Bepaal welke posities in de regel worden afgedekt door Markdown-links
        # of door haakjes-constructies — die URLs zijn niet "los"
        covered_spans: list[tuple[int, int]] = []

        for m in _MARKDOWN_LINK_PATTERN.finditer(line):
            covered_spans.append((m.start(), m.end()))

        for m in _PARENTHESIZED_PATTERN.finditer(line):
            covered_spans.append((m.start(), m.end()))

        # Zoek alle URLs op deze regel
        for url_match in _URL_PATTERN.finditer(line):
            url = url_match.group(0).rstrip(".,;:!?")
            url_start = url_match.start()
            url_end = url_match.start() + len(url)

            # Sla over als de URL al in de Bronsectie staat (req. 10.4)
            if url in source_urls:
                continue

            # Sla over als de URL valt binnen een gedekte span
            in_covered = any(
                span_start <= url_start and url_end <= span_end
                for span_start, span_end in covered_spans
            )
            if in_covered:
                continue

            # Bepaal severity op basis van aanwezigheid van een pad (req. 10.2, 10.3)
            severity = "info" if _is_domain_only(url) else "warning"
            bare_urls.append(BareUrl(url=url, line_number=line_index, severity=severity))

    return bare_urls
