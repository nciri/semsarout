"""Reset programs and reload with updated data.

Run with: python3 reset_programs.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from seed import app, seed_programs
from app.models import Agency, User, Program, ProgramUnit, ProgramImage, ProgramUnitImage
from app import db


def main():
    with app.app_context():
        # Delete existing programs
        print("Resetting programs...")
        ProgramImage.query.delete()
        ProgramUnitImage.query.delete()
        ProgramUnit.query.delete()
        Program.query.delete()
        db.session.commit()
        print("  Deleted all existing programs, units and images")

        # Reload programs
        agencies = Agency.query.filter(
            Agency.city.in_(['Casablanca', 'Rabat', 'Marrakech', 'Tanger'])
        ).all()
        users = User.query.filter(User.agency_id.isnot(None)).all()

        if not agencies:
            print('No agencies found in the target cities. No programs were created.')
            return

        programs = seed_programs(users, agencies, skip_existing=False)
        print(f'Successfully reloaded {len(programs)} program(s) with updated units and pricing.')


if __name__ == '__main__':
    main()
