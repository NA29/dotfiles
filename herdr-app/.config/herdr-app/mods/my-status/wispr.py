# Prints today's Wispr Flow dictation stats as JSON, read-only, numbers only (never the text):
# {"dictations", "words", "seconds", "wpm", "streak"}. Wispr Flow keeps one row per dictation in
# History (timestamp, numWords, duration). Unofficial: prints {} if the database changes shape.
import datetime, json, os, sqlite3

path = os.path.expanduser("~/Library/Application Support/Wispr Flow/flow.sqlite")
try:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2)
    today = datetime.date.today().isoformat()
    n, words, secs = con.execute(
        "select count(*), coalesce(sum(numWords), 0), coalesce(sum(duration), 0) from History "
        "where date(timestamp, 'localtime') = ? and coalesce(status, '') != 'no_audio'", (today,)).fetchone()
    days = {r[0] for r in con.execute("select distinct date(timestamp, 'localtime') from History")}
    d = datetime.date.today()
    if today not in days:
        d -= datetime.timedelta(days=1)
    streak = 0
    while d.isoformat() in days:
        streak += 1
        d -= datetime.timedelta(days=1)
    print(json.dumps({"dictations": n, "words": int(words), "seconds": round(secs),
                      "wpm": round(words / (secs / 60)) if secs > 0 else None, "streak": streak}))
except Exception:
    print("{}")
