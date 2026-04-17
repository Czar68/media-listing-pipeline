// ========================================
// EBAY SCANNER V1 — PHASE 1 (PRODUCTION CORE)
// Single-item deterministic listing compiler
// ========================================

const CONFIG = {
  EBAY_FEE_RATE: 0.153,
  PER_ORDER_FEE: 0.30,
  SHIPPING_1LB: 4.47,
  SHIPPING_2LB: 5.22,
  SHIPPING_3LB: 5.97,
  SUPPLIES_COST: 0.40,
  PROMO_RATE: 0.05,
  RETURN_BUFFER: 1.00,
  MIN_PROFIT: 3.00
};

// ------------------------------
// INPUT NORMALIZATION
// ------------------------------
function normalizeInventoryItem(raw) {
  return {
    title: (raw.title || "").trim(),
    season: Number(raw.season || 0),
    discCount: Number(raw.discCount || 0),
    conditionTags: raw.conditionTags || [],
    tested: !!raw.tested,
    duplicates: Number(raw.duplicates || 1)
  };
}

// ------------------------------
// ROUTING ENGINE
// ------------------------------
function determineListingType(input) {
  if (input.duplicates >= 3) return "RESELLER_BULK";
  if (input.discCount >= 10) return "COMPLETE_SERIES";
  if (input.discCount >= 6) return "MINI_RUN";
  return "INDIVIDUAL";
}

// ------------------------------
// TITLE ENGINE (SEO SAFE)
// ------------------------------
function trimTitle(title) {
  if (title.length <= 80) return title;
  return title.slice(0, 80).replace(/\s+\S*$/, "");
}

function generateTitle(input, type) {
  const base = `${input.title} Season ${input.season}`;
  const format = "DVD";
  const discs = `${input.discCount} Disc`;
  const condition = "Disc Only No Case";

  let title = `${base} ${format} ${discs} ${condition}`;

  if (type === "RESELLER_BULK") {
    title = `${input.title} DVD Lot ${input.discCount} Discs Disc Only`;
  }

  return trimTitle(title);
}

// ------------------------------
// CONDITION ENGINE
// ------------------------------
function generateConditionNotes(input) {
  const notes = [];

  notes.push("Disc only. No case or artwork.");

  notes.push(input.tested
    ? "Tested and working."
    : "Untested."
  );

  if (input.conditionTags.includes("scratched")) {
    notes.push("May show scratches.");
  }

  if (input.conditionTags.includes("library")) {
    notes.push("May have library markings.");
  }

  notes.push(`Includes ${input.discCount} discs.`);

  return notes.join(" ");
}

// ------------------------------
// DESCRIPTION ENGINE
// ------------------------------
function generateDescription(input) {
  return `
${input.title} - Season ${input.season}

Format: DVD
Condition: Disc only (no case/artwork)

${generateConditionNotes(input)}

Ships via Media Mail.
  `.trim();
}

// ------------------------------
// SHIPPING + WEIGHT MODEL
// ------------------------------
function estimateWeight(discs) {
  // realistic per-disc + packaging buffer
  return Math.ceil(discs * 0.12 + 0.4);
}

function getShipping(weight) {
  if (weight <= 1) return CONFIG.SHIPPING_1LB;
  if (weight <= 2) return CONFIG.SHIPPING_2LB;
  return CONFIG.SHIPPING_3LB;
}

// ------------------------------
// PRICING ENGINE (SAFE VERSION)
// ------------------------------
function calculatePrice(input) {
  const weight = estimateWeight(input.discCount);
  const shipping = getShipping(weight);

  const costBase =
    shipping +
    CONFIG.SUPPLIES_COST +
    CONFIG.PER_ORDER_FEE +
    CONFIG.RETURN_BUFFER;

  const effectiveRate = 1 - (CONFIG.EBAY_FEE_RATE + CONFIG.PROMO_RATE);

  const target = CONFIG.MIN_PROFIT + costBase;

  let price = target / effectiveRate;

  // safety floor
  if (price < CONFIG.MIN_PROFIT + 5) {
    price = CONFIG.MIN_PROFIT + 5;
  }

  return Number(price.toFixed(2));
}

// ------------------------------
// VALIDATION LAYER
// ------------------------------
function validateDraft(draft) {
  draft.warnings = draft.warnings || [];
  draft.blockers = draft.blockers || [];

  if (!draft.title) draft.blockers.push("Missing title");
  if (!draft.price || isNaN(draft.price)) draft.blockers.push("Invalid price");
  if (draft.price < 6) draft.blockers.push("Price too low to list safely");

  if (draft.price < CONFIG.MIN_PROFIT + 3) {
    draft.warnings.push("Low margin listing");
  }

  return draft;
}

// ------------------------------
// FORMATTED OUTPUT (OPERATIONAL)
// ------------------------------
function formatListingOutput(draft) {
  return `
========================
TITLE
========================
${draft.title}

========================
PRICE
========================
$${draft.price}

========================
CONDITION
========================
${draft.conditionNotes}

========================
DESCRIPTION
========================
${draft.description}

========================
TYPE
========================
${draft.listingType}

========================
WARNINGS
========================
${(draft.warnings || []).join("\n") || "None"}

========================
BLOCKERS
========================
${(draft.blockers || []).join("\n") || "None"}
`.trim();
}

// ------------------------------
// CORE PIPELINE (SINGLE ITEM)
// ------------------------------
function runManualListingPipeline(input) {
  const type = determineListingType(input);

  const draft = {
    listingType: type,
    title: generateTitle(input, type),
    conditionNotes: generateConditionNotes(input),
    description: generateDescription(input),
    price: calculatePrice(input),
    warnings: [],
    blockers: []
  };

  const validated = validateDraft(draft);

  return {
    success: validated.blockers.length === 0,
    draft: validated
  };
}

// ------------------------------
// OPERATIONAL ENTRY POINT
// ------------------------------
function runLister(rawInput) {
  const input = normalizeInventoryItem(rawInput);

  const result = runManualListingPipeline(input);

  return {
    ...result,
    output: formatListingOutput(result.draft)
  };
}

// ------------------------------
// EXAMPLE
// ------------------------------
const example = runLister({
  title: "The Office",
  season: 3,
  discCount: 4,
  tested: false,
  conditionTags: []
});

console.log(example.output);
