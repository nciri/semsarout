"""Fix password for agent test accounts."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models import User

app = create_app('development')

def fix_passwords():
    """Update passwords for all agent accounts to password123."""
    with app.app_context():
        # Find all professional users (agents)
        agents = User.query.filter(User.user_type == 'professional').all()

        updated = 0
        for agent in agents:
            agent.set_password('password123')
            updated += 1
            print(f"Updated password for: {agent.email}")

        db.session.commit()
        print(f"\nTotal updated: {updated} accounts")
        print("New password: password123")

if __name__ == '__main__':
    fix_passwords()
