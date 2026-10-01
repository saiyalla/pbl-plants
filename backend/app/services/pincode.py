"""Looks up which district a pincode belongs to, via India Post's free public API.

Lets us recognise a Visakhapatnam pincode the team hasn't typed into the delivery-zone list
yet, instead of only ever knowing about pincodes someone has manually configured. This must
never block or fail checkout — any lookup problem (unknown pincode, slow/unreachable service)
just falls back to treating the address as out of zone (shipped by courier).
"""

import logging

import httpx

log = logging.getLogger("pbl.pincode")
PINCODE_API = "https://api.postalpincode.in/pincode"

# District names are stable for a given pincode, so a successful lookup is cached for the
# life of the process — no need to ask India Post about the same pincode twice.
_district_cache: dict[str, str | None] = {}


def lookup_district(pincode: str, client: httpx.Client | None = None) -> str | None:
    """Returns the district for an Indian pincode, or None if it can't be determined."""
    if pincode in _district_cache:
        return _district_cache[pincode]

    district: str | None = None
    own_client = client is None
    client = client or httpx.Client(timeout=4)
    try:
        resp = client.get(f"{PINCODE_API}/{pincode}")
        resp.raise_for_status()
        offices = resp.json()[0].get("PostOffice") or []
        district = offices[0]["District"] if offices else None
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        log.warning("Pincode lookup failed for %s", pincode)
        return None  # don't cache failures — worth retrying on the next request
    finally:
        if own_client:
            client.close()

    _district_cache[pincode] = district
    return district


def is_visakhapatnam(district: str | None) -> bool:
    if not district:
        return False
    d = district.lower()
    return "visakhapatnam" in d or "vishakhapatnam" in d
