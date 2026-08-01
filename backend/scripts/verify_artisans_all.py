"""python3 scripts/verify_artisans_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_artisan_models.py', 'verify_artisan_seed.py', 'verify_artisans_api.py',
           'verify_work_orders_api.py', 'verify_shared_artisans_api.py']
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
