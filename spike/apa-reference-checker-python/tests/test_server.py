"""Unit-tests voor server.py — MCP-tool apa_check_citations."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from apa_reference_checker.server import apa_check_citations


# ---------------------------------------------------------------------------
# Req. 4.4: content heeft voorrang boven file_path
# ---------------------------------------------------------------------------

def test_content_heeft_voorrang_boven_file_path(tmp_path):
    """
    Als zowel content als file_path worden meegegeven, wordt content gebruikt
    en file_path genegeerd — ook als het bestand niet bestaat.
    Valideert: Requirement 4.4
    """
    markdown = (
        "Zie (Auteur, 2026) voor meer info.\n\n"
        "## Bronnen\n\n"
        "- Auteur. (2026). *Titel*. https://example.com\n"
    )
    # file_path verwijst naar een niet-bestaand bestand; als content voorrang
    # heeft, mag dit geen fout opleveren.
    niet_bestaand_pad = str(tmp_path / "bestaat_niet.md")

    result = apa_check_citations(content=markdown, file_path=niet_bestaand_pad)

    assert "error" not in result, (
        f"Verwacht geen fout bij meegeven van content én file_path, maar kreeg: "
        f"{result.get('error')}"
    )
    assert result["ok"] is True, (
        "Verwacht ok=True omdat de content volledig geciteerd is."
    )


def test_content_heeft_voorrang_boven_file_path_met_ander_bestand(tmp_path):
    """
    Als zowel content als file_path worden meegegeven, wordt de content gebruikt
    en niet de inhoud van het bestand.
    Valideert: Requirement 4.4
    """
    # Bestand bevat een document met ontbrekende verwijzing
    bestand = tmp_path / "test.md"
    bestand.write_text(
        "Geen verwijzing hier.\n\n"
        "## Bronnen\n\n"
        "- Auteur. (2026). *Titel*. https://example.com\n",
        encoding="utf-8",
    )

    # content bevat een volledig geciteerd document
    content_volledig = (
        "Zie (Auteur, 2026) voor meer info.\n\n"
        "## Bronnen\n\n"
        "- Auteur. (2026). *Titel*. https://example.com\n"
    )

    result = apa_check_citations(content=content_volledig, file_path=str(bestand))

    # Als content voorrang heeft, is het resultaat ok (geen ontbrekende citaten)
    assert result["ok"] is True, (
        "Verwacht ok=True omdat content (volledig geciteerd) voorrang heeft "
        "boven het bestand (ontbrekende verwijzing)."
    )
    assert result["missing_citations"] == [], (
        "Verwacht geen ontbrekende citaten omdat content wordt gebruikt, niet het bestand."
    )


# ---------------------------------------------------------------------------
# Req. 4.5: foutmelding bij ontbrekende content én file_path
# ---------------------------------------------------------------------------

def test_foutmelding_bij_geen_content_en_geen_file_path():
    """
    Als noch content noch file_path wordt meegegeven, geeft de tool een
    foutmelding terug die aangeeft dat minimaal één parameter vereist is.
    Valideert: Requirement 4.5
    """
    result = apa_check_citations()

    assert "error" in result, (
        "Verwacht een 'error'-sleutel in het resultaat bij ontbrekende parameters."
    )
    assert isinstance(result["error"], str), (
        "De foutmelding moet een string zijn."
    )
    assert len(result["error"]) > 0, (
        "De foutmelding mag niet leeg zijn."
    )


def test_foutmelding_bij_none_content_en_none_file_path():
    """
    Expliciete None-waarden voor beide parameters leveren ook een foutmelding op.
    Valideert: Requirement 4.5
    """
    result = apa_check_citations(content=None, file_path=None)

    assert "error" in result, (
        "Verwacht een 'error'-sleutel bij content=None en file_path=None."
    )


def test_foutmelding_bevat_beschrijvende_tekst():
    """
    De foutmelding bij ontbrekende parameters is beschrijvend genoeg om
    de gebruiker te informeren welke parameter(s) vereist zijn.
    Valideert: Requirement 4.5
    """
    result = apa_check_citations()

    error_msg = result.get("error", "")
    # De foutmelding moet verwijzen naar 'content' of 'file_path'
    assert "content" in error_msg or "file_path" in error_msg, (
        f"Verwacht dat de foutmelding 'content' of 'file_path' vermeldt, "
        f"maar kreeg: '{error_msg}'"
    )
