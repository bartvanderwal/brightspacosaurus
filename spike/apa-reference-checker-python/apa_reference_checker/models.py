"""Data models voor de APA Reference Checker (ARC)."""
from dataclasses import dataclass, field
from enum import Enum


class ErrorCode(str, Enum):
    """
    Foutcodes voor de APA Reference Checker.
    Prefix ARC- gevolgd door een oplopend driecijferig nummer.

    ARC-001: Bron zonder overeenkomende inline verwijzing
    ARC-002: Bron in afwijkend formaat (overgeslagen)
    ARC-003: Zwevende inline verwijzing (geen bron in Bronsectie)
    ARC-004: Dode link (HTTP >= 400 of timeout)
    ARC-005: Losse URL met pad (waarschuwing)
    ARC-006: Losse URL zonder pad / domein-only (info)
    ARC-007: Zin met feitsclaim zonder inline verwijzing
    ARC-008: Sub-bullet of inspringende tekst in Bronsectie
    ARC-009: Niet-bronregel in Bronsectie (geen lege regel)
    """
    ARC_001 = "ARC-001"
    ARC_002 = "ARC-002"
    ARC_003 = "ARC-003"
    ARC_004 = "ARC-004"
    ARC_005 = "ARC-005"
    ARC_006 = "ARC-006"
    ARC_007 = "ARC-007"
    ARC_008 = "ARC-008"
    ARC_009 = "ARC-009"


@dataclass
class Source:
    """Een bronvermelding uit de ## Bronnen-sectie."""
    author: str       # bijv. "Unified" of "IMS Global"
    year: str         # bijv. "z.d.", "2026", "2025"
    full_text: str    # volledige bronregel zoals in het document
    url: str | None = None  # URL indien aanwezig


@dataclass
class InlineRef:
    """Een inline verwijzing in de documenttekst, bijv. (Auteur, jaar)."""
    author: str
    year: str
    line_number: int


@dataclass
class MissingCitation:
    """Een bron zonder overeenkomende inline verwijzing (fout)."""
    source: Source
    expected_ref: str  # bijv. "(Unified, z.d.)"
    code: str = ErrorCode.ARC_001


@dataclass
class OrphanedRef:
    """Een inline verwijzing zonder overeenkomende bron (waarschuwing)."""
    ref: InlineRef
    severity: str = "warning"
    code: str = ErrorCode.ARC_003


@dataclass
class DeadLink:
    """Een URL die niet bereikbaar is."""
    url: str
    status: str  # HTTP-statuscode of "timeout" of foutmelding
    code: str = ErrorCode.ARC_004


@dataclass
class BareUrl:
    """Een losse URL in de documenttekst buiten de Bronsectie."""
    url: str
    line_number: int
    severity: str  # "warning" (met pad) of "info" (alleen domein)
    code: str = ""  # wordt gezet op basis van severity

    def __post_init__(self):
        if not self.code:
            self.code = ErrorCode.ARC_005 if self.severity == "warning" else ErrorCode.ARC_006


@dataclass
class UnfoundedClaim:
    """Een zin met een feitsclaim zonder inline verwijzing (waarschuwing)."""
    sentence: str
    line_number: int
    severity: str = "warning"
    code: str = ErrorCode.ARC_007


@dataclass
class SourceSectionIssue:
    """Een probleem in de Bronsectie (sub-bullet of niet-bronregel)."""
    line_number: int
    line_text: str
    code: str  # ARC-008 of ARC-009
    severity: str = "warning"


@dataclass
class CheckResult:
    """Het volledige resultaat van een APA-referentiecontrole."""
    missing_citations: list[MissingCitation] = field(default_factory=list)
    orphaned_refs: list[OrphanedRef] = field(default_factory=list)
    dead_links: list[DeadLink] = field(default_factory=list)
    bare_urls: list[BareUrl] = field(default_factory=list)
    unfounded_claims: list[UnfoundedClaim] = field(default_factory=list)
    source_section_issues: list[SourceSectionIssue] = field(default_factory=list)
    has_sources_section: bool = False
    total_sources: int = 0
    cited_sources: int = 0
    grade: str = ""

    @property
    def ok(self) -> bool:
        """True als alle bronnen geciteerd zijn en er geen dode links zijn."""
        return (len(self.missing_citations) == 0
                and len(self.dead_links) == 0)
