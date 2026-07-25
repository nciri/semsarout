"""Consumer monolithe : `user.*` (émis par identity) -> resynchronise `public.users`.

Lancer depuis backend/ :  python scripts/consume_users.py
Prérequis : `pika` installé, RabbitMQ up, table `public.users` existante.

INVERSION DE PROPRIÉTÉ (transition) : identity est désormais **source de vérité** pour les
écritures compte (register/profil/mot de passe/suppression) et émet `user.*`. Le monolithe,
qui sert encore ~250 routes lisant `public.users`, projette ces changements ici.

ANTI-BOUCLE : l'upsert se fait en **SQL brut** (SQLAlchemy Core `text()`), donc SANS déclencher
les listeners ORM `after_update` de l'outbox → pas de ré-émission. La suspension (via
trust-safety → monolithe) continue d'écrire en ORM et d'émettre : les deux sens coexistent
sur des champs disjoints, de façon idempotente.
"""
import json
import os

import pika
from sqlalchemy import text

from app import create_app, db

EXCHANGE = os.environ.get("EVENTS_EXCHANGE", "semsar.events")
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://semsar:semsar@localhost:5672/")
QUEUE = "monolith.users"

_COLS = [
    "email", "password_hash", "first_name", "last_name", "phone", "avatar_url", "user_type",
    "account_role", "interest", "is_active", "is_verified", "created_at", "last_login",
    "is_suspended", "suspended_at", "suspended_reason", "deleted_at", "anonymized_at",
    "dashboard_config", "agency_id", "team_id",
]


def _upsert(app, payload: dict) -> None:
    cols = [c for c in _COLS if c in payload]
    insert_cols = ["id"] + cols
    placeholders = ", ".join(f":{c}" for c in insert_cols)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols)
    params = {"id": payload["id"], **{c: _coerce(c, payload[c]) for c in cols}}
    sql = text(
        f"INSERT INTO users ({', '.join(insert_cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT (id) DO UPDATE SET {updates}"
    )
    with app.app_context():
        db.session.execute(sql, params)
        db.session.execute(
            text("SELECT setval(pg_get_serial_sequence('users','id'), "
                 "GREATEST((SELECT last_value FROM users_id_seq), :id))"),
            {"id": payload["id"]},
        )
        # Sync des rôles (si l'événement porte role_ids — ex. PUT /users/{id}/roles côté identity).
        if "role_ids" in payload:
            db.session.execute(text("DELETE FROM user_roles WHERE user_id = :uid"),
                               {"uid": payload["id"]})
            for rid in payload["role_ids"]:
                db.session.execute(
                    text("INSERT INTO user_roles (user_id, role_id) VALUES (:uid, :rid) "
                         "ON CONFLICT DO NOTHING"),
                    {"uid": payload["id"], "rid": rid},
                )
        db.session.commit()


def _coerce(col: str, value):
    # dashboard_config est du JSON ; psycopg attend une chaîne JSON pour une colonne JSON.
    if col == "dashboard_config" and value is not None and not isinstance(value, str):
        return json.dumps(value)
    return value


_ROLE_COLS = ["name", "slug", "description", "color", "level", "is_system", "agency_id"]


def _upsert_role(app, payload: dict) -> None:
    """Sync public.roles + role_permissions depuis role.created/updated (émis par identity)."""
    cols = [c for c in _ROLE_COLS if c in payload]
    insert_cols = ["id"] + cols + ["created_at", "updated_at"]
    vals = ", ".join([":id"] + [f":{c}" for c in cols] + ["now()", "now()"])
    updates = ", ".join([f"{c} = EXCLUDED.{c}" for c in cols] + ["updated_at = now()"])
    params = {"id": payload["id"], **{c: payload[c] for c in cols}}
    with app.app_context():
        db.session.execute(
            text(f"INSERT INTO roles ({', '.join(insert_cols)}) VALUES ({vals}) "
                 f"ON CONFLICT (id) DO UPDATE SET {updates}"), params)
        if "permission_ids" in payload:
            db.session.execute(text("DELETE FROM role_permissions WHERE role_id = :rid"),
                               {"rid": payload["id"]})
            for pid in payload["permission_ids"]:
                db.session.execute(
                    text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid) "
                         "ON CONFLICT DO NOTHING"), {"rid": payload["id"], "pid": pid})
        db.session.execute(
            text("SELECT setval(pg_get_serial_sequence('roles','id'), "
                 "GREATEST((SELECT last_value FROM roles_id_seq), :id))"), {"id": payload["id"]})
        db.session.commit()


def _delete_role(app, role_id) -> None:
    with app.app_context():
        db.session.execute(text("DELETE FROM role_permissions WHERE role_id = :rid"), {"rid": role_id})
        db.session.execute(text("DELETE FROM user_roles WHERE role_id = :rid"), {"rid": role_id})
        db.session.execute(text("DELETE FROM roles WHERE id = :rid"), {"rid": role_id})
        db.session.commit()


def main() -> None:
    app = create_app()
    conn = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
    ch = conn.channel()
    ch.exchange_declare(EXCHANGE, exchange_type="topic", durable=True)
    ch.queue_declare(QUEUE, durable=True)
    ch.queue_bind(QUEUE, EXCHANGE, routing_key="user.#")
    ch.queue_bind(QUEUE, EXCHANGE, routing_key="role.#")

    def on_message(_ch, method, _props, body):
        try:
            payload = json.loads(body)
            rk = method.routing_key
            if rk == "user.deleted":
                with app.app_context():
                    db.session.execute(text("UPDATE users SET is_active=false WHERE id=:id"),
                                       {"id": payload["id"]})
                    db.session.commit()
            elif rk == "role.deleted":
                _delete_role(app, payload["id"])
            elif rk.startswith("role.") and payload.get("id") is not None:
                _upsert_role(app, payload)
            elif payload.get("id") is not None:
                _upsert(app, payload)
            _ch.basic_ack(method.delivery_tag)
        except Exception as exc:  # noqa: BLE001
            print(f"[consume_users] erreur: {exc}", flush=True)
            _ch.basic_nack(method.delivery_tag, requeue=False)

    ch.basic_qos(prefetch_count=20)
    ch.basic_consume(QUEUE, on_message)
    print("[consume_users] en écoute sur user.# ...", flush=True)
    ch.start_consuming()


if __name__ == "__main__":
    main()
