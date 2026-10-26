/**
 * DripRack Inventory Integrity Audit Script
 *
 * READ-ONLY verification utility that scans products in the database
 * to detect any violation of the stock invariant:
 *   available = physical - reserved
 *
 * Constraints checked:
 * 1. available === physical - reserved
 * 2. physical >= 0, reserved >= 0, available >= 0
 * 3. reserved <= physical
 * 4. All stock quantities are integers
 *
 * Run: node scripts/auditInventoryIntegrity.js
 */

import { connectDB, disconnectDB } from '../src/config/database.js';
import { Product } from '../src/modules/products/product.model.js';
import { logger } from '../src/utils/logger.js';

async function runAudit() {
  console.log('='.repeat(70));
  console.log('🔍 DripRack Inventory Integrity Audit (Read-Only)');
  console.log('='.repeat(70));

  try {
    await connectDB();

    const totalProducts = await Product.countDocuments({});
    console.log(`\n📦 Total catalog products found: ${totalProducts}`);

    if (totalProducts === 0) {
      console.log('No products found in catalog. Stock integrity is clean.\n');
      process.exit(0);
    }

    // Find all products whose stock violates invariants
    const products = await Product.find({})
      .select('_id sku name stock lowStockThreshold status')
      .lean();

    const violations = [];

    for (const p of products) {
      const physical = p.stock?.physical;
      const reserved = p.stock?.reserved;
      const available = p.stock?.available;

      const issues = [];

      if (physical === undefined || reserved === undefined || available === undefined) {
        issues.push('Missing stock sub-document fields');
      } else {
        if (!Number.isInteger(physical)) issues.push(`Physical stock is not an integer: ${physical}`);
        if (!Number.isInteger(reserved)) issues.push(`Reserved stock is not an integer: ${reserved}`);
        if (!Number.isInteger(available)) issues.push(`Available stock is not an integer: ${available}`);

        if (physical < 0) issues.push(`Physical stock is negative: ${physical}`);
        if (reserved < 0) issues.push(`Reserved stock is negative: ${reserved}`);
        if (available < 0) issues.push(`Available stock is negative: ${available}`);

        if (reserved > physical) {
          issues.push(`Reserved stock (${reserved}) exceeds physical stock (${physical})`);
        }

        const expectedAvailable = physical - reserved;
        if (available !== expectedAvailable) {
          issues.push(
            `Invariant violation: available (${available}) !== physical (${physical}) - reserved (${reserved}) [expected: ${expectedAvailable}]`
          );
        }
      }

      if (issues.length > 0) {
        violations.push({
          id: p._id.toString(),
          sku: p.sku,
          name: p.name,
          status: p.status,
          stock: p.stock,
          issues
        });
      }
    }

    console.log('\n--- Audit Results ---');
    if (violations.length === 0) {
      console.log(`✅ ALL ${totalProducts} products comply strictly with stock invariants:`);
      console.log('   - available = physical - reserved');
      console.log('   - physical >= 0, reserved >= 0, available >= 0');
      console.log('   - reserved <= physical');
      console.log('   - All values are integers');
      console.log('='.repeat(70) + '\n');
      process.exit(0);
    } else {
      console.error(`❌ FOUND ${violations.length} INTEGRITY VIOLATIONS:\n`);
      for (const v of violations) {
        console.error(`Product [${v.sku}] "${v.name}" (ID: ${v.id}):`);
        console.error(`  Current Stock: Physical=${v.stock?.physical}, Reserved=${v.stock?.reserved}, Available=${v.stock?.available}`);
        for (const issue of v.issues) {
          console.error(`  - ${issue}`);
        }
        console.error('');
      }
      console.error('⚠️  Audit identified discrepancies. DO NOT silently overwrite; investigate movements.');
      console.log('='.repeat(70) + '\n');
      process.exit(1);
    }
  } catch (error) {
    logger.error({ err: error }, 'Inventory integrity audit failed');
    console.error('Audit execution error:', error.message);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

runAudit();
