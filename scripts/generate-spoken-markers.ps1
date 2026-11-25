# Generate local listening-test fixtures using the installed Windows English voices.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$directory = Join-Path (Split-Path -Parent $PSScriptRoot) '.verification/spoken-markers'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
    44100,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
)
$markers = @(
    @{ Name = 'daily-one'; Text = 'Daily radio, one.'; Voice = 'Microsoft David Desktop' }
    @{ Name = 'daily-two'; Text = 'Daily radio, two.'; Voice = 'Microsoft David Desktop' }
    @{ Name = 'special-alpha'; Text = 'Special program, alpha.'; Voice = 'Microsoft Zira Desktop' }
    @{ Name = 'special-bravo'; Text = 'Special program, bravo.'; Voice = 'Microsoft Zira Desktop' }
)

$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
    $synth.Rate = -1
    foreach ($marker in $markers) {
        $synth.SelectVoice($marker.Voice)
        $prompt = [System.Speech.Synthesis.PromptBuilder]::new([cultureinfo]'en-US')
        $prompt.AppendBreak([timespan]::FromMilliseconds(250))
        for ($i = 0; $i -lt 3; $i++) {
            $prompt.AppendText($marker.Text)
            $prompt.AppendBreak([timespan]::FromMilliseconds(650))
        }
        $path = Join-Path $directory ('CDR-spoken-' + $marker.Name + '.wav')
        $synth.SetOutputToWaveFile($path, $format)
        $synth.Speak($prompt)
        $synth.SetOutputToNull()
        Get-Item -LiteralPath $path | Select-Object Name, Length
    }
} finally {
    $synth.Dispose()
}
