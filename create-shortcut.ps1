$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'AeroMD.lnk'

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = 'c:\Users\jayas\Documents\Projects\SF Projects\forms\AeroMD.vbs'
$Shortcut.WorkingDirectory = 'c:\Users\jayas\Documents\Projects\SF Projects\forms'
$Shortcut.Description = 'AeroMD - Premium Markdown Viewer'
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Write-Host "Shortcut created: $ShortcutPath"
