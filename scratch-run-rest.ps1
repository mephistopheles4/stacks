# Throwaway harness for issue #114, part 2: full package scope, everything-scope,
# and two more long-timeout core runs to size that config's own noise band.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
$jobs = @(
  @{ name = 'full-r1';  config = 'stryker.full.json' },
  @{ name = 'gates-r1'; config = 'stryker.gates.json' },
  @{ name = 'core-r5-longtimeout'; config = 'stryker.core-longtimeout.json' },
  @{ name = 'core-r6-longtimeout'; config = 'stryker.core-longtimeout.json' }
)
foreach ($j in $jobs) {
  $out = "artifacts/stryker/$($j.name)"
  if (Test-Path $out) { Remove-Item $out -Recurse -Force }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  # NB: `-c` is Stryker's --concurrency, not --configFile. The config file is positional.
  pnpm exec stryker run $j.config 2>&1 | Tee-Object -FilePath "artifacts/stryker-$($j.name).log" | Out-Null
  $exit = $LASTEXITCODE
  $sw.Stop()
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  if (Test-Path artifacts/stryker/current) { Move-Item artifacts/stryker/current/* $out -Force -ErrorAction SilentlyContinue }
  "$($j.name) WALL_SECONDS $([math]::Round($sw.Elapsed.TotalSeconds,1)) EXIT $exit" | Tee-Object -FilePath artifacts/stryker-rest-walls.txt -Append
}
"ALL DONE" | Tee-Object -FilePath artifacts/stryker-rest-walls.txt -Append
