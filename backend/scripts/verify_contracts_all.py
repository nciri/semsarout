"""python3 scripts/verify_contracts_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_contract_models.py', 'verify_contract_services.py', 'verify_contract_seed.py',
           'verify_contract_templates_api.py', 'verify_contracts_api.py', 'verify_contract_finalize.py']
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
