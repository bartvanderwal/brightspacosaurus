"""Tests voor parser.py — unit-tests en property-tests."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from apa_reference_checker.parser import (
    parse_sources,
    parse_inline_refs,
    find_sources_section,
)


# ---------------------------------------------------------------------------
# Unit-tests
# ---------------------------------------------------------------------------

def test_find_sources_section_found():
    md = "# Titel\n\nTekst.\n\n## Bronnen\n\n- Auteur. (2026). *Titel*.\n"
    assert find_sources_section(md) == 4


def test_find_sources_section_not_found():
    md = "# Titel\n\nGeen bronnen hier.\n"
    assert find_sources_section(md) is None


def test_parse_sources_enkelvoudige_auteur():
    md = "## Bronnen\n\n- Mavin, A. (2009). *EARS*. https://example.com\n"
    sources = parse_sources(md)
    assert len(sources) == 1
    assert sources[0].author == "Mavin, A"
    assert sources[0].year == "2009"


def test_parse_sources_organisatie_als_auteur():
    md = "## Bronnen\n\n- IMS Global. (z.d.). *QTI Spec*. https://example.com\n"
    sources = parse_sources(md)
    assert len(sources) == 1
    assert sources[0].author == "IMS Global"
    assert sources[0].year == "z.d."


def test_parse_sources_zd_jaar():
    md = "## Bronnen\n\n- Unified. (z.d.). *unified*. https://unifiedjs.com\n"
    sources = parse_sources(md)
    assert sources[0].year == "z.d."


def test_parse_sources_sub_bullets_worden_overgeslagen():
    md = (
        "## Bronnen\n\n"
        "- Auteur. (2026). *Titel*. https://example.com\n"
        "  - Dit is een sub-bullet met toelichting.\n"
        "- Tweede. (2025). *Tweede*. https://example2.com\n"
    )
    sources = parse_sources(md)
    assert len(sources) == 2


def test_parse_sources_geen_bronsectie():
    md = "# Titel\n\nGeen bronnen.\n"
    assert parse_sources(md) == []


def test_parse_sources_lege_bronsectie():
    md = "## Bronnen\n\n"
    assert parse_sources(md) == []


def test_parse_sources_url_wordt_geextraheerd():
    md = "## Bronnen\n\n- Auteur. (2026). *Titel*. https://example.com/pad\n"
    sources = parse_sources(md)
    assert sources[0].url == "https://example.com/pad"


def test_parse_inline_refs_basis():
    md = "Zie (Auteur, 2026) voor meer info.\n\n## Bronnen\n"
    refs = parse_inline_refs(md, sources_start_line=2)
    assert len(refs) == 1
    assert refs[0].author == "Auteur"
    assert refs[0].year == "2026"


def test_parse_inline_refs_zd():
    md = "Zoals beschreven door (Unified, z.d.) in de documentatie.\n\n## Bronnen\n"
    refs = parse_inline_refs(md, sources_start_line=2)
    assert any(r.author == "Unified" and r.year == "z.d." for r in refs)


def test_parse_inline_refs_buiten_bronsectie():
    """Verwijzingen IN de Bronsectie mogen niet worden meegeteld."""
    md = (
        "Tekst met (Auteur, 2026).\n\n"
        "## Bronnen\n\n"
        "- Auteur. (2026). *Titel*. Geraadpleegd van (Auteur, 2026).\n"
    )
    refs = parse_inline_refs(md, sources_start_line=2)
    # Alleen de verwijzing vóór de Bronsectie
    assert len(refs) == 1


# ---------------------------------------------------------------------------
# Property-tests (Eigenschap 1: Elke geldige APA-bronregel levert een Source op)
# Valideert: Requirements 1.1, 1.2, 1.3
# Feature: apa-citation-checker, Eigenschap 1
# ---------------------------------------------------------------------------

# Generator voor geldige auteursnamen (enkelvoudig of meerdere woorden)
_author_strategy = st.one_of(
    st.from_regex(r"[A-Z][a-z]+, [A-Z]\.", fullmatch=True),       # "Mavin, A."
    st.from_regex(r"[A-Z][a-z]+ [A-Z][a-z]+", fullmatch=True),   # "IMS Global"
    st.from_regex(r"[A-Z][a-z]+", fullmatch=True),                 # "Unified"
)

# Generator voor geldige jaren
_year_strategy = st.one_of(
    st.just("z.d."),
    st.integers(min_value=2000, max_value=2030).map(str),
)


@given(author=_author_strategy, year=_year_strategy)
@settings(max_examples=50)
def test_eigenschap_1_geldige_bronregel_levert_source_op(author, year):
    """
    Eigenschap 1: Elke geldige APA-bronregel levert precies één Source op
    met de juiste author en year.
    """
    # Feature: apa-citation-checker, Eigenschap 1: Elke geldige APA-bronregel levert een Source op
    md = f"## Bronnen\n\n- {author}. ({year}). *Titel*. https://example.com\n"
    sources = parse_sources(md)
    assert len(sources) == 1
    assert sources[0].year == year


# ---------------------------------------------------------------------------
# Property-test (Eigenschap 6: Sub-bullets tellen niet als bronnen)
# Valideert: Requirement 1.6
# Feature: apa-citation-checker, Eigenschap 6
# ---------------------------------------------------------------------------

@given(
    n_sources=st.integers(min_value=1, max_value=5),
    n_subbullets=st.integers(min_value=1, max_value=3),
)
@settings(max_examples=50)
def test_eigenschap_6_sub_bullets_tellen_niet(n_sources, n_subbullets):
    """
    Eigenschap 6: Sub-bullets in de Bronsectie worden niet als aparte bronnen geteld.
    """
    # Feature: apa-citation-checker, Eigenschap 6: Sub-bullets tellen niet als bronnen
    lines = ["## Bronnen", ""]
    for i in range(n_sources):
        lines.append(f"- Auteur{i}. (2026). *Titel {i}*. https://example.com")
        for j in range(n_subbullets):
            lines.append(f"  - Sub-bullet {j} van bron {i}.")
    md = "\n".join(lines) + "\n"
    sources = parse_sources(md)
    assert len(sources) == n_sources
