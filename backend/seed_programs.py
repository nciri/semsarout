"""Add new-build programs without clearing existing database data.

Run with: python3 seed_programs.py
Programs are identified by their reference and are skipped when already present.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from seed import app, seed_programs
from app.models import Agency, User


def main():
    with app.app_context():
        agencies = Agency.query.filter(
            Agency.city.in_(['Casablanca', 'Rabat', 'Marrakech', 'Tanger'])
        ).all()
        users = User.query.filter(User.agency_id.isnot(None)).all()

        if not agencies:
            print('No agencies found in the target cities. No programs were created.')
            return

        programs = seed_programs(users, agencies, skip_existing=True)
        print(f'Created {len(programs)} program(s). Existing records were not modified.')


if __name__ == '__main__':
    main()
