"""Devicetree parser for devicetree_generated.h or .dts files.

Extracts node labels, status, and compatible strings from the generated header.
"""

import re
from pathlib import Path
from models.session import DevicetreeNode

_RE_STATUS = re.compile(r"DT_N(?:_ALIAS_\w+)?_NODELABEL_(\w+)_P_status\s+\"(\w+)\"")
_RE_COMPAT = re.compile(
    r"DT_N(?:_ALIAS_\w+)?_NODELABEL_(\w+)_P_compatible_IDX_0_VAL\s+\"([^\"]+)\""
)


def parse(dts_path: Path) -> list[DevicetreeNode]:
    text = dts_path.read_text(errors="replace")

    statuses: dict[str, str] = {}
    compats: dict[str, str] = {}

    for m in _RE_STATUS.finditer(text):
        statuses[m.group(1)] = m.group(2)

    for m in _RE_COMPAT.finditer(text):
        compats[m.group(1)] = m.group(2)

    nodes: list[DevicetreeNode] = []
    seen = set()
    for label, status in statuses.items():
        if label not in seen:
            seen.add(label)
            nodes.append(DevicetreeNode(
                label=label,
                status=status,
                compatible=compats.get(label, ""),
            ))

    return nodes
