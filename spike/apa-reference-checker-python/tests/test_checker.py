"""Tests voor checker.py — unit-tests en property-tests."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from apa_reference_checker.checker import check_citations, _authors_match


# ---------------------------------------------------------------------------
# Unit-tests voor _authors_match
# ---------------------------------------------------------------------------

def test_authors_match_exact():
    assert _authors_match("Unified", "Unified")

def test_authors_match_case_insensitive():
    assert _authors_match("unified", "Unified")
    assert _authors_match("UNIFIED", "unified")

def test_authors_match_prefix():
    assert _authors_match("D2L", "D2L")

def test_authors_match_eerste_woord():
    assert _authors_match("Docusaurus", "Docusaurus")

def test_authors_no_match():
    assert not _authors_match("Unified", "Docusaurus")


# ---------------------------------------------------------------------------
# Unit-tests voor check_citations
# ---------------------------------------------------------------------------

def _doc(body: str, sources: str) -> str:
    return f"{body}\n\n## Bronnen\n\n{sources}"


def test_volledig_geciteerd():
    md = _doc(
        "Zie (Unified, z.d.) voor meer info.",
        "- Unified. (z.d.). *unified*. https://unifiedjs.com\n",
    )
    result = check_citations(md)
    assert result.ok
    assert result.missing_citations == []
    assert result.total_sources == 1
    assert result.cited_sources == 1


def test_ontbrekende_inline_verwijzing():
    md = _doc(
        "Geen verwijzing hier.",
        "- Unified. (z.d.). *unified*. https://unifiedjs.com\n",
    )
    result = check_citations(md)
    assert not result.ok
    assert len(result.missing_citations) == 1
    assert result.missing_citations[0].expected_ref == "(Unified, z.d.)"


def test_zwevende_inline_verwijzing():
    md = _doc(
        "Zie (Onbekend, 2026) voor meer info.",
        "- Unified. (z.d.). *unified*. https://unifiedjs.com\n",
    )
    result = check_citations(md)
    assert len(result.orphaned_refs) >= 1


def test_geen_bronsectie():
    md = "# Titel\n\nGeen bronnen hier.\n"
    result = check_citations(md)
    assert not result.has_sources_section
    assert result.missing_citations == []


def test_meerdere_bronnen_deels_geciteerd():
    md = _doc(
        "Zie (Auteur1, 2026) maar niet auteur2.",
        "- Auteur1. (2026). *Titel 1*.\n- Auteur2. (2025). *Titel 2*.\n",
    )
    result = check_citations(md)
    assert result.cited_sources == 1
    assert len(result.missing_citations) == 1
    assert result.missing_citations[0].source.author == "Auteur2"


# ---------------------------------------------------------------------------
# Property-tests
# ---------------------------------------------------------------------------

# Gedeelde generators
_author_st = st.from_regex(r"[A-Z][a-z]{2,10}", fullmatch=True)
_year_st = st.one_of(
    st.just("z.d."),
    st.integers(min_value=2000, max_value=2030).map(str),
)


def _make_doc(authors_years: list[tuple[str, str]], cited_indices: set[int]) -> str:
    """Bouw een Markdown-document met bronnen en inline verwijzingen."""
    body_parts = []
    for i, (author, year) in enumerate(authors_years):
        if i in cited_indices:
            body_parts.append(f"Zie ({author}, {year}) voor meer info.")
    body = " ".join(body_parts) if body_parts else "Geen verwijzingen."

    source_lines = "\n".join(
        f"- {author}. ({year}). *Titel*. https://example.com"
        for author, year in authors_years
    )
    return f"{body}\n\n## Bronnen\n\n{source_lines}\n"


@given(
    authors_years=st.lists(
        st.tuples(_author_st, _year_st),
        min_size=1,
        max_size=5,
        unique_by=lambda x: (x[0].lower(), x[1].lower()),
    )
)
@settings(max_examples=50)
def test_eigenschap_2_geciteerde_bronnen_altijd_herkend(authors_years):
    """
    Eigenschap 2: Als elke bron een inline verwijzing heeft, is missing_citations leeg.
    Valideert: Requirements 2.1, 2.2, 3.2
    """
    # Feature: apa-citation-checker, Eigenschap 2: Geciteerde bronnen worden altijd herkend
    all_indices = set(range(len(authors_years)))
    md = _make_doc(authors_years, all_indices)
    result = check_citations(md)
    assert result.missing_citations == [], (
        f"Verwacht geen ontbrekende citaten, maar kreeg: "
        f"{[m.expected_ref for m in result.missing_citations]}"
    )


@given(
    authors_years=st.lists(
        st.tuples(_author_st, _year_st),
        min_size=2,
        max_size=5,
        unique_by=lambda x: (x[0].lower(), x[1].lower()),
    ),
    missing_count=st.integers(min_value=1, max_value=3),
)
@settings(max_examples=50)
def test_eigenschap_3_ontbrekende_verwijzingen_gerapporteerd(authors_years, missing_count):
    """
    Eigenschap 3: Bronnen zonder inline verwijzing staan altijd in missing_citations.
    Valideert: Requirements 2.1, 3.1, 3.3
    """
    # Feature: apa-citation-checker, Eigenschap 3: Ontbrekende inline verwijzingen worden altijd gerapporteerd
    missing_count = min(missing_count, len(authors_years))
    cited_indices = set(range(len(authors_years) - missing_count))
    md = _make_doc(authors_years, cited_indices)
    result = check_citations(md)
    assert len(result.missing_citations) == missing_count, (
        f"Verwacht {missing_count} ontbrekende citaten, maar kreeg "
        f"{len(result.missing_citations)}"
    )


@given(
    author=_author_st,
    year=_year_st,
    variant=st.sampled_from(["lower", "upper", "title"]),
)
@settings(max_examples=50)
def test_eigenschap_4_hoofdletterongevoelig(author, year, variant):
    """
    Eigenschap 4: Matching is hoofdletterongevoelig voor auteursnamen.
    Valideert: Requirement 2.4
    """
    # Feature: apa-citation-checker, Eigenschap 4: Hoofdletterongevoelige matching
    if variant == "lower":
        ref_author = author.lower()
    elif variant == "upper":
        ref_author = author.upper()
    else:
        ref_author = author.title()

    md = (
        f"Zie ({ref_author}, {year}) voor meer info.\n\n"
        f"## Bronnen\n\n"
        f"- {author}. ({year}). *Titel*. https://example.com\n"
    )
    result = check_citations(md)
    assert result.missing_citations == [], (
        f"Verwacht geen ontbrekende citaten bij variant '{variant}' "
        f"van auteur '{author}'"
    )


@given(
    content=st.one_of(
        st.just(""),
        st.just("# Titel\n\nGeen bronnen."),
        st.just("## Bronnen\n\n"),
        st.text(max_size=100),
    )
)
@settings(max_examples=50)
def test_eigenschap_5_robuust_bij_ontbrekende_bronsectie(content):
    """
    Eigenschap 5: check_citations() gooit nooit een uitzondering, ook niet bij
    ontbrekende of lege Bronsectie.
    Valideert: Requirements 1.4, 1.5, 6.1, 6.2
    """
    # Feature: apa-citation-checker, Eigenschap 5: Robuustheid bij ontbrekende of lege Bronsectie
    try:
        result = check_citations(content)
        assert result.missing_citations is not None
    except Exception as e:
        raise AssertionError(f"check_citations() gooide een uitzondering: {e}")
