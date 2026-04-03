import type { ValidationFailure, ValidationResult } from '@media-listing/core-domain';
import { validationFail, validationOk } from '@media-listing/core-domain';
import { IDENTITY_REGION_CODES } from '@media-listing/core-identity';
import { SCAN_SOURCES, type ScanRecord } from '../model/scan-record';

const REGION_SET = new Set(IDENTITY_REGION_CODES);

function isIso8601Like(s: string): boolean {
  return !Number.isNaN(Date.parse(s));
}

export function validateScanRecord(record: ScanRecord): ValidationResult<ScanRecord> {
  const failures: ValidationFailure[] = [];

  if (record.scanId.trim().length === 0) {
    failures.push({
      code: 'SCAN_ID_BLANK',
      message: 'scanId must be non-empty',
      path: ['scanId'],
    });
  }

  if (!SCAN_SOURCES.includes(record.scanSource)) {
    failures.push({
      code: 'SCAN_SOURCE_INVALID',
      message: 'scanSource must be DISC, UPC, or MANUAL',
      path: ['scanSource'],
    });
  }

  if (record.timestamp.trim().length === 0) {
    failures.push({
      code: 'SCAN_TIMESTAMP_BLANK',
      message: 'timestamp must be non-empty',
      path: ['timestamp'],
    });
  } else if (!isIso8601Like(record.timestamp)) {
    failures.push({
      code: 'SCAN_TIMESTAMP_UNPARSEABLE',
      message: 'timestamp must be a parseable ISO 8601 string',
      path: ['timestamp'],
    });
  }

  if (record.observedDiscCount !== null) {
    if (!Number.isInteger(record.observedDiscCount) || record.observedDiscCount < 0) {
      failures.push({
        code: 'SCAN_DISC_COUNT_INVALID',
        message: 'observedDiscCount must be an integer >= 0 when present',
        path: ['observedDiscCount'],
      });
    }
  }

  if (record.observedRegion !== null && !REGION_SET.has(record.observedRegion)) {
    failures.push({
      code: 'SCAN_REGION_INVALID',
      message: 'observedRegion must be a valid IdentityRegionCode when present',
      path: ['observedRegion'],
    });
  }

  if (record.discFingerprints !== undefined) {
    record.discFingerprints.forEach((fp, i) => {
      if (fp.trim().length === 0) {
        failures.push({
          code: 'SCAN_DISC_FINGERPRINT_BLANK',
          message: 'discFingerprints entries must be non-empty strings',
          path: ['discFingerprints', String(i)],
        });
      }
    });
  }

  if (failures.length > 0) {
    return validationFail(failures);
  }
  return validationOk(record);
}
