#requires -version 5.1
Set-Location -Path $PSScriptRoot

$pythonCmd = $null
foreach ($candidate in @('python', 'python3')) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $pythonCmd = $candidate
        break
    }
}

Start-Process "http://localhost:8123"

if ($pythonCmd) {
    Write-Host "Starting no-cache local server on http://localhost:8123 (via $pythonCmd) ..."
    # serve_nocache.py forces no-store so a plain reload always gets fresh code.
    & $pythonCmd serve_nocache.py 8123
} else {
    Write-Host "Python not found -- falling back to 'npx serve'."
    npx serve -l 8123 .
}
