/**
 * What the plugin catches *before* a contract is ever written.
 *
 * These are not contract tests — they never publish anything, and they write to a throwaway pact
 * directory. They exist to show the failure modes the plugin turns into a red consumer build
 * instead of a mysterious provider failure days later. Each one is a mistake that plain JSON-body
 * Pact would happily record.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PactV4 } from '@pact-foundation/pact';
import { graphql, gql } from '@pact-foundation/pact-graphql-plugin';
import { describe, expect, it } from 'vitest';

import { GET_PRODUCT } from './queries';

const schema = readFileSync(resolve(__dirname, '..', '..', 'schema', 'product.graphql'), 'utf8');

/**
 * A throwaway directory: these interactions are expected to be rejected, so nothing here should
 * ever reach `consumer/pacts` or the broker.
 */
const scratchApi = () =>
  graphql(
    new PactV4({
      consumer: 'example-graphql-product-consumer',
      provider: 'example-graphql-product-provider-validation-scratch',
      dir: resolve(__dirname, '..', '.tmp-pacts'),
      logLevel: 'warn',
    }),
    { schema },
  );

describe('schema validation', () => {
  it('rejects a query selecting a field the schema does not have', async () => {
    await expect(
      scratchApi()
        .interaction('a query for a field that does not exist')
        .query(gql`
          query GetProduct($id: ID!) {
            product(id: $id) {
              id
              discontinuedAt
            }
          }
        `)
        .operationName('GetProduct')
        .variables({ id: '10' })
        .build(),
    ).rejects.toThrow(/discontinuedAt/);
  });

  it('rejects variables that do not satisfy the operation', async () => {
    await expect(
      scratchApi()
        .interaction('a query whose required variable is not supplied')
        .query(GET_PRODUCT)
        .operationName('GetProduct')
        // `$id: ID!` is declared and required, but the author supplied `productId`.
        .variables({ productId: '10' })
        .build(),
    ).rejects.toThrow(/\$id/);
  });

  it('rejects a value that is not a member of the enum', async () => {
    await expect(
      scratchApi()
        .interaction('a query filtering on a status that does not exist')
        .query(gql`
          query ListProducts($status: ProductStatus) {
            products(status: $status) {
              id
            }
          }
        `)
        .operationName('ListProducts')
        .variables({ status: 'DISCONTINUED' })
        .build(),
    ).rejects.toThrow(/DISCONTINUED|ProductStatus/);
  });

  it('rejects an expected response that the selection set cannot produce', async () => {
    await expect(
      scratchApi()
        .interaction('a response containing a field the query did not select')
        .query(gql`
          query GetProduct($id: ID!) {
            product(id: $id) {
              id
              name
            }
          }
        `)
        .operationName('GetProduct')
        .variables({ id: '10' })
        // `sku` was never selected, so the provider would never send it — an expectation the
        // provider cannot meet, caught at pact-write time.
        .willRespondWith({ data: { product: { id: '10', name: 'Gem Visa', sku: 'SKU-1' } } })
        .build(),
    ).rejects.toThrow(/sku/);
  });
});
