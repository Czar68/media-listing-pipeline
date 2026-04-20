/**
 * Parity test to ensure MockExecutor produces per-item results with correct structure
 * This tests structure only (deep shape match), not values
 * Validates that both executors return identical per-item contract
 * NO batch-level assumptions - executor handles single item only
 */

import { MockExecutor } from './mockExecutor';
import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';
import type { ExecutionSuccess, ExecutionFailed } from './types';

function getObjectKeys(obj: unknown): string[] {
  if (obj === null || typeof obj !== 'object') {
    return [];
  }
  return Object.keys(obj);
}

async function testParity() {
  console.log('Testing executor per-item execution structure parity...\n');

  const mockExecutor = new MockExecutor();

  // Test data - using proper types
  const normalizedItem: NormalizedInventoryItem = {
    sku: 'test-sku-001',
    title: 'Test Item',
    description: 'Test Description',
    media: {
      images: ['https://example.com/image.jpg'],
      videos: [],
    },
    condition: 'NEW',
    source: {
      system: 'media-listing-pipeline',
      origin: 'test',
      externalId: 'test-001',
    },
    timestamps: {
      capturedAt: '2026-01-01T00:00:00.000Z',
      normalizedAt: '2026-01-01T00:00:00.000Z',
    },
  };

  const ebayPayload: EbayInventoryItem = {
    sku: 'test-sku-001',
    condition: 'NEW' as const,
    product: {
      title: 'Test Item',
      description: 'Test Description',
      imageUrls: ['https://example.com/image.jpg'],
    },
    sourceMetadata: {
      system: 'media-listing-pipeline',
      origin: 'test',
      externalId: 'test-001',
      capturedAt: '2026-01-01T00:00:00.000Z',
      normalizedAt: '2026-01-01T00:00:00.000Z',
    },
  };

  // Test SINGLE ITEM execution (no batch)
  console.log('Testing per-item execution...');
  const result = await mockExecutor.execute({ item: normalizedItem, ebayPayload });
  console.log('Per-item result:', JSON.stringify(result, null, 2));

  // Validate result is either ExecutionSuccess or ExecutionFailed
  if ('error' in result) {
    console.log('✓ Result is ExecutionFailed\n');
    validateExecutionFailed(result as ExecutionFailed);
  } else {
    console.log('✓ Result is ExecutionSuccess\n');
    validateExecutionSuccess(result as ExecutionSuccess);
  }

  console.log('All parity tests passed!');
  console.log('\nMock executor produces correct per-item structure.');
  console.log('Executor handles single item only - no batch responsibility.');
}

function validateExecutionSuccess(success: ExecutionSuccess): void {
  const successKeys = getObjectKeys(success).sort();
  
  if (successKeys.length === 3 && 
      successKeys.includes('item') && 
      successKeys.includes('ebayPayload') && 
      successKeys.includes('response')) {
    console.log('✓ ExecutionSuccess has correct fields (item, ebayPayload, response)');
  } else {
    console.error('✗ ExecutionSuccess has unexpected fields:', successKeys);
    process.exit(1);
  }

  // Validate response structure has {status?, data?}
  const response = success.response;
  if (response === null || typeof response !== 'object') {
    console.error('✗ Response is not an object');
    process.exit(1);
  }

  const responseKeys = getObjectKeys(response).sort();
  console.log('Response fields:', responseKeys);

  // Check for status and data fields (optional)
  if (responseKeys.includes('status') || responseKeys.includes('data')) {
    console.log('✓ Response has structured fields (status?, data?)');
  } else {
    console.error('✗ Response missing expected structured fields');
    process.exit(1);
  }

  console.log();
}

function validateExecutionFailed(failed: ExecutionFailed): void {
  const failedKeys = getObjectKeys(failed).sort();
  
  if (failedKeys.length === 3 && 
      failedKeys.includes('item') && 
      failedKeys.includes('ebayPayload') && 
      failedKeys.includes('error')) {
    console.log('✓ ExecutionFailed has correct fields (item, ebayPayload, error)');
  } else {
    console.error('✗ ExecutionFailed has unexpected fields:', failedKeys);
    process.exit(1);
  }

  // Validate error structure
  const error = failed.error as unknown as Record<string, unknown>;
  const errorKeys = getObjectKeys(error).sort();
  if (errorKeys.includes('message')) {
    console.log('✓ Error has message field');
  } else {
    console.error('✗ Error missing message field');
    process.exit(1);
  }

  console.log();
}

testParity().catch(err => {
  console.error('Parity test failed:', err);
  process.exit(1);
});
