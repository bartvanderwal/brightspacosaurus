"""Claimcontrole: detecteert zinnen met feitsclaims zonder inline verwijzing."""
import re

from .models import UnfoundedClaim

# Patronen die duiden op een feitsclaim (req. 8.2)
_CLAIM_PATTERNS: list[str] = [
    r"blijkt",
    r"toont\s+aan",
    r"is\s+bewezen",
    r"onderzoek\s+wijst\s+uit",
    r"studies\s+tonen",
    r"aangetoond",
    r"bewezen\s+dat",
    r"uit\s+onderzoek\s+blijkt",
    r"wetenschappelijk\s+bewijs",
    r"het\s+onderzoek\s+toont",
]

_CLAIM_RE = re.compile(
    r"(?:" + "|".join(_CLAIM_PATTERNS) + r")",
    re.IGNORECASE,
)

# Inline verwijzingspatroon: (Auteur, jaar) of (Auteur, z.d.) etc.
_INLINE_REF_RE = re.compile(
    r"\([^,\n()]+,\s*(?:z\.d\.|n\.d\.|s\.d\.|\d{4}[a-z]?)\)",
    re.IGNORECASE,
)


def _split_sentences(text: str) -> list[str]:
    """
    Splitst tekst in zinnen op basis van punt, uitroepteken of vraagteken
    gevolgd door een spatie of einde van de tekst.
    Behoudt de scheidingstekens als onderdeel van de zin.
    """
    # Splits op zin-eindes maar houd de delimiter bij de zin
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def find_unfounded_claims(
    markdown: str,
    sources_start_line: int,
) -> list[UnfoundedClaim]:
    """
    Signaleert zinnen in de documenttekst die een feitelijke bewering bevatten
    zonder overeenkomende inline verwijzing in dezelfde of aangrenzende zin.

    Analyseert alleen tekst BUITEN de Bronsectie (voor sources_start_line).
    Geeft waarschuwingen terug, geen fouten (req. 8.3).

    Args:
        markdown: De volledige Markdown-tekst van het document.
        sources_start_line: Het regelnummer (1-gebaseerd) waar de Bronsectie
            begint. Regels vanaf dit nummer worden niet geanalyseerd.

    Returns:
        Lijst van UnfoundedClaim-objecten, elk met severity = "warning".
    """
    lines = markdown.splitlines()
    # Analyseer alleen tekst vóór de Bronsectie (req. 8.1)
    body_lines = lines[: sources_start_line - 1]

    # Sla codeblokken over
    body_text_lines = _strip_code_blocks(body_lines)

    claims: list[UnfoundedClaim] = []

    # Verwerk per alinea (samenhangende niet-lege regels) zodat aangrenzende
    # zinnen over regelgrenzen heen correct worden herkend.
    paragraphs = _group_into_paragraphs(body_text_lines)

    for para_lines in paragraphs:
        para_text = " ".join(line for _, line in para_lines)
        sentences = _split_sentences(para_text)

        # Bouw een mapping van zin-index → regelnummer (eerste regel van de
        # alinea als benadering; nauwkeuriger is niet nodig voor een warning).
        first_line_number = para_lines[0][0] if para_lines else 1

        for i, sentence in enumerate(sentences):
            if not _CLAIM_RE.search(sentence):
                continue

            # Controleer of er een inline verwijzing is in dezelfde of
            # aangrenzende zin (req. 8.2)
            window = _get_window(sentences, i)
            if _INLINE_REF_RE.search(window):
                continue

            # Bepaal het regelnummer: zoek de eerste regel in de alinea die
            # de zin (of een deel ervan) bevat.
            line_number = _find_line_number(sentence, para_lines, first_line_number)

            claims.append(
                UnfoundedClaim(
                    sentence=sentence,
                    line_number=line_number,
                    severity="warning",
                )
            )

    return claims


def _strip_code_blocks(lines: list[str]) -> list[tuple[int, str]]:
    """
    Geeft een lijst van (regelnummer, tekst)-tuples terug waarbij regels
    binnen fenced code blocks (``` of ~~~) worden vervangen door lege strings.
    Regelnummers zijn 1-gebaseerd.
    """
    result: list[tuple[int, str]] = []
    in_code_block = False
    fence_pattern = re.compile(r"^(```|~~~)")

    for i, line in enumerate(lines, start=1):
        if fence_pattern.match(line):
            in_code_block = not in_code_block
            result.append((i, ""))
        elif in_code_block:
            result.append((i, ""))
        else:
            result.append((i, line))

    return result


def _group_into_paragraphs(
    lines: list[tuple[int, str]],
) -> list[list[tuple[int, str]]]:
    """
    Groepeert aaneengesloten niet-lege regels in alinea's.
    Lege regels fungeren als scheidingsteken.
    """
    paragraphs: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []

    for line_no, text in lines:
        if text.strip():
            current.append((line_no, text.strip()))
        else:
            if current:
                paragraphs.append(current)
                current = []

    if current:
        paragraphs.append(current)

    return paragraphs


def _get_window(sentences: list[str], index: int) -> str:
    """
    Geeft de tekst terug van de zin op `index` plus de direct aangrenzende
    zinnen (vorige en volgende), samengevoegd als één string.
    """
    start = max(0, index - 1)
    end = min(len(sentences), index + 2)
    return " ".join(sentences[start:end])


def _find_line_number(
    sentence: str,
    para_lines: list[tuple[int, str]],
    fallback: int,
) -> int:
    """
    Zoekt het regelnummer van de eerste alinearegel die een fragment van de
    zin bevat. Geeft `fallback` terug als er geen match is.
    """
    # Gebruik de eerste ~30 tekens van de zin als zoekfragment
    fragment = sentence[:30].lower()
    for line_no, text in para_lines:
        if fragment in text.lower():
            return line_no
    return fallback
