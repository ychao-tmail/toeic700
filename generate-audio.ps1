$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$projectRoot = $PSScriptRoot
$audioRoot = Join-Path $projectRoot 'dist\audio'
New-Item -ItemType Directory -Path $audioRoot -Force | Out-Null
$audioEntries = Get-Content -LiteralPath (Join-Path $projectRoot 'audio-source.json') -Raw | ConvertFrom-Json
$audioEngine = New-Object System.Speech.Synthesis.SpeechSynthesizer
$audioEngine.SelectVoice('Microsoft Zira Desktop')
$audioEngine.Rate = -1
$audioFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
try {
    foreach ($entry in $audioEntries) {
        $audioPath = Join-Path $audioRoot ($entry.id + '.wav')
        $audioEngine.SetOutputToWaveFile($audioPath, $audioFormat)
        $audioEngine.Speak(($entry.transcript -replace '(?m)^[A-Za-z ]+:\s*', ''))
        $audioEngine.SetOutputToNull()
        Write-Output ($entry.id + ' audio ready')
    }
} finally {
    $audioEngine.Dispose()
}
