"""python3 scripts/verify_analytics_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_analytics_foundation.py', 'verify_analytics_financial.py', 'verify_analytics_market.py',
           'verify_analytics_pipeline.py', 'verify_analytics_team.py', 'verify_analytics_overview.py']
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
