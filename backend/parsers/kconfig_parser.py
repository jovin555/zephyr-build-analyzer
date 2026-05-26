"""Kconfig parser.

Handles two input formats:
- .config  (CONFIG_FOO=y / CONFIG_FOO="bar" / # CONFIG_FOO is not set)
- autoconf.h  (#define CONFIG_FOO 1 / #define CONFIG_FOO "bar")
"""

import re
from pathlib import Path
from models.kconfig_models import KconfigEntry

_RE_DOTCONFIG = re.compile(r"^(CONFIG_\w+)=(.+)$")
_RE_AUTOCONF = re.compile(r"^#define\s+(CONFIG_\w+)\s+(.+)$")


def _infer_type(value: str) -> str:
    if value in ("y", "n", "1", "0"):
        return "bool"
    if value.startswith('"'):
        return "string"
    if value.startswith("0x") or value.startswith("0X"):
        return "hex"
    try:
        int(value)
        return "int"
    except ValueError:
        return "string"


def parse(config_path: Path) -> list[KconfigEntry]:
    text = config_path.read_text(errors="replace")
    entries: list[KconfigEntry] = []

    # Detect format by checking first non-comment line
    is_autoconf = config_path.suffix in (".h",) or "#define" in text[:200]

    if is_autoconf:
        for line in text.splitlines():
            m = _RE_AUTOCONF.match(line.strip())
            if m:
                name = m.group(1)
                raw = m.group(2).strip()
                value = raw.strip('"')
                entries.append(KconfigEntry(
                    name=name,
                    value=value,
                    type=_infer_type(raw),
                ))
    else:
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("# CONFIG_") and "is not set" in line:
                continue
            m = _RE_DOTCONFIG.match(line)
            if m:
                name = m.group(1)
                raw = m.group(2).strip()
                value = raw.strip('"')
                entries.append(KconfigEntry(
                    name=name,
                    value=value,
                    type=_infer_type(raw),
                ))

    return entries
