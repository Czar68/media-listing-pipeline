Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$authScript = Join-Path $PSScriptRoot "ebay-auth.ps1"
$inventoryScript = Join-Path $PSScriptRoot "ebay-inventory.ps1"
$listingCreateScript = Join-Path $PSScriptRoot "ebay-listing-create.ps1"
$stateContractScript = Join-Path $PSScriptRoot "ebay-state-contract.ps1"
. $authScript
. $inventoryScript
. $listingCreateScript
. $stateContractScript

$script:EbaySandboxRoot = "https://api.sandbox.ebay.com"
$script:EbayJsonWriteHeaders = @{ "Content-Language" = "en-US" }

function Get-HttpStatusFromError {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)
    for ($ex = $ErrorRecord.Exception; $ex; $ex = $ex.InnerException) {
        $web = $ex -as [System.Net.WebException]
        if ($null -ne $web -and $null -ne $web.Response -and $null -ne $web.Response.StatusCode) {
            return [int]$web.Response.StatusCode
        }
    }
    return $null
}

function Read-eBayApiErrorBody {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)
    try {
        if ($null -ne $ErrorRecord.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($ErrorRecord.ErrorDetails.Message)) {
            return $ErrorRecord.ErrorDetails.Message.Trim()
        }

        $response = $null
        for ($ex = $ErrorRecord.Exception; $ex; $ex = $ex.InnerException) {
            $web = $ex -as [System.Net.WebException]
            if ($null -ne $web -and $null -ne $web.Response) {
                $response = $web.Response
                break
            }
        }
        if ($null -eq $response) {
            return $null
        }
        $stream = $response.GetResponseStream()
        if ($null -eq $stream) {
            return $null
        }
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        $reader.Close()
        return $text
    } catch {
        return $null
    }
}

function Get-eBayApiFriendlyErrorMessage {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)

    $status = Get-HttpStatusFromError -ErrorRecord $ErrorRecord
    $bodyText = Read-eBayApiErrorBody -ErrorRecord $ErrorRecord

    if ($status -eq 401) {
        return "Token invalid or expired"
    }
    if ($status -eq 403) {
        return "Missing required OAuth scope"
    }
    if (-not [string]::IsNullOrWhiteSpace($bodyText) -and $bodyText -match '20403|Business Policy') {
        return "Business Policies not enabled - cannot create offer"
    }
    if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
        return $bodyText
    }
    if ($null -ne $ErrorRecord.Exception -and -not [string]::IsNullOrWhiteSpace($ErrorRecord.Exception.Message)) {
        return $ErrorRecord.Exception.Message
    }
    return "Unknown API error"
}

function Test-IsOfferPublished {
    param($Offer)

    if ($null -eq $Offer) {
        return $false
    }

    $offerStatus = ""
    if ($null -ne $Offer.status) {
        $offerStatus = [string]$Offer.status
    } elseif ($null -ne $Offer.offerStatus) {
        $offerStatus = [string]$Offer.offerStatus
    }

    $listingStatus = ""
    if ($null -ne $Offer.listing && $null -ne $Offer.listing.listingStatus) {
        $listingStatus = [string]$Offer.listing.listingStatus
    }

    if ($offerStatus -match 'PUBLISHED|PUBLISH|LISTED') {
        return $true
    }
    if ($listingStatus -match 'ACTIVE|PUBLISHED|LISTED') {
        return $true
    }

    return $false
}

function Get-eBayOffers {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SKU
    )

    $encodedSku = [System.Uri]::EscapeDataString($SKU)
    $url = "$script:EbaySandboxRoot/sell/inventory/v1/offer?sku=$encodedSku&limit=200&offset=0"
    try {
        $resp = Invoke-eBayAPI -Url $url -Method GET
        $offers = @($resp.offers)
        return $offers
    } catch {
        $status = Get-HttpStatusFromError -ErrorRecord $_
        if ($status -eq 401 -or $status -eq 403) {
            Write-Host (Get-eBayApiFriendlyErrorMessage -ErrorRecord $_)
            return @()
        }
        throw
    }
}

