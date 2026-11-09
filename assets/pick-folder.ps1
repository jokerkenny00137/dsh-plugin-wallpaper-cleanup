param(
  [Parameter(Mandatory = $true)][string]$OutJson
)

$ErrorActionPreference = 'Stop'
$path = ''
$errorText = ''
$canceled = $false

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = '选择 Wallpaper Engine 工坊内容文件夹（通常以 431960 结尾）'
  $dialog.ShowNewFolderButton = $false
  $default = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\431960'
  if (Test-Path -LiteralPath $default) { $dialog.SelectedPath = $default }

  $owner = New-Object System.Windows.Forms.Form
  $owner.TopMost = $true
  $owner.ShowInTaskbar = $false
  $owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $owner.Size = New-Object System.Drawing.Size 1, 1
  $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
  $owner.Opacity = 0.01
  $owner.Show()
  try { $owner.Activate() } catch {}

  try {
    $result = $dialog.ShowDialog($owner)
  } finally {
    try { $owner.Close() } catch {}
    try { $owner.Dispose() } catch {}
  }

  if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    $path = $dialog.SelectedPath
  } else {
    $canceled = $true
  }
} catch {
  $errorText = $_.Exception.Message
}

$json = ConvertTo-Json -InputObject ([ordered]@{ path = $path; canceled = $canceled; error = $errorText }) -Compress
[System.IO.File]::WriteAllText($OutJson, $json, (New-Object System.Text.UTF8Encoding($false)))
