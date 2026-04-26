Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$authScript = Join-Path $PSScriptRoot "ebay-auth.ps1"
. $authScript

$script:EbaySandboxRoot = "https://api.sandbox.ebay.com"
# eBay Sell Inventory requires Content-Language on create/replace inventory item and create offer (see API docs).
$script:EbayJsonWriteHeaders = @{ "Content-Language" = "en-US" }

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

function Write-eBayApiFailureDetails {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)

    $status = Get-HttpStatusFromError -ErrorRecord $ErrorRecord
    if ($status -eq 401) {
        Write-Host "Token invalid or expired"
    } elseif ($status -eq 403) {
        Write-Host "Missing required OAuth scope for write operations"
    } elseif ($status -eq 409) {
        Write-Host "SKU already exists (update instead of create)"
    }

    $bodyText = Read-eBayApiErrorBody -ErrorRecord $ErrorRecord
    if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
        Write-Host "API response body:"
        Write-Host $bodyText
    } elseif ($null -ne $ErrorRecord.Exception.Message) {
        Write-Host $ErrorRecord.Exception.Message
    }
}

function Get-eBaySandboxMerchantLocationKey {
    $url = "$script:EbaySandboxRoot/sell/inventory/v1/location?limit=20&offset=0"
    $resp = Invoke-eBayAPI -Url $url -Method GET
    $locs = @($resp.locations)
    if ($locs.Count -eq 0) {
        return $null
    }
    foreach ($loc in $locs) {
        if ($loc.merchantLocationStatus -eq "ENABLED" -and $loc.merchantLocationKey) {
            return [string]$loc.merchantLocationKey
        }
    }
    if ($locs[0].merchantLocationKey) {
        return [string]$locs[0].merchantLocationKey
    }
    return $null
}

function Get-eBaySandboxListingPolicyIds {
    param(
        [string]$FulfillmentPolicyId = $null,
        [string]$PaymentPolicyId = $null,
        [string]$ReturnPolicyId = $null
    )

    if (-not [string]::IsNullOrWhiteSpace($FulfillmentPolicyId) -and
        -not [string]::IsNullOrWhiteSpace($PaymentPolicyId) -and
        -not [string]::IsNullOrWhiteSpace($ReturnPolicyId)) {
        return @{
            FulfillmentPolicyId = $FulfillmentPolicyId
            PaymentPolicyId     = $PaymentPolicyId
            ReturnPolicyId      = $ReturnPolicyId
        }
    }

    $m = "EBAY_US"
    $ful = $null
    $pay = $null
    $ret = $null
    try {
        $ful = Invoke-eBayAPI -Url "$script:EbaySandboxRoot/sell/account/v1/fulfillment_policy?marketplace_id=$m" -Method GET
        $pay = Invoke-eBayAPI -Url "$script:EbaySandboxRoot/sell/account/v1/payment_policy?marketplace_id=$m" -Method GET
        $ret = Invoke-eBayAPI -Url "$script:EbaySandboxRoot/sell/account/v1/return_policy?marketplace_id=$m" -Method GET
    } catch {
        $bodyText = Read-eBayApiErrorBody -ErrorRecord $_
        if ($bodyText -match '20403|not eligible for Business Policy|Business Policy') {
            Write-Host "Offer step skipped: seller is not opted in to Business Policies (Account API). Opt in for sandbox or pass -FulfillmentPolicyId, -PaymentPolicyId, and -ReturnPolicyId."
        } else {
            Write-Host "Offer step skipped: could not read business policies (Account API)."
            if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
                Write-Host $bodyText
            }
        }
        return $null
    }

    $fp = $null
    $fulList = @($ful.fulfillmentPolicies)
    if ($fulList.Count -gt 0) {
        $fp = [string]$fulList[0].fulfillmentPolicyId
    }
    $pp = $null
    $payList = @($pay.paymentPolicies)
    if ($payList.Count -gt 0) {
        $pp = [string]$payList[0].paymentPolicyId
    }
    $rp = $null
    $retList = @($ret.returnPolicies)
    if ($retList.Count -gt 0) {
        $rp = [string]$retList[0].returnPolicyId
    }

    if ([string]::IsNullOrWhiteSpace($fp) -or [string]::IsNullOrWhiteSpace($pp) -or [string]::IsNullOrWhiteSpace($rp)) {
        Write-Host "Offer step skipped: no fulfillment, payment, or return policies returned for EBAY_US. Create policies in sandbox or pass policy IDs."
        return $null
    }

    return @{
        FulfillmentPolicyId = $fp
        PaymentPolicyId     = $pp
        ReturnPolicyId      = $rp
    }
}

