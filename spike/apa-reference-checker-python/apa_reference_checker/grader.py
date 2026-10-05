"""Score-berekening voor APA-referentiecontrole (req. 12).

Letterschaal:
  A — geen fouten, geen waarschuwingen
  B — geen fouten, enkele waarschuwingen
  C — 1–2 ontbrekende inline verwijzingen
  D — 3+ ontbrekende inline verwijzingen of dode links
  F — geen Bronsectie terwijl document claims bevat

Drempelwaarden zijn configureerbaar via GradingConfig.
"""
from dataclasses import dataclass


@dataclass
class GradingConfig:
    """Configureerbare drempelwaarden voor de letterschaal.

    Attributen:
        max_missing_for_c: maximaal aantal ontbrekende inline
            verwijzingen voor grade C (standaard 2).
        max_dead_links_for_c: maximaal aantal dode links voor
            grade C (standaard 0 — elke dode link leidt tot D).
        max_warnings_for_a: maximaal aantal waarschuwingen voor
            grade A (standaard 0 — elke waarschuwing leidt tot B).
    """
    max_missing_for_c: int = 2
    max_dead_links_for_c: int = 0
    max_warnings_for_a: int = 0


def calculate_grade(
    has_sources_section: bool,
    missing_count: int,
    dead_links_count: int,
    warning_count: int,
    has_claims: bool,
    config: GradingConfig | None = None,
) -> str:
    """Bereken de letterschaal-score op basis van controleresultaten.

    Args:
        has_sources_section: of het document een ## Bronnen-sectie
            heeft.
        missing_count: aantal ontbrekende inline verwijzingen.
        dead_links_count: aantal dode links.
        warning_count: totaal aantal waarschuwingen (orphaned_refs,
            bare_urls, source_section_issues, unfounded_claims).
        has_claims: of het document feitelijke claims bevat
            (inline verwijzingen of claim-patronen aanwezig).
        config: optionele configuratie voor drempelwaarden.

    Returns:
        Een letter: "A", "B", "C", "D", of "F".
    """
    if config is None:
        config = GradingConfig()

    # F: geen Bronsectie terwijl document claims bevat
    if not has_sources_section and has_claims:
        return "F"

    # D: 3+ ontbrekende of dode links boven drempel
    if (missing_count > config.max_missing_for_c
            or dead_links_count > config.max_dead_links_for_c):
        return "D"

    # C: 1–2 ontbrekende inline verwijzingen
    if missing_count > 0:
        return "C"

    # B: geen fouten, maar waarschuwingen
    if warning_count > config.max_warnings_for_a:
        return "B"

    # A: geen fouten, geen waarschuwingen
    return "A"