function Create-eBayOffer {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SKU,
        [Parameter(Mandatory = $true)]
        [decimal]$Price
    )

    $locKey = Get-eBaySandboxMerchantLocationKey
    if ([string]::IsNullOrWhiteSpace($locKey)) {
        return @{
            success  = $false
            offerId  = $null
            state    = "INVENTORY_ONLY"
            message  = "No enabled merchant location in sandbox - cannot create offer"
            code     = "MISSING_LOCATION"
        }
    }

    $policies = Get-eBaySandboxListingPolicyIds
    if ($null -eq $policies) {
        return @{
            success  = $false
            offerId  = $null
            state    = "INVENTORY_ONLY"
            message  = "Business Policies not enabled - cannot create offer"
            code     = "MISSING_POLICIES"
        }
    }

    $priceString = $Price.ToString("0.##", [System.Globalization.CultureInfo]::InvariantCulture)
    $offerPayload = @{
        sku                 = $SKU
        marketplaceId       = "EBAY_US"
        format              = "FIXED_PRICE"
        listingDescription  = "Generated by listing orchestrator for $SKU"
        merchantLocationKey = $locKey
        categoryId          = "267"
        listingPolicies     = @{
            fulfillmentPolicyId = $policies.FulfillmentPolicyId
            paymentPolicyId     = $policies.PaymentPolicyId
            returnPolicyId      = $policies.ReturnPolicyId
        }
        pricingSummary      = @{
            price = @{
                currency = "USD"
                value    = $priceString
            }
        }
        availableQuantity   = 1
        listingDuration     = "GTC"
    }

    $createUrl = "$script:EbaySandboxRoot/sell/inventory/v1/offer"
    try {
        $createResp = Invoke-eBayAPI -Url $createUrl -Method POST -Body $offerPayload -AdditionalHeaders $script:EbayJsonWriteHeaders
        $offerId = $null
        if ($null -ne $createResp -and $null -ne $createResp.offerId) {
            $offerId = [string]$createResp.offerId
        }

        if ([string]::IsNullOrWhiteSpace($offerId)) {
            return @{
                success = $false
                offerId = $null
                state   = "INVENTORY_ONLY"
                message = "Offer create returned no offerId"
                code    = "CREATE_NO_OFFER_ID"
            }
        }

        return @{
            success = $true
            offerId = $offerId
            state   = "OFFER_CREATED"
            message = "Offer created"
            code    = "OK"
        }
    } catch {
        $friendly = Get-eBayApiFriendlyErrorMessage -ErrorRecord $_
        if ($friendly -eq "Business Policies not enabled - cannot create offer") {
            return @{
                success = $false
                offerId = $null
                state   = "INVENTORY_ONLY"
                message = $friendly
                code    = "20403"
            }
        }
        if ($friendly -eq "Token invalid or expired" -or $friendly -eq "Missing required OAuth scope") {
            return @{
                success = $false
                offerId = $null
                state   = "INVENTORY_ONLY"
                message = $friendly
                code    = "AUTH"
            }
        }
        return @{
            success = $false
            offerId = $null
            state   = "INVENTORY_ONLY"
            message = $friendly
            code    = "API_ERROR"
        }
    }
}

function Publish-eBayOffer {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$OfferId
    )

    $publishUrl = "$script:EbaySandboxRoot/sell/inventory/v1/offer/$OfferId/publish"
    try {
        $publishResp = Invoke-eBayAPI -Url $publishUrl -Method POST -Body $null
        return @{
            success = $true
            state   = "PUBLISHED"
            message = "Offer published"
            payload = $publishResp
        }
    } catch {
        return @{
            success = $false
            state   = "OFFER_CREATED"
            message = (Get-eBayApiFriendlyErrorMessage -ErrorRecord $_)
            payload = $null
        }
    }
}

function Get-InventoryItemState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SKU
    )

    $encodedSku = [System.Uri]::EscapeDataString($SKU)
    $url = "$script:EbaySandboxRoot/sell/inventory/v1/inventory_item/$encodedSku"

    try {
        $null = Invoke-eBayAPI -Url $url -Method GET
        return "INVENTORY_ONLY"
    } catch {
        $status = Get-HttpStatusFromError -ErrorRecord $_
        if ($status -eq 404) {
            return "NOT_FOUND"
        }
        $friendly = Get-eBayApiFriendlyErrorMessage -ErrorRecord $_
        Write-Host $friendly
        return "INVENTORY_ONLY"
    }
}

function Get-OfferState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SKU
    )

    $offers = Get-eBayOffers -SKU $SKU
    if ($offers.Count -eq 0) {
        return @{
            state   = "INVENTORY_ONLY"
            offerId = $null
        }
    }

    if ($offers.Count -gt 1) {
        throw "Invalid state: multiple offers found for SKU"
    }

    $offer = $offers[0]
    if (Test-IsOfferPublished -Offer $offer) {
        return @{
            state   = "PUBLISHED"
            offerId = [string]$offer.offerId
        }
    }

    return @{
        state   = "OFFER_CREATED"
        offerId = [string]$offer.offerId
    }
}

function Test-IsAllowedStateTransition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$FromState,
        [Parameter(Mandatory = $true)]
        [string]$ToState
    )

    if ($FromState -eq $ToState) {
        return $true
    }

    $allowed = @{
        "NOT_FOUND"      = @("INVENTORY_ONLY")
        "INVENTORY_ONLY" = @("OFFER_CREATED")
        "OFFER_CREATED"  = @("PUBLISHED")
        "PUBLISHED"      = @()
    }

    if (-not $allowed.ContainsKey($FromState)) {
        return $false
    }
    return ($allowed[$FromState] -contains $ToState)
}

function Get-eBayListingState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SKU
    )

    $inventoryState = Get-InventoryItemState -SKU $SKU
    if ($inventoryState -eq "NOT_FOUND") {
        return @{
            state   = "NOT_FOUND"
            offerId = $null
        }
    }

    $offerState = Get-OfferState -SKU $SKU
    return @{
        state   = $offerState.state
        offerId = $offerState.offerId
    }
}