function New-eBaySandboxOfferAndPublish {
    param(
        [string]$Sku,
        [string]$Title,
        [decimal]$Price,
        [string]$FulfillmentPolicyId = $null,
        [string]$PaymentPolicyId = $null,
        [string]$ReturnPolicyId = $null
    )

    # Visible sandbox listing path: inventory_item (PUT, done by caller) -> createOffer -> publishOffer.
    # createOffer requires business policies (Account API) and merchantLocationKey (location API).

    $locKey = Get-eBaySandboxMerchantLocationKey
    if ([string]::IsNullOrWhiteSpace($locKey)) {
        Write-Host "Offer step skipped: no inventory location (merchantLocationKey). Add an enabled location in sandbox."
        return $null
    }

    $policies = Get-eBaySandboxListingPolicyIds `
        -FulfillmentPolicyId $FulfillmentPolicyId `
        -PaymentPolicyId $PaymentPolicyId `
        -ReturnPolicyId $ReturnPolicyId
    if ($null -eq $policies) {
        return $null
    }

    $categoryId = "267"
    $priceString = $Price.ToString("0.##", [System.Globalization.CultureInfo]::InvariantCulture)

    $offerPayload = @{
        sku                 = $Sku
        marketplaceId       = "EBAY_US"
        format              = "FIXED_PRICE"
        listingDescription  = $Title
        merchantLocationKey = $locKey
        categoryId          = $categoryId
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
    $createResp = Invoke-eBayAPI -Url $createUrl -Method POST -Body $offerPayload -AdditionalHeaders $script:EbayJsonWriteHeaders
    if ($null -eq $createResp.offerId) {
        Write-Host "Offer create returned unexpected response."
        return $createResp
    }

    $offerId = [string]$createResp.offerId
    $publishUrl = "$script:EbaySandboxRoot/sell/inventory/v1/offer/$offerId/publish"
    $publishResp = Invoke-eBayAPI -Url $publishUrl -Method POST -Body $null
    return @{
        createOfferResponse  = $createResp
        publishOfferResponse = $publishResp
        offerId              = $offerId
    }
}

function Create-eBayListing {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$SKU,

        [Parameter(Mandatory = $true)]
        [string]$Title,

        [Parameter(Mandatory = $true)]
        [decimal]$Price,

        [Parameter()]
        [string]$Condition = "NEW",

        [Parameter()]
        [string]$FulfillmentPolicyId = $null,

        [Parameter()]
        [string]$PaymentPolicyId = $null,

        [Parameter()]
        [string]$ReturnPolicyId = $null
    )

    $encodedSku = [System.Uri]::EscapeDataString($SKU)
    $putUrl = "$script:EbaySandboxRoot/sell/inventory/v1/inventory_item/$encodedSku"

    # USD price is applied on the offer (Sell Inventory); inventory_item holds product + quantity only.
    # Minimal product: title + description; add imageUrls before publish if eBay requires them for your category.
    $inventoryPayload = @{
        availability = @{
            shipToLocationAvailability = @{
                quantity = 1
            }
        }
        condition    = $Condition
        product      = @{
            title       = $Title
            description = $Title
        }
    }

    $putResponse = $null
    try {
        $putResponse = Invoke-eBayAPI -Url $putUrl -Method PUT -Body $inventoryPayload -AdditionalHeaders $script:EbayJsonWriteHeaders
    } catch {
        Write-eBayApiFailureDetails -ErrorRecord $_
        throw
    }

    Write-Host "SKU: $SKU"
    Write-Host "PUT inventory_item response:"
    if ($null -eq $putResponse) {
        Write-Host "(no response body - typical 204 success)"
    } else {
        $putResponse | ConvertTo-Json -Depth 10
    }

    Write-Host "Listing created/updated successfully"

    $offerResult = $null
    try {
        $offerResult = New-eBaySandboxOfferAndPublish `
            -Sku $SKU `
            -Title $Title `
            -Price $Price `
            -FulfillmentPolicyId $FulfillmentPolicyId `
            -PaymentPolicyId $PaymentPolicyId `
            -ReturnPolicyId $ReturnPolicyId
    } catch {
        Write-Host "Offer or publish failed (inventory item was still saved):"
        Write-eBayApiFailureDetails -ErrorRecord $_
    }

    if ($null -ne $offerResult) {
        Write-Host "Offer / publish response:"
        $offerResult | ConvertTo-Json -Depth 10
    }

    return @{
        inventoryPutResponse = $putResponse
        offerFlow              = $offerResult
    }
}

if ($MyInvocation.InvocationName -ne ".") {
    Create-eBayListing `
        -SKU "TEST-SKU-001" `
        -Title "Test Item from Pipeline" `
        -Price 9.99
}
