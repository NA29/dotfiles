-- Prints what Spotify is playing as one tab-separated line:
-- player, state (playing|paused|stopped), title, artist, position (s), duration (s).
-- Only run when Spotify is running (the status bar checks first).
tell application "Spotify"
	set pstate to player state as text
	if pstate is "stopped" then return "spotify" & tab & "stopped"
	set t to name of current track
	set a to artist of current track
	set dur to (duration of current track) / 1000
	set pos to player position
end tell
return "spotify" & tab & pstate & tab & t & tab & a & tab & (pos as text) & tab & (dur as text)
