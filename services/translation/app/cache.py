"""Logique métier `POST /v1/translate` : cache Postgres devant le client Azure Translator.

Pour chaque texte du lot : lookup cache par `(source_hash, source_lang, target_lang)` ;
seuls les textes non cachés sont envoyés à Azure, **en un seul appel batch** (déduppliqué
par hash — deux textes identiques dans le même lot ne déclenchent qu'une traduction), puis
mis en cache. La réponse recompose l'ordre d'entrée.
"""
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from semsar_common import Problem

from .azure_client import AzureTranslatorClient
from .models import TranslationCache, hash_source


def translate_batch(
    db: Session,
    azure: AzureTranslatorClient,
    texts: list[str],
    target: str,
    source: str | None,
) -> list[dict]:
    hashes = [hash_source(t) for t in texts]

    # Toutes les entrées de cache existantes pour ces hash+target, groupées par hash.
    rows_by_hash: dict[str, list[TranslationCache]] = {}
    if hashes:
        query = db.query(TranslationCache).filter(
            TranslationCache.target_lang == target, TranslationCache.source_hash.in_(set(hashes))
        )
        for row in query.all():
            rows_by_hash.setdefault(row.source_hash, []).append(row)

    def _lookup(h: str) -> TranslationCache | None:
        rows = rows_by_hash.get(h, [])
        if source:
            # Clé complète connue : lookup exact, aucune ambiguïté possible.
            return next((r for r in rows if r.source_lang == source), None)
        # Sans `source` explicite, plusieurs entrées peuvent partager le hash (textes
        # identiques traduits depuis des langues source différentes, ex. un mot commun
        # fr/ar). Un hit n'est renvoyé QUE si une seule `source_lang` existe pour ce
        # hash+target — sinon on ne peut pas savoir laquelle s'applique, on retraduit
        # (ré-appel Azure avec autodétection) plutôt que de risquer une traduction
        # renvoyée pour la mauvaise langue source.
        distinct_langs = {r.source_lang for r in rows}
        if len(distinct_langs) == 1:
            return rows[0]
        return None

    # Textes manquants, dédupliqués par hash (un seul appel Azure pour le lot).
    missing_by_hash: dict[str, str] = {}
    for h, t in zip(hashes, texts):
        if _lookup(h) is None and h not in missing_by_hash:
            missing_by_hash[h] = t

    fetched: dict[str, TranslationCache] = {}
    if missing_by_hash:
        missing_hashes = list(missing_by_hash.keys())
        missing_texts = [missing_by_hash[h] for h in missing_hashes]
        results = azure.translate(missing_texts, target=target, source=source)
        for h, text, result in zip(missing_hashes, missing_texts, results):
            resolved_source = result["detected_source"] or source or target
            row = TranslationCache(
                source_hash=h,
                source_lang=resolved_source,
                target_lang=target,
                source_text=text,
                translated_text=result["translated"],
            )
            db.add(row)
            try:
                db.flush()
            except IntegrityError:
                # Course avec un autre appel concurrent ayant déjà inséré la même clé.
                db.rollback()
                row = (
                    db.query(TranslationCache)
                    .filter(
                        TranslationCache.source_hash == h,
                        TranslationCache.source_lang == resolved_source,
                        TranslationCache.target_lang == target,
                    )
                    .first()
                )
                if row is None:
                    # Conflit signalé par Postgres mais la ligne concurrente est
                    # introuvable (rollback d'un tiers, etc.) : pas de traduction
                    # exploitable — erreur maîtrisée plutôt qu'un AttributeError sur
                    # `row.translated_text` plus bas.
                    raise Problem(
                        500,
                        "Internal Server Error",
                        "Conflit de cache de traduction non résolu "
                        f"(source_hash={h}, source_lang={resolved_source}, target_lang={target}).",
                    ) from None
            fetched[h] = row
        db.commit()

    out: list[dict] = []
    for h, t in zip(hashes, texts):
        hit = _lookup(h)
        if hit is not None:
            out.append({"source": t, "translated": hit.translated_text, "cached": True})
        else:
            row = fetched[h]
            out.append({"source": t, "translated": row.translated_text, "cached": False})
    return out
