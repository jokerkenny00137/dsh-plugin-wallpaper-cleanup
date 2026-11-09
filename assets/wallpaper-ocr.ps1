param(
  [Parameter(Mandatory = $true)][string]$ImagePath,
  [Parameter(Mandatory = $true)][string]$OutJson,
  [string]$Lang = 'zh-Hans-CN',
  [string]$Scales = '3,4,5',
  [int]$MaxBadgePixels = 40000
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing

# ---------------------------------------------------------------- WinRT async
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($op, $type) {
  $asTask = $asTaskGeneric.MakeGenericMethod($type)
  $task = $asTask.Invoke($null, @($op))
  try { $task.Wait(-1) | Out-Null }
  catch {
    $e = $_.Exception
    while ($e.InnerException) { $e = $e.InnerException }
    throw $e.Message
  }
  $task.Result
}

[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

function Get-OcrEngine([string]$tag) {
  if ($tag) {
    $lang = New-Object Windows.Globalization.Language $tag
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
    if ($engine) { return $engine }
  }
  return [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}

$engine = Get-OcrEngine $Lang
if (-not $engine) { throw "no OCR engine available for '$Lang' or user profile languages" }

function Invoke-OcrBytes([byte[]]$bytes, [double]$scale) {
  $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $writer = New-Object Windows.Storage.Streams.DataWriter $stream
  $writer.WriteBytes($bytes)
  [void](Await ($writer.StoreAsync()) ([uint32]))
  $writer.DetachStream() | Out-Null
  $stream.Seek(0)
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $software = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($software)) ([Windows.Media.Ocr.OcrResult])
  $out = New-Object System.Collections.ArrayList
  foreach ($line in $result.Lines) {
    $x1 = [double]::MaxValue; $y1 = [double]::MaxValue
    $x2 = [double]::MinValue; $y2 = [double]::MinValue
    foreach ($word in $line.Words) {
      $r = $word.BoundingRect
      $wx = [double]$r.X; $wy = [double]$r.Y; $ww = [double]$r.Width; $wh = [double]$r.Height
      if ($wx -lt $x1) { $x1 = $wx }
      if ($wy -lt $y1) { $y1 = $wy }
      if (($wx + $ww) -gt $x2) { $x2 = $wx + $ww }
      if (($wy + $wh) -gt $y2) { $y2 = $wy + $wh }
    }
    if ($x1 -eq [double]::MaxValue) { continue }
    [void]$out.Add([ordered]@{
        text  = $line.Text
        x     = [int][math]::Round($x1 / $scale)
        y     = [int][math]::Round($y1 / $scale)
        w     = [int][math]::Round(($x2 - $x1) / $scale)
        h     = [int][math]::Round(($y2 - $y1) / $scale)
        scale = $scale
      })
  }
  $stream.Dispose()
  return $out
}

function Convert-BitmapToPngBytes($bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return $bytes
}

function Resize-Bitmap($source, [double]$scale) {
  $w = [int][math]::Round($source.Width * $scale)
  $h = [int][math]::Round($source.Height * $scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.DrawImage($source, 0, 0, $w, $h)
  $g.Dispose()
  return $bmp
}

# ---------------------------------------------------------------- load image
$source = [System.Drawing.Image]::FromFile($ImagePath)
$W = $source.Width
$H = $source.Height

$scanBmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($scanBmp)
$g.DrawImage($source, 0, 0, $W, $H)
$g.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$data = $scanBmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride = $data.Stride
$pixels = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $pixels.Length)
$scanBmp.UnlockBits($data)
$scanBmp.Dispose()

# ------------------------------------------------- badge fill colour detection
# Wallpaper Engine's subscription badge is a vivid blue square in the tile's
# top-right corner. Find the most frequent vivid-blue colour; artwork blues are
# varied, the badge fill is one exact colour repeated ~300 times per tile.
$counts = @{}
for ($y = 0; $y -lt $H; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $W; $x++) {
    $o = $row + $x * 3
    $b = $pixels[$o]; $gg = $pixels[$o + 1]; $r = $pixels[$o + 2]
    if ($b -ge 200 -and $r -le 110 -and $gg -ge 90 -and $gg -le 185 -and ($b - $r) -ge 140) {
      $key = $r * 65536 + $gg * 256 + $b
      if ($counts.ContainsKey($key)) { $counts[$key]++ } else { $counts[$key] = 1 }
    }
  }
}

$fillKey = -1
$fillCount = 0
foreach ($k in $counts.Keys) {
  if ($counts[$k] -gt $fillCount) { $fillCount = $counts[$k]; $fillKey = $k }
}
if ($fillKey -lt 0) { throw 'no vivid blue pixels found; is this a Wallpaper Engine subscription screenshot?' }

$fr = [int][math]::Floor($fillKey / 65536)
$fg = [int][math]::Floor(($fillKey % 65536) / 256)
$fb = [int]($fillKey % 256)

# ---------------------------------------------------------- connected clusters
$mask = New-Object byte[] ($W * $H)
for ($y = 0; $y -lt $H; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $W; $x++) {
    $o = $row + $x * 3
    $b = $pixels[$o]; $gg = $pixels[$o + 1]; $r = $pixels[$o + 2]
    if ([math]::Abs($r - $fr) -le 2 -and [math]::Abs($gg - $fg) -le 2 -and [math]::Abs($b - $fb) -le 2) {
      $mask[$y * $W + $x] = 1
    }
  }
}
$pixels = $null