function Publish-eBayListing {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SKU,
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [decimal]$Price,
        [Parameter()]
        [string]$Condition = "NEW"
    )

    $maxAttempts = 3
    $attempt = 0
    $lastMessage = "No action required"
    $offerId = $null

    while ($attempt -lt $maxAttempts) {
        $attempt++
        $stateInfo = Get-eBayListingState -SKU $SKU
        $state = [string]$stateInfo.state
        $offerId = $stateInfo.offerId

        if ($state -eq "PUBLISHED") {
            Write-Host "[STATE] $state -> $state"
            Write-Host "[ACTION] none"
            Write-Host "[VERIFY] state=$state"
            break
        }

        switch ($state) {
            "NOT_FOUND" {
                $expectedNext = "INVENTORY_ONLY"
                Write-Host "[STATE] $state -> $expectedNext"
                Write-Host "[ACTION] Upserting inventory (PUT)"
                try {
                    $null = Create-eBayListing -SKU $SKU -Title $Title -Price $Price -Condition $Condition
                } catch {
                    $lastMessage = Get-eBayApiFriendlyErrorMessage -ErrorRecord $_
                    break
                }
                $verify = Get-eBayListingState -SKU $SKU
                Write-Host "[VERIFY] state=$($verify.state)"
                if (-not (Test-IsAllowedStateTransition -FromState $state -ToState $verify.state)) {
                    throw ("Invalid state transition: {0} -> {1}" -f $state, $verify.state)
                }
                $lastMessage = "Inventory item created"
            }
            "INVENTORY_ONLY" {
                $expectedNext = "OFFER_CREATED"
                Write-Host "[STATE] $state -> $expectedNext"
                Write-Host "[ACTION] Upserting inventory (PUT)"
                try {
                    $null = Create-eBayListing -SKU $SKU -Title $Title -Price $Price -Condition $Condition
                } catch {
                    $lastMessage = Get-eBayApiFriendlyErrorMessage -ErrorRecord $_
                    break
                }
                Write-Host "[ACTION] create offer"
                $offerCreate = Create-eBayOffer -SKU $SKU -Price $Price
                if (-not $offerCreate.success) {
                    $verify = Get-eBayListingState -SKU $SKU
                    Write-Host "[VERIFY] state=$($verify.state)"
                    $offerId = $verify.offerId
                    $lastMessage = $offerCreate.message
                    break
                }
                $offerId = $offerCreate.offerId
                $verify = Get-eBayListingState -SKU $SKU
                Write-Host "[VERIFY] state=$($verify.state)"
                if (-not (Test-IsAllowedStateTransition -FromState $state -ToState $verify.state)) {
                    throw ("Invalid state transition: {0} -> {1}" -f $state, $verify.state)
                }
                $lastMessage = "Offer created"
            }
            "OFFER_CREATED" {
                $expectedNext = "PUBLISHED"
                Write-Host "[STATE] $state -> $expectedNext"
                if ([string]::IsNullOrWhiteSpace($offerId)) {
                    $offerInfo = Get-OfferState -SKU $SKU
                    $offerId = $offerInfo.offerId
                }
                if ([string]::IsNullOrWhiteSpace($offerId)) {
                    Write-Host "[ACTION] publish offer skipped (missing offerId)"
                    $verify = Get-eBayListingState -SKU $SKU
                    Write-Host "[VERIFY] state=$($verify.state)"
                    $lastMessage = "Offer exists but offerId could not be determined for publish step"
                    break
                }

                Write-Host "[ACTION] publish offer"
                $publish = Publish-eBayOffer -OfferId $offerId
                $verify = Get-OfferState -SKU $SKU
                Write-Host "[VERIFY] state=$($verify.state)"

                if ($verify.state -eq "PUBLISHED") {
                    if (-not (Test-IsAllowedStateTransition -FromState $state -ToState "PUBLISHED")) {
                        throw ("Invalid state transition: {0} -> PUBLISHED" -f $state)
                    }
                    $lastMessage = "Listing is published"
                } else {
                    $lastMessage = "Publish attempted but not confirmed"
                    break
                }
            }
            default {
                throw ("Invalid state: {0}" -f $state)
            }
        }
    }

    $final = Get-eBayListingState -SKU $SKU
    $finalState = [string]$final.state
    $offerId = $final.offerId
    Write-Host ("Final state: {0}" -f $finalState)

    if ($finalState -eq "PUBLISHED") {
        return [pscustomobject]@{
            sku     = $SKU
            state   = "PUBLISHED"
            offerId = $offerId
            message = "Listing is published"
        }
    }

    return [pscustomobject]@{
        sku     = $SKU
        state   = $finalState
        offerId = $offerId
        message = $lastMessage
    }
}

if ($MyInvocation.InvocationName -ne ".") {
    Publish-eBayListing `
        -SKU "TEST-SKU-ORCH-001" `
        -Title "Orchestrator Test Item" `
        -Price 19.99
}
