$cssFiles = Get-ChildItem -Path 'force-app\main\default\lwc' -Recurse -Filter '*.css' | Where-Object { $_.FullName -notmatch '\\z[A-Z]' }
$allTokens = @()
foreach ($f in $cssFiles) {
    $content = Get-Content $f.FullName -Raw
    $matches = [regex]::Matches($content, '--c-[\w-]+')
    foreach ($m in $matches) {
        $allTokens += $m.Value
    }
}
Write-Output "=== CSS CONSUMERS (unique tokens referenced in CSS) ==="
$allTokens | Sort-Object -Unique

Write-Output ""
Write-Output "=== JS PRODUCER (unique tokens emitted by formThemes.js) ==="
$jsContent = Get-Content 'force-app\main\default\lwc\formThemes\formThemes.js' -Raw
$jsMatches = [regex]::Matches($jsContent, '--c-[\w-]+')
$jsTokens = @()
foreach ($m in $jsMatches) {
    $jsTokens += $m.Value
}
$jsTokens | Sort-Object -Unique
