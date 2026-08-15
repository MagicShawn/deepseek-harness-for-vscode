param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$target = [System.IO.Path]::GetFullPath($OutputPath)
$parent = [System.IO.Path]::GetDirectoryName($target)
if ([string]::IsNullOrWhiteSpace($parent)) {
  throw 'The icon output path must include a parent directory.'
}
if (-not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Path $parent | Out-Null
}

$bitmap = [System.Drawing.Bitmap]::new(128, 128)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, 128, 128),
  [System.Drawing.ColorTranslator]::FromHtml('#312E81'),
  [System.Drawing.ColorTranslator]::FromHtml('#2563EB'),
  [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
)
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 8)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.FillRectangle($gradient, 0, 0, 128, 128)

  $path.StartFigure()
  $path.AddLine(27, 28, 56, 28)
  $path.AddBezier(56, 28, 86, 28, 102, 43, 102, 64)
  $path.AddBezier(102, 64, 102, 85, 86, 100, 56, 100)
  $path.AddLine(56, 100, 27, 100)
  $path.CloseFigure()

  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawPath($pen, $path)
  $graphics.DrawLine($pen, 50, 46, 50, 82)
  $graphics.DrawLine($pen, 50, 64, 80, 64)
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $pen.Dispose()
  $path.Dispose()
  $gradient.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
