"""Tests voor grader.py — score-berekening (req. 12)."""
import sys
import os
sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

import pytest

from apa_reference_checker.grader import GradingConfig, calculate_grade
from apa_reference_checker.checker import check_citations


# ---------------------------------------------------------------------------
# Unit-tests voor calculate_grade
# ---------------------------------------------------------------------------

class TestCalculateGrade:
    """Tests voor de calculate_grade functie."""

    def test_grade_a_geen_fouten_geen_waarschuwingen(self):
        """Document zonder fouten en waarschuwingen → grade A."""
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=0,
            dead_links_count=0,
            warning_count=0,
            has_claims=True,
        )
        assert grade == "A"

    def test_grade_b_geen_fouten_enkele_waarschuwingen(self):
        """Document met alleen waarschuwingen → grade B."""
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=0,
            dead_links_count=0,
            warning_count=3,
            has_claims=True,
        )
        assert grade == "B"

    def test_grade_c_1_ontbrekende_verwijzing(self):
        """Document met 1 ontbrekende inline verwijzing → grade C."""
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=1,
            dead_links_count=0,
            warning_count=0,
            has_claims=True,
        )
        assert grade == "C"

    def test_grade_c_2_ontbrekende_verwijzingen(self):
        """Document met 2 ontbrekende inline verwijzingen → grade C."""
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=2,
            dead_links_count=0,
            warning_count=0,
            has_claims=True,
        )
        assert grade == "C"

    def test_grade_d_3_ontbrekende_verwijzingen(self):
        """Document met 3+ ontbrekende verwijzingen → grade D."""
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=3,
            dead_links_count=0,
            warning_count=0,
            has_claims=True,
        )
        assert grade == "D"

    def test_grade_d_dode_links(self):
        """Document met dode links → grade D."""
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=0,
            dead_links_count=1,
            warning_count=0,
            has_claims=True,
        )
        assert grade == "D"

    def test_grade_f_geen_bronsectie_met_claims(self):
        """Document zonder Bronsectie maar met claims → grade F."""
        grade = calculate_grade(
            has_sources_section=False,
            missing_count=0,
            dead_links_count=0,
            warning_count=0,
            has_claims=True,
        )
        assert grade == "F"

    def test_grade_a_geen_bronsectie_zonder_claims(self):
        """Document zonder Bronsectie en zonder claims → grade A."""
        grade = calculate_grade(
            has_sources_section=False,
            missing_count=0,
            dead_links_count=0,
            warning_count=0,
            has_claims=False,
        )
        assert grade == "A"


# ---------------------------------------------------------------------------
# Tests voor configureerbare drempelwaarden
# ---------------------------------------------------------------------------

class TestGradingConfig:
    """Tests voor configureerbare drempelwaarden."""

    def test_aangepaste_max_missing_for_c(self):
        """Met hogere drempel: 4 ontbrekende → nog steeds C."""
        config = GradingConfig(max_missing_for_c=5)
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=4,
            dead_links_count=0,
            warning_count=0,
            has_claims=True,
            config=config,
        )
        assert grade == "C"

    def test_aangepaste_max_missing_for_c_overschreden(self):
        """Met hogere drempel: 6 ontbrekende → D."""
        config = GradingConfig(max_missing_for_c=5)
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=6,
            dead_links_count=0,
            warning_count=0,
            has_claims=True,
            config=config,
        )
        assert grade == "D"

    def test_aangepaste_max_dead_links_for_c(self):
        """Met hogere drempel voor dode links: 1 dode link → C."""
        config = GradingConfig(max_dead_links_for_c=2)
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=1,
            dead_links_count=1,
            warning_count=0,
            has_claims=True,
            config=config,
        )
        assert grade == "C"

    def test_aangepaste_max_warnings_for_a(self):
        """Met hogere drempel voor waarschuwingen: 2 → nog A."""
        config = GradingConfig(max_warnings_for_a=3)
        grade = calculate_grade(
            has_sources_section=True,
            missing_count=0,
            dead_links_count=0,
            warning_count=2,
            has_claims=True,
            config=config,
        )
        assert grade == "A"


# ---------------------------------------------------------------------------
# Integratietests: check_citations() levert grade op
# ---------------------------------------------------------------------------

class TestGradeIntegration:
    """Tests dat check_citations() het grade-veld correct vult."""

    def test_volledig_geciteerd_geen_waarschuwingen(self):
        """Volledig geciteerd document → grade A."""
        md = (
            "Zie (Auteur, 2026) voor meer info.\n\n"
            "## Bronnen\n\n"
            "- Auteur. (2026). *Titel*. https://example.com\n"
        )
        result = check_citations(md)
        assert result.grade == "A"

    def test_ontbrekende_verwijzing_grade_c(self):
        """1 ontbrekende verwijzing → grade C."""
        md = (
            "Geen verwijzing hier.\n\n"
            "## Bronnen\n\n"
            "- Auteur. (2026). *Titel*. https://example.com\n"
        )
        result = check_citations(md)
        assert result.grade == "C"

    def test_meerdere_ontbrekende_grade_d(self):
        """3+ ontbrekende verwijzingen → grade D."""
        md = (
            "Geen verwijzingen.\n\n"
            "## Bronnen\n\n"
            "- Auteur1. (2026). *Titel 1*.\n"
            "- Auteur2. (2025). *Titel 2*.\n"
            "- Auteur3. (2024). *Titel 3*.\n"
        )
        result = check_citations(md)
        assert result.grade == "D"

    def test_geen_bronsectie_met_inline_refs_grade_f(self):
        """Document met inline refs maar zonder Bronsectie → F."""
        md = "Zie (Auteur, 2026) voor meer info.\n"
        result = check_citations(md)
        assert result.grade == "F"

    def test_geen_bronsectie_zonder_claims_grade_a(self):
        """Document zonder Bronsectie en zonder claims → A."""
        md = "# Titel\n\nGeen bronnen of claims hier.\n"
        result = check_citations(md)
        assert result.grade == "A"

    def test_grade_met_custom_config(self):
        """check_citations() respecteert custom GradingConfig."""
        md = (
            "Geen verwijzingen.\n\n"
            "## Bronnen\n\n"
            "- Auteur1. (2026). *Titel 1*.\n"
            "- Auteur2. (2025). *Titel 2*.\n"
            "- Auteur3. (2024). *Titel 3*.\n"
        )
        # Met standaard config: 3 ontbrekende → D
        result = check_citations(md)
        assert result.grade == "D"

        # Met hogere drempel: 3 ontbrekende → C
        config = GradingConfig(max_missing_for_c=5)
        result = check_citations(md, grading_config=config)
        assert result.grade == "C"
