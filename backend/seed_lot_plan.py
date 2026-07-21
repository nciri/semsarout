"""Seed a sample interactive lot plan (plan + lots) for a program.

Run: python3 seed_lot_plan.py [program_slug]
Idempotent: skips a program that already has a plan.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from seed import app
from app import db
from app.models import Program, ProgramPlan, ProgramLot

DEFAULT_SLUG = 'residence-azure-anfa'

# 6 rectangular lots on a 3x2 grid, varied statuses/specs
COLS, ROWS = 3, 2
X0, Y0, W, H, GX, GY = 0.07, 0.14, 0.26, 0.34, 0.035, 0.10

LOTS = [
    dict(reference='A1', lot_type='apartment', surface=72, rooms=3, bedrooms=2, bathrooms=1, floor=1, price=1250000, status='available'),
    dict(reference='A2', lot_type='apartment', surface=95, rooms=4, bedrooms=3, bathrooms=2, floor=1, price=1780000, status='reserved'),
    dict(reference='A3', lot_type='apartment', surface=58, rooms=2, bedrooms=1, bathrooms=1, floor=1, price=980000, status='sold'),
    dict(reference='B1', lot_type='duplex',    surface=140, rooms=5, bedrooms=3, bathrooms=2, floor=2, price=2650000, status='available'),
    dict(reference='B2', lot_type='apartment', surface=88, rooms=3, bedrooms=2, bathrooms=2, floor=2, price=1690000, status='available'),
    dict(reference='B3', lot_type='apartment', surface=110, rooms=4, bedrooms=3, bathrooms=2, floor=2, price=2100000, status='reserved'),
]


def rect_zone(row, col):
    x0 = X0 + col * (W + GX)
    y0 = Y0 + row * (H + GY)
    x1, y1 = x0 + W, y0 + H
    return [{'x': x0, 'y': y0}, {'x': x1, 'y': y0}, {'x': x1, 'y': y1}, {'x': x0, 'y': y1}]


def main():
    slug = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SLUG
    with app.app_context():
        program = Program.query.filter_by(slug=slug).first()
        if not program:
            print(f'Program "{slug}" not found.')
            return
        if ProgramPlan.query.filter_by(program_id=program.id).first():
            print(f'Program "{slug}" already has a plan — skipping.')
            return

        plan = ProgramPlan(
            program_id=program.id,
            name='Plan de masse',
            image_url=f'https://picsum.photos/seed/{program.slug}-plan/1200/800',
            position=1
        )
        db.session.add(plan)
        db.session.flush()

        for i, spec in enumerate(LOTS):
            row, col = divmod(i, COLS)
            db.session.add(ProgramLot(
                program_id=program.id,
                plan_id=plan.id,
                title=f"Lot {spec['reference']}",
                zone=rect_zone(row, col),
                **spec
            ))

        db.session.commit()
        print(f'Created plan "{plan.name}" with {len(LOTS)} lots for "{program.name}" (id={program.id}).')


if __name__ == '__main__':
    main()
