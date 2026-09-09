/**
 * Provider states: one handler per `given(...)` the consumer declares.
 *
 * A state handler's job is to put the provider into the world the consumer described, and nothing
 * more. If a handler is missing, verification fails loudly — which is the point: it means a
 * consumer is asking for a situation this provider cannot produce.
 */

import { repository } from './repository';

export const stateHandlers = {
  'a product with ID 10 exists': async () => {
    repository.reset();

    repository.upsertProduct({
      id: '10',
      type: 'CREDIT_CARD',
      name: 'Gem Visa',
      sku: 'SKU-GEM-VISA',
      // Nullable in the schema, but the consumer's contract expects a string here, so the state
      // has to supply one. A null would fail the type-based match, correctly.
      description: 'A credit card for everyday spending',
      status: 'ACTIVE',
      categoryId: 'cat-1',
      tags: ['finance', 'credit'],
    });

    repository.upsertVariant({
      id: 'var-1',
      productId: '10',
      sku: 'SKU-GEM-VISA-STD',
      name: 'Gem Visa - Standard',
      price: { list: { amount: 0.0, currency: 'AUD' }, sale: null },
      inventory: { quantity: 100, updatedAt: '2026-01-01T00:00:00Z' },
    });
  },

  'no product with ID 404 exists': async () => {
    repository.reset();
    repository.removeProduct('404');
  },

  'two active products exist': async () => {
    repository.reset();
    // The seed catalogue already holds exactly two ACTIVE products (09 and 10); the reset is what
    // guarantees a previous interaction has not changed that.
  },

  'variant var-1 of product 10 is in stock': async () => {
    repository.reset();

    repository.upsertProduct({
      id: '10',
      type: 'CREDIT_CARD',
      name: 'Gem Visa',
      sku: 'SKU-GEM-VISA',
      description: 'A credit card for everyday spending',
      status: 'ACTIVE',
      categoryId: 'cat-1',
      tags: ['finance', 'credit'],
    });

    repository.upsertVariant({
      id: 'var-1',
      productId: '10',
      sku: 'SKU-GEM-VISA-STD',
      name: 'Gem Visa - Standard',
      price: { list: { amount: 0.0, currency: 'AUD' }, sale: null },
      inventory: { quantity: 100, updatedAt: '2026-01-01T00:00:00Z' },
    });
  },
};
