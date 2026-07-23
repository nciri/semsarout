"""Run all teams/seats verification scripts. python3 scripts/verify_teams_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = [
    'verify_team_models.py', 'verify_team_seed.py', 'verify_seats_service.py',
    'verify_team_api.py', 'verify_invitations.py', 'verify_downgrade_guard.py',
]
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
