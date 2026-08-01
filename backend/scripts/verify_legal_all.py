"""python3 scripts/verify_legal_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_legal_models.py', 'verify_legal_seed.py', 'verify_notaries_api.py',
           'verify_legal_cases_api.py', 'verify_legal_tasks_api.py']
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
