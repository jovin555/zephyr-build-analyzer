from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    upload_dir: str = "/tmp/zba_uploads"
    max_upload_size_mb: int = 256

    class Config:
        env_file = ".env"


settings = Settings()