$visited = New-Object byte[] ($W * $H)
$queue = New-Object 'System.Collections.Generic.Queue[int]'
$badges = New-Object System.Collections.ArrayList
$offsets = @(
  @(-1, -1), @(0, -1), @(1, -1),
  @(-1, 0), @(1, 0),
  @(-1, 1), @(0, 1), @(1, 1)
)

for ($i = 0; $i -lt $mask.Length; $i++) {
  if ($mask[$i] -eq 0 -or $visited[$i] -eq 1) { continue }
  $visited[$i] = 1
  $queue.Clear()
  $queue.Enqueue($i)
  $minX = [int]::MaxValue; $maxX = -1; $minY = [int]::MaxValue; $maxY = -1; $n = 0
  while ($queue.Count -gt 0) {
    $cur = $queue.Dequeue()
    $cy = [int][math]::Floor($cur / $W)
    $cx = $cur - $cy * $W
    $n++
    if ($cx -lt $minX) { $minX = $cx }
    if ($cx -gt $maxX) { $maxX = $cx }
    if ($cy -lt $minY) { $minY = $cy }
    if ($cy -gt $maxY) { $maxY = $cy }
    foreach ($off in $offsets) {
      $nx = $cx + $off[0]; $ny = $cy + $off[1]
      if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $W -or $ny -ge $H) { continue }
      $ni = $ny * $W + $nx
      if ($mask[$ni] -eq 1 -and $visited[$ni] -eq 0) {
        $visited[$ni] = 1
        $queue.Enqueue($ni)
      }
    }
  }
  $bw = $maxX - $minX + 1
  $bh = $maxY - $minY + 1
  $fillRatio = $n / [double]($bw * $bh)
  if ($n -ge 120 -and $bw -ge 14 -and $bw -le 30 -and $bh -ge 14 -and $bh -le 30 -and $fillRatio -ge 0.55) {
    [void]$badges.Add([ordered]@{ x = $minX; y = $minY; w = $bw; h = $bh; px = $n })
  }
}

# De-duplicate nested/overlapping badges, keep topmost-leftmost.
$badgeList = @($badges | Sort-Object { $_.y }, { $_.x })
$final = New-Object System.Collections.ArrayList
foreach ($b in $badgeList) {
  $dup = $false
  foreach ($f in $final) {
    $ox = [math]::Max(0, [math]::Min($b.x + $b.w, $f.x + $f.w) - [math]::Max($b.x, $f.x))
    $oy = [math]::Max(0, [math]::Min($b.y + $b.h, $f.y + $f.h) - [math]::Max($b.y, $f.y))
    if ($ox -gt 0 -and $oy -gt 0 -and ($ox * $oy) -gt (0.4 * $b.w * $b.h)) { $dup = $true; break }
  }
  if (-not $dup) { [void]$final.Add($b) }
}

# ---------------------------------------------------------------- OCR passes
$lines = New-Object System.Collections.ArrayList
$seen = @{}
$scaleList = @($Scales.Split(',') | ForEach-Object { [double]$_ } | Where-Object { $_ -ge 1 })
foreach ($scale in $scaleList) {
  try {
    $scaled = Resize-Bitmap $source $scale
    $bytes = Convert-BitmapToPngBytes $scaled
    $scaled.Dispose()
    $found = Invoke-OcrBytes $bytes $scale
    foreach ($ln in $found) {
      $key = ($ln.text -replace '\s+', '')
      if ($key.Length -lt 1) { continue }
      $pk = "$key|$($ln.x)|$($ln.y)"
      if ($seen.ContainsKey($pk)) { continue }
      $seen[$pk] = 1
      [void]$lines.Add($ln)
    }
  }
  catch {
    # One scale failing must not fail the whole scan.
  }
}
$source.Dispose()

$result = [ordered]@{
  width      = $W
  height     = $H
  badgeColor = @{ r = $fr; g = $fg; b = $fb }
  badges     = @($final | ForEach-Object { [ordered]@{ x = $_.x; y = $_.y; w = $_.w; h = $_.h } })
  lines      = @($lines)
  language   = $engine.RecognizerLanguage.LanguageTag
}

$json = $result | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText($OutJson, $json, (New-Object System.Text.UTF8Encoding($false)))

