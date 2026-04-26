class AllProvidersRateLimitedError(Exception):
    """
    Raised when the active generation path cannot fulfill the request:
    - Both Gemini and Groq returned 429, or
    - Gemini returned 429 and Groq is misconfigured/unreachable.
    Callers surface this as HTTP 503 AT_CAPACITY.
    """
    pass
