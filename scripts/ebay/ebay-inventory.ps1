Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$authScript = Join-Path $PSScriptRoot "ebay-auth.ps1"
. $authScript

function Get-HttpStatusFromError {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)
    for ($ex = $ErrorRecord.Exception; $ex; $ex = $ex.InnerException) {
        if ($ex.Response -and $ex.Response.StatusCode) {
            return [int]$ex.Response.StatusCode
        }
    }
    return $null
}

function Write-eBayInventorySummary {
    param(
        [Parameter(Mandatory = $true)]
        $Response
    )

    $items = @()
    if ($null -ne $Response -and $null -ne $Response.inventoryItems) {
        $items = @($Response.inventoryItems)
    }

    $totalFromApi = $null
    if ($null -ne $Response -and $null -ne $Response.total) {
        $totalFromApi = $Response.total
    }

    $count = $items.Count
    Write-Host ""
    Write-Host "--- eBay inventory summary (sandbox) ---"
    if ($null -ne $totalFromApi) {
        Write-Host "Total (API): $totalFromApi"
    }
    Write-Host "Items on this page: $count"
    Write-Host ""

    if ($count -eq 0) {
        Write-Host "No inventory in sandbox account"
        return
    }

    $i = 0
    foreach ($item in $items) {
        $i++
        $sku = if ($item.sku) { $item.sku } else { "(no sku)" }
        $title = $null
        if ($null -ne $item.product) {
            $title = $item.product.title
        }
        if ([string]::IsNullOrWhiteSpace($title)) {
            $title = "(no title)"
        }
        Write-Host ("[{0}] SKU: {1}" -f $i, $sku)
        Write-Host ("     Title: {0}" -f $title)
    }
    Write-Host ""
}

function Get-eBayInventory {
    [CmdletBinding()]
    param()

    $baseUrl = "https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item"
    $uri = "{0}?limit=200&offset=0" -f $baseUrl

    try {
        $result = Invoke-eBayAPI -Url $uri -Method GET
    } catch {
        $status = Get-HttpStatusFromError -ErrorRecord $_
        if ($status -eq 401) {
            Write-Host "Token invalid or expired"
        } elseif ($status -eq 403) {
            Write-Host "Insufficient scope (update OAuth scopes later)"
        } elseif ($_.Exception.Message -match '\b401\b|Unauthorized') {
            Write-Host "Token invalid or expired"
        } elseif ($_.Exception.Message -match '\b403\b|Forbidden') {
            Write-Host "Insufficient scope (update OAuth scopes later)"
        }
        throw
    }

    Write-eBayInventorySummary -Response $result
    return $result
}

Write-Host "Fetching eBay inventory..."
$result = Get-eBayInventory
$result
