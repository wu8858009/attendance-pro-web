"""把桌面版的說明書、勞工局說明文字原樣抽出成 web/js/content.js，兩邊內容才不會各改各的。
用法：python gen_content.py"""
import ast, importlib.util, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "..", "attendance_system.py"))
spec = importlib.util.spec_from_file_location("attendance_system", SRC)
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)

# 網頁版資料不在本機檔案，這幾句要換掉
REPLACE = {
    "・資料檔 attendance_data.json 與程式放在同一資料夾，搬移程式時請一起帶走":
        "・資料儲存在 Google 試算表，用同一組密碼登入，任何裝置都看得到同一份資料",
    "・更新程式後資料會不見嗎？": "・更新網頁版後資料會不見嗎？",
    "　不會，資料存在 attendance_data.json；更新前仍建議先匯出備份":
        "　不會，資料存在 Google 試算表；仍建議定期匯出備份",
    "・排班班表頁 Ctrl + V：貼上截圖讀取班表（游標在文字框時照常貼上文字）":
        "・排班班表頁 Ctrl + V：貼上截圖讀取班表（游標在文字框時照常貼上文字）",
}

tree = ast.parse(open(SRC, encoding="utf-8").read())
env = {k: getattr(A, k) for k in dir(A) if k.startswith("COLOR_")}


def literal(node):
    return eval(compile(ast.Expression(node), "x", "eval"), {}, env)


cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "AttendanceApp")
fn = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "build_help_tab")
cards, qref = [], None
for node in ast.walk(fn):
    if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "qref_rows":
        qref = literal(node.value)
    if isinstance(node, ast.Call) and getattr(node.func, "attr", "") == "_add_help_card":
        accent = next((literal(k.value) for k in node.keywords if k.arg == "accent"), A.COLOR_TEAL)
        cards.append([literal(node.args[1]), literal(node.args[2]), literal(node.args[3]), literal(node.args[4]), accent])

manual = [[i, t, s, [REPLACE.get(x, x) for x in lines], c] for i, t, s, lines, c in A.MANUAL_SECTIONS]
out = ("/* 由 tools/gen_content.py 從桌面版產生，請勿手改 */\n"
       "window.Content = " + json.dumps({"manual": manual, "helpCards": cards, "qref": qref}, ensure_ascii=False, indent=1) + ";\n")
with open(os.path.join(HERE, "..", "js", "content.js"), "w", encoding="utf-8", newline="\n") as f:
    f.write(out)
print(len(manual), len(cards), len(qref))
