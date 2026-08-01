"""Run all admin verification scripts. python3 scripts/verify_admin_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = [
    'verify_model_moderation.py', 'verify_superadmin_seed.py', 'verify_admin_overview.py',
    'verify_admin_accounts.py', 'verify_admin_suspend.py', 'verify_admin_delete.py',
    'verify_admin_activity.py', 'verify_admin_impersonate.py', 'verify_purge.py',
]
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    r = subprocess.run([sys.executable, os.path.join(HERE, s)])
    if r.returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
