# Media Listing Pipeline

> 📋 **Master Outline:** https://github.com/Czar68/czar-platform/blob/main/MASTER_OUTLINE.md

Deterministic physical media listing system.

Pipeline:
Intake ? Identity ? Condition ? Listing ? Review ? Publish

Key rules:
- No condition defaults or inference
- Condition is human-determined and blocking
- eBay logic is isolated to adapters
- No legacy code reuse
- Full audit + provenance tracking
