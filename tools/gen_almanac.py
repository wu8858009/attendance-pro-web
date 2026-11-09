"""用桌面版同一份 almanac_info()（cnlunar）預先算好每年農民曆，輸出成 web/almanac/YYYY.json。
網頁版直接讀這些檔案，內容與桌面版逐字相同。用法：python gen_almanac.py 2020 2045"""
import importlib.util, json, os, sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "attendance_system.py")
spec = importlib.util.spec_from_file_location("attendance_system", SRC)
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)


def conv(v):
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return [conv(x) for x in v]
    return v


for year in range(int(sys.argv[1]), int(sys.argv[2]) + 1):
    d, out = date(year, 1, 1), {}
    while d.year == year:
        out[d.isoformat()] = {k: conv(v) for k, v in A.almanac_info(d).items()}
        d += timedelta(days=1)
    path = os.path.join(HERE, "..", "almanac", f"{year}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(year, os.path.getsize(path))
