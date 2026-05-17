process.env.EXECUTION_MODE = 'mock';

const fs = require('fs');
const path = require('path');
const { runBatch } = require('../adapters/media-pipeline/dist/runBatch');

async function main() {
  const draftsDir = path.join(__dirname, '..', 'data', 'drafts');
  if (!fs.existsSync(draftsDir)) {
    process.stderr.write('Drafts directory not found\n');
    process.exit(1);
  }

  const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('.json'));
  const rawItems = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(draftsDir, file), 'utf-8');
    try {
      const draft = JSON.parse(content);
      if (draft.draft_status === 'READY_TO_PUBLISH') {
        const manifest = draft.source_manifest || {};
        const identity = manifest.identity || {};
        
        rawItems.push({
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
        });
      }
    } catch (err) {
      process.stderr.write('[WARN] Skipping unparseable draft: ' + file + ' ' + String(err) + '\n');
    }
  }

  process.stdout.write(`Found ${rawItems.length} READY_TO_PUBLISH drafts.\n`);
  
  if (rawItems.length === 0) {
    process.stdout.write('No drafts to process. Exiting.\n');
    process.exit(0);
  }

  const result = await runBatch(rawItems);
  
  process.stdout.write('\n--- Batch Summary ---\n');
  process.stdout.write(`Total Processed: ${rawItems.length}\n`);
  process.stdout.write(`Success: ${result.listings.length}\n`);
  process.stdout.write(`Failed: ${result.failures.length}\n`);

  if (result.failures.length > 0) {
    process.stderr.write('\nFailures:\n');
    for (const f of result.failures) {
      process.stderr.write(`- SKU ${f.sku}: ${f.message}\n`);
    }
    process.exit(1);
  } else {
    process.stdout.write('\nAll drafts passed mock execution successfully!\n');
    process.exit(0);
  }
}

main().catch(err => {
  process.stderr.write('Unhandled error during batch dry run: ' + String(err) + '\n');
  process.exit(1);
});
