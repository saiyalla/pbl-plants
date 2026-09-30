"""Shared rate limiter — keyed by client IP. Imported by main.py (to register the
exception handler) and by routers (to decorate individual endpoints)."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
