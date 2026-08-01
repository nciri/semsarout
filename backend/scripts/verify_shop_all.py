"""python3 scripts/verify_shop_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_shop_models.py', 'verify_shop_seed.py', 'verify_shop_products_api.py',
           'verify_shop_cart_api.py', 'verify_shop_orders_api.py', 'verify_admin_products_api.py',
           'verify_admin_orders_api.py']
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
