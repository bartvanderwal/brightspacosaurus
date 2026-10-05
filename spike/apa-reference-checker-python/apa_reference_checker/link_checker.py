"""Optionele HTTP-linkcontrole voor de APA Citation Checker (req. 7)."""
import asyncio

import httpx

from .models import DeadLink, Source


async def _check_single(
    client: httpx.AsyncClient,
    url: str,
    timeout: float,
) -> DeadLink | None:
    """
    Voert een HEAD-verzoek uit voor één URL.
    Geeft None terug als de URL bereikbaar is (status 200–399).
    Geeft een DeadLink terug bij status ≥ 400, timeout of verbindingsfout.
    """
    try:
        response = await client.head(
            url,
            timeout=timeout,
            follow_redirects=True,
        )
        if response.status_code >= 400:
            return DeadLink(url=url, status=str(response.status_code))
        return None
    except httpx.TimeoutException:
        return DeadLink(url=url, status="timeout")
    except httpx.RequestError as exc:
        return DeadLink(url=url, status=str(exc))


async def check_links(
    sources: list[Source],
    timeout: float = 10.0,
) -> list[DeadLink]:
    """
    Controleert alle URLs in de bronnenlijst parallel via HTTP HEAD-verzoeken.

    - Parallel uitvoeren via asyncio.gather (req. 7.6).
    - Timeout per verzoek: 10 seconden (req. 7.5).
    - HTTP-status ≥ 400 → DeadLink met statuscode als string (req. 7.2).
    - Verbindingsfout of timeout → DeadLink met "timeout" of
      foutmelding (req. 7.5).
    - HTTP 200–399 → URL is bereikbaar, niet gerapporteerd (req. 7.3).
    - Bronnen zonder URL worden overgeslagen.
    """
    urls = [source.url for source in sources if source.url is not None]

    if not urls:
        return []

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_check_single(client, url, timeout) for url in urls]
        )

    return [dead for dead in results if dead is not None]
