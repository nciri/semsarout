"""Config du service translation — socle commun + variables Azure Translator.

**Jamais de clé en dur** : `azure_translator_key` est lu depuis l'environnement
(`AZURE_TRANSLATOR_KEY`) uniquement, jamais loggé (cf. `semsar_common.setup_logging`,
aucun log applicatif ne reprend cette valeur).
"""
from functools import lru_cache

from pydantic_settings import SettingsConfigDict
from semsar_common import Settings


class TranslationSettings(Settings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    azure_translator_key: str | None = None
    azure_translator_endpoint: str = "https://api.cognitive.microsofttranslator.com"
    azure_translator_region: str | None = None


@lru_cache
def get_settings() -> TranslationSettings:
    return TranslationSettings()
