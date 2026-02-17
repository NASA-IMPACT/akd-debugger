import json


def format_exception_details(exc: Exception) -> str:
    parts = [f"{type(exc).__name__}: {exc}"]

    for attr in ("status_code", "request_id", "code", "param", "type"):
        value = getattr(exc, attr, None)
        if value not in (None, ""):
            parts.append(f"{attr}={value}")

    body = getattr(exc, "body", None)
    if body is not None:
        try:
            body_text = json.dumps(body, ensure_ascii=True)
        except Exception:
            body_text = str(body)
        if len(body_text) > 1000:
            body_text = f"{body_text[:1000]}..."
        parts.append(f"body={body_text}")

    return " | ".join(parts)
