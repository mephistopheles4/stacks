$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$out = 'artifacts/stryker/gates-r1'
$sw = [Diagnostics.Stopwatch]::StartNew()
pnpm exec stryker run stryker.gates.json 2>&1 | Tee-Object -FilePath 'artifacts/stryker-gates-r1.log' | Out-Null
$exit = $LASTEXITCODE
$sw.Stop()
New-Item -ItemType Directory -Force -Path $out | Out-Null
if (Test-Path 'artifacts/stryker/current/mutation.json') {
  Copy-Item 'artifacts/stryker/current/mutation.json' "$out/mutation.json" -Force
  Copy-Item 'artifacts/stryker/current/mutation.html' "$out/mutation.html" -Force
}
"gates-r1 WALL_SECONDS $([math]::Round($sw.Elapsed.TotalSeconds,1)) EXIT $exit" | Tee-Object -FilePath 'artifacts/stryker-rest-walls.txt' -Append
'ALL DONE' | Tee-Object -FilePath 'artifacts/stryker-rest-walls.txt' -Append
