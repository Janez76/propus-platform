Add-Type -AssemblyName System.Drawing

$srcPath = "public\logoheader.png"
$outPng = "public\logo-header.png"

$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $srcPath))

$w = $src.Width
$h = $src.Height

# Find tight bounding box of non-transparent pixels (scan rows/cols with step for speed)
$step = 4
$minX = $w; $maxX = 0; $minY = $h; $maxY = 0

$data = $src.LockBits(
  (New-Object System.Drawing.Rectangle 0, 0, $w, $h),
  [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$stride = $data.Stride
$ptr = $data.Scan0
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($ptr, $bytes, 0, $bytes.Length)
$src.UnlockBits($data)

for ($y = 0; $y -lt $h; $y += $step) {
  $rowStart = $y * $stride
  for ($x = 0; $x -lt $w; $x += $step) {
    $a = $bytes[$rowStart + ($x * 4) + 3]
    if ($a -gt 8) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}

$pad = 20
$minX = [Math]::Max(0, $minX - $pad)
$minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($w - 1, $maxX + $pad)
$maxY = [Math]::Min($h - 1, $maxY + $pad)

$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1

Write-Output "Original: $w x $h"
Write-Output "Cropped:  $cropW x $cropH (offset $minX,$minY)"

$cropRect = New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH
$cropped = $src.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$src.Dispose()

# Target height 240px (retina for ~40-80px display), keep aspect ratio
$targetH = 240
$targetW = [int][Math]::Round($cropW * ($targetH / $cropH))

Write-Output "Target:   $targetW x $targetH"

$out = New-Object System.Drawing.Bitmap $targetW, $targetH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.DrawImage($cropped, 0, 0, $targetW, $targetH)
$g.Dispose()
$cropped.Dispose()

$out.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()

$outSize = (Get-Item $outPng).Length
Write-Output "Saved: $outPng ($([Math]::Round($outSize/1KB, 1)) KB)"
