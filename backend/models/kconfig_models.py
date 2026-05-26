from pydantic import BaseModel


class KconfigEntry(BaseModel):
    name: str
    value: str
    type: str  # bool | int | string | hex
