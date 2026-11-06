-- Prints what Music is playing as one tab-separated line:
-- player, state (playing|paused|stopped), title, artist, position (s), duration (s).
-- Only run when Music is running (the status bar checks first).
tell application "Music"
	set pstate to player state as text
	if pstate is "stopped" then return "music" & tab & "stopped"
	set t to name of current track
	set a to artist of current track
	set dur to duration of current track
	set pos to player position
end tell
return "music" & tab & pstate & tab & t & tab & a & tab & (pos as text) & tab & (dur as text)
