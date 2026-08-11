# Throwaway harness for issue #114: three identical Stryker runs, same scope, no changes between them.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
foreach ($i in 1..3) {
  $out = "artifacts/stryker/core-r$i"
  if (Test-Path $out) { Remove-Item $out -Recurse -Force }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  pnpm exec stryker run 2>&1 | Tee-Object -FilePath "artifacts/stryker-core-r$i.log" | Out-Null
  $sw.Stop()
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  Move-Item artifacts/stryker/current/* $out -Force
  "RUN $i WALL_SECONDS $([math]::Round($sw.Elapsed.TotalSeconds,1))" | Tee-Object -FilePath artifacts/stryker-core-walls.txt -Append
}
"ALL DONE" | Tee-Object -FilePath artifacts/stryker-core-walls.txt -Append
