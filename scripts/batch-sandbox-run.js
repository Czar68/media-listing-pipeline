process.env.EXECUTION_MODE = 'sandbox';
process.env.ENABLE_SANDBOX = 'true';
process.env.EBAY_ENV = 'sandbox';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { runBatch } = require('../adapters/media-pipeline/dist/runBatch');

async function main() {
  let limit = 5;
  const limitIndex = process.argv.indexOf('--limit');
  if (limitIndex !== -1 && limitIndex + 1 < process.argv.length) {
    const parsed = parseInt(process.argv[limitIndex + 1], 10);
    if (!isNaN(parsed)) {
      limit = parsed;
    }
  }

  const draftsDir = path.join(__dirname, '..', 'data', 'drafts');
  if (!fs.existsSync(draftsDir)) {
    process.stderr.write('Drafts directory not found\n');
    process.exit(1);
  }

  const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('.json'));
  let validDrafts = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(draftsDir, file), 'utf-8');
    try {
      const draft = JSON.parse(content);
      if (draft.draft_status === 'READY_TO_PUBLISH') {
        validDrafts.push(draft);
      }
    } catch (err) {
      process.stderr.write('[WARN] Skipping unparseable draft: ' + file + ' ' + String(err) + '\n');
    }
  }

  process.stdout.write(`Found ${validDrafts.length} READY_TO_PUBLISH drafts.\n`);

  if (validDrafts.length === 0) {
    process.stdout.write('No drafts to process. Exiting.\n');
    process.exit(0);
  }

  const draftsToProcess = validDrafts.slice(0, limit);
  process.stdout.write(`Limiting batch to ${draftsToProcess.length} drafts.\n`);

  const rawItems = draftsToProcess.map(draft => {
    const manifest = draft.source_manifest || {};
    const identity = manifest.identity || {};
    return {
      source: 'media-listing-pipeline',
      externalId: manifest.raw_identifier,
      title: identity.title || draft.title || '',
      description: draft.description,
      mediaType: 'image',
      files: manifest.image_paths || [],
      capturedAt: new Date().toISOString(),
      metadata: {
        upc: identity.upc,
        platform: identity.platform,
        imagePaths: manifest.image_paths,
        listingStrategy: {
          pricing: {
            basePrice: draft.financials ? draft.financials.listing_price : undefined
          }
        }
      }
    };
  });

  const { MediaAdapterImpl } = require('../adapters/media-pipeline/dist/mediaAdapter');
  const adapter = new MediaAdapterImpl();
  
  const canonicalBindingBySku = new Map();
  for (const item of rawItems) {
    const sku = adapter.normalize(item).sku;
    canonicalBindingBySku.set(sku, {
      canonicalEpid: 'SANDBOX_PLACEHOLDER',
      status: 'RESOLVED',
    });
  }

  const result = await runBatch(rawItems, canonicalBindingBySku);
  
  process.stdout.write('\n--- Sandbox Batch Summary ---\n');
  process.stdout.write(`Total Attempted: ${rawItems.length}\n`);
  process.stdout.write(`Success: ${result.listings.length}\n`);
  process.stdout.write(`Failed: ${result.failures.length}\n`);

  if (result.listings.length > 0) {
    process.stdout.write('\nSuccessful Listings:\n');
    for (const l of result.listings) {
      process.stdout.write(`- SKU ${l.sku} | OfferId: ${l.offerId} | ListingId: ${l.listingId || '(none)'}\n`);
    }
  }

  if (result.failures.length > 0) {
    process.stderr.write('\nFailures:\n');
    for (const f of result.failures) {
      process.stderr.write(`- SKU ${f.sku}: ${f.message}\n`);
    }
    process.exit(1);
  } else {
    process.stdout.write('\nAll drafts passed sandbox execution successfully!\n');
    process.exit(0);
  }
}

main().catch(err => {
  process.stderr.write('Unhandled error during sandbox batch run: ' + String(err) + '\n');
  process.exit(1);
});
