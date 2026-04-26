Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$orchestratorScript = Join-Path (Join-Path $PSScriptRoot "..\ebay") "ebay-listing-orchestrator.ps1"
$stateContractScript = Join-Path (Join-Path $PSScriptRoot "..\ebay") "ebay-state-contract.ps1"
. $stateContractScript
. $orchestratorScript

function Get-PipelineInputItems {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Input path not found: $Path"
    }

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $extension = [System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()

    switch ($extension) {
        ".json" {
            $raw = Get-Content -LiteralPath $resolvedPath -Raw -ErrorAction Stop
            if ([string]::IsNullOrWhiteSpace($raw)) {
                return @()
            }
            $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
            return @($parsed)
        }
        ".csv" {
            return @(Import-Csv -LiteralPath $resolvedPath)
        }
        default {
            throw "Unsupported input format: $extension. Use .json or .csv"
        }
    }
}

function ConvertTo-NormalizedListingItem {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        $Item
    )

    $sku = ""
    if ($null -ne $Item.sku) {
        $sku = [string]$Item.sku
    }

    $title = ""
    if ($null -ne $Item.title) {
        $title = [string]$Item.title
    }

    $priceValue = $null
    $rawPrice = $null
    if ($null -ne $Item.price) {
        $rawPrice = [string]$Item.price
    }

    if (-not [decimal]::TryParse($rawPrice, [System.Globalization.NumberStyles]::Number, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$priceValue)) {
        if (-not [decimal]::TryParse($rawPrice, [ref]$priceValue)) {
            return @{
                isValid = $false
                reason  = "Price must be numeric"
                item    = $null
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($sku)) {
        return @{
            isValid = $false
            reason  = "SKU is required"
            item    = $null
        }
    }

    if ([string]::IsNullOrWhiteSpace($title)) {
        return @{
            isValid = $false
            reason  = "Title is required"
            item    = $null
        }
    }

    return @{
        isValid = $true
        reason  = ""
        item    = [pscustomobject]@{
            sku   = $sku.Trim()
            title = $title.Trim()
            price = [decimal]$priceValue
        }
    }
}

function Invoke-ListingPipeline {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $rows = Get-PipelineInputItems -Path $Path

    $total = @($rows).Count
    $success = 0
    $failed = 0
    $skipped = 0

    foreach ($row in $rows) {
        $normalized = ConvertTo-NormalizedListingItem -Item $row
        if (-not $normalized.isValid) {
            $skipped++
            Write-Host ("[SKIP] Invalid row: {0}" -f $normalized.reason)
            continue
        }

        $item = $normalized.item
        $sku = $item.sku
        Write-Host ("[PIPELINE] Processing SKU {0} ..." -f $sku)

        try {
            $result = Publish-eBayListing -SKU $item.sku -Title $item.title -Price $item.price
            if ($null -eq $result -or [string]::IsNullOrWhiteSpace([string]$result.state)) {
                Write-Host ("[ERROR] Invalid orchestrator response for SKU: {0}" -f $sku)
                $failed++
                Write-Host "[STATUS] fail"
                continue
            }

            $state = [string]$result.state
            if (-not ((Get-ValidEbayStates) -contains $state)) {
                Write-Host ("[ERROR] Unknown state: {0}" -f $state)
                $failed++
                Write-Host "[STATUS] fail"
                continue
            }

            $offerId = $result.offerId
            $message = $result.message

            Write-Host ("[RESULT] state={0}" -f $state)
            Write-Host ("[RESULT] offerId={0}" -f $offerId)
            Write-Host ("[RESULT] message={0}" -f $message)

            if ($state -eq "PUBLISHED") {
                $success++
                Write-Host "[STATUS] success"
            } else {
                $failed++
                Write-Host "[STATUS] fail"
            }
        } catch {
            $failed++
            Write-Host ("[ERROR] SKU failed: {0}" -f $_.Exception.Message)
            Write-Host "[STATUS] fail"
            continue
        }
    }

    Write-Host ""
    Write-Host "=== PIPELINE SUMMARY ==="
    Write-Host ("Total: {0}" -f $total)
    Write-Host ("Success: {0}" -f $success)
    Write-Host ("Failed: {0}" -f $failed)
    Write-Host ("Skipped: {0}" -f $skipped)

    return [pscustomobject]@{
        total   = $total
        success = $success
        failed  = $failed
        skipped = $skipped
    }
}

param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

Invoke-ListingPipeline -Path $Path
