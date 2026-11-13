#!/usr/bin/env python
import json, os, sys, importlib.util

CASES = json.loads(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cases.json"), "r", encoding="utf-8").read())
data = json.load(sys.stdin)
ws = data["workspace"]
try:
    spec = importlib.util.spec_from_file_location("solution", os.path.join(ws, "solution.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fn = getattr(mod, "solve", None)
    if fn is None:
        print(json.dumps({"pass": False, "detail": "solution.py 没有 solve 函数"}))
        sys.exit(0)
    failed = 0
    notes = []
    for c in CASES:
        try:
            actual = fn(*c["args"])
        except Exception as e:
            failed += 1
            notes.append("%s 抛错: %s" % (json.dumps(c["args"]), e))
            continue
        if actual != c["expected"]:
            failed += 1
            notes.append("%s 期望 %s 实际 %s" % (json.dumps(c["args"]), json.dumps(c["expected"]), json.dumps(actual)))
    print(json.dumps({"pass": failed == 0, "detail": ("%d/%d 通过" % (len(CASES), len(CASES))) if failed == 0 else "; ".join(notes[:3]), "metrics": {"cases": len(CASES), "failed": failed}}))
except Exception as e:
    print(json.dumps({"pass": False, "detail": "加载 solution.py 失败: %s" % e}))
