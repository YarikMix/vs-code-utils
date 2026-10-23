param(
    [Parameter(Mandatory = $true)]
    [string]$Endpoint,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$SessionId
)

$ErrorActionPreference = 'Stop'
try {
    $response = Invoke-WebRequest -Method Post -Uri "$Endpoint/$SessionId" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -ne 202) {
        throw "Unexpected response: $($response.StatusCode)"
    }
    Write-Output "Codex session requested: $SessionId"
} catch {
    Write-Error "Codex Ops could not open the session: $($_.Exception.Message)"
    exit 1
}
