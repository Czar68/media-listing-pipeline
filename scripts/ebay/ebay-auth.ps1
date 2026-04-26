Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-eBayAccessTokenPath {
    if ($PSScriptRoot) {
        Join-Path $PSScriptRoot "access_token.txt"
    } else {
        Join-Path (Join-Path (Get-Location) "scripts\ebay") "access_token.txt"
    }
}

function Set-eBayTokens {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$AccessToken,

        [Parameter(Mandatory = $true)]
        [string]$RefreshToken
    )

    $dir = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location) "scripts\ebay" }
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $accessPath = Join-Path $dir "access_token.txt"
    $refreshPath = Join-Path $dir "refresh_token.txt"

    Set-Content -LiteralPath $accessPath -Value $AccessToken.Trim() -NoNewline -Force
    Set-Content -LiteralPath $refreshPath -Value $RefreshToken.Trim() -NoNewline -Force

    $Global:eBayAccessToken = $AccessToken.Trim()
    $Global:eBayRefreshToken = $RefreshToken.Trim()
}

function Invoke-eBayAPI {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [string]$Url,

        [Parameter(Position = 1)]
        [ValidateSet("GET", "POST", "PUT", "DELETE")]
        [string]$Method = "GET",

        [Parameter(Position = 2)]
        [AllowNull()]
        $Body,

        [Parameter()]
        [hashtable]$AdditionalHeaders
    )

    $tokenPath = Get-eBayAccessTokenPath
    if (-not (Test-Path -LiteralPath $tokenPath)) {
        throw "Missing access token. Run OAuth flow again."
    }

    $raw = Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop
    $token = if ($null -eq $raw) { "" } else { $raw.Trim() }
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Missing access token. Run OAuth flow again."
    }

    $headers = @{
        Authorization = "Bearer $token"
    }
    if ($null -ne $AdditionalHeaders) {
        foreach ($key in $AdditionalHeaders.Keys) {
            $headers[$key] = $AdditionalHeaders[$key]
        }
    }

    $params = @{
        Uri = $Url
        Method = $Method
        Headers = $headers
    }

    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    try {
        Invoke-RestMethod @params
    } catch {
        # Rethrow the original error record so ErrorDetails.Message (API JSON on 4xx) stays available in PowerShell 5.1+.
        throw
    }
}
