$cssFiles = Get-ChildItem -Path 'force-app\main\default\lwc' -Recurse -Filter '*.css' | Where-Object { $_.FullName -notmatch '\\z[A-Z]' }
Write-Output "=== PER-FILE CSS token consumers (live-stack only) ==="
foreach ($f in $cssFiles) {
    $content = Get-Content $f.FullName -Raw
    $matches = [regex]::Matches($content, '--c-[\w-]+')
    if ($matches.Count -gt 0) {
        $tokens = @()
        foreach ($m in $matches) {
            $tokens += $m.Value
        }
        $unique = $tokens | Sort-Object -Unique
        $relPath = $f.FullName.Replace((Get-Location).Path + '\', '')
        Write-Output "$relPath  =>  $($unique -join ', ')"
    }
}
