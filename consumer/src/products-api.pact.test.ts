/**
 * Consumer contract tests for example-graphql-product-consumer → example-graphql-product-provider.
 *
 * Each test declares a GraphQL operation and the response shape the consumer needs, then runs the
 * *real* `ProductsApi` against the mock provider. The plugin validates the query, its variables
 * and the expected response against `schema/product.graphql` before anything is written, so a
 * contract that could not possibly be satisfied fails here rather than in the provider's build.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PactV4 } from '@pact-foundation/pact';
import { graphql } from '@pact-foundation/pact-graphql-plugin';
import { describe, expect, it } from 'vitest';

import { ProductsApi } from './products-api';
import { ADD_TO_CART, GET_PRODUCT, LIST_PRODUCTS } from './queries';

const schema = readFileSync(resolve(__dirname, '..', '..', 'schema', 'product.graphql'), 'utf8');

/**
 * A fresh builder per interaction. Pact accumulates interactions into the same pact file across
 * builders, so this costs nothing and keeps each test independent.
 */
const productsApi = () =>
  graphql(
    new PactV4({
      consumer: 'example-graphql-example-graphql-product-consumer',
      provider: 'example-graphql-example-graphql-product-provider',
      dir: resolve(__dirname, '..', 'pacts'),
      logLevel: 'warn',
    }),
    { schema },
  );

describe('Products API', () => {
  it('fetches a product by id', async () => {
    await productsApi()
      .interaction('a request for product 10')
      .given('a product with ID 10 exists')
      .query(GET_PRODUCT)
      .operationName('GetProduct')
      .variables({ id: '10' })
      .willRespondWith({
        data: {
          product: {
            id: '10',
            type: 'CREDIT_CARD',
            name: 'Gem Visa',
            sku: 'SKU-GEM-VISA',
            description: 'A credit card for everyday spending',
            // Matched by a regex over the enum's members, not by this literal value: the provider
            // may legitimately return any ProductStatus here.
            status: 'ACTIVE',
            category: { id: 'cat-1', name: 'Cards', slug: 'cards' },
            tags: ['finance', 'credit'],
            variants: [
              {
                id: 'var-1',
                sku: 'SKU-GEM-VISA-STD',
                name: 'Gem Visa - Standard',
                price: {
                  list: { amount: 0.0, currency: 'AUD' },
                  sale: null,
                },
                inventory: { quantity: 100, updatedAt: '2026-01-01T00:00:00Z' },
              },
            ],
          },
        },
      })
      .executeTest(async (client) => {
        // The real client, pointed at the mock provider. `client.url` is the mock server's
        // GraphQL endpoint; everything else about the request comes from ProductsApi itself.
        const api = new ProductsApi(client.url.replace(/\/graphql$/, ''));
        const product = await api.getProduct('10');

        expect(product).not.toBeNull();
        expect(product?.id).toBe('10');
        expect(product?.status).toBe('ACTIVE');
        expect(product?.category?.slug).toBe('cards');
        expect(product?.variants[0].price.list.currency).toBe('AUD');
        // `sale` is nullable in the schema and null here — the consumer must cope with that.
        expect(product?.variants[0].price.sale).toBeNull();
      });
  });

  it('returns null for a product that does not exist', async () => {
    await productsApi()
      .interaction('a request for a product that does not exist')
      .given('no product with ID 404 exists')
      .query(GET_PRODUCT)
      .operationName('GetProduct')
      .variables({ id: '404' })
      // A nullable field returning null is a perfectly valid GraphQL response, and the consumer
      // has to handle it. This is the GraphQL equivalent of the canonical 404 case.
      .willRespondWith({ data: { product: null } })
      .executeTest(async (client) => {
        const api = new ProductsApi(client.url.replace(/\/graphql$/, ''));
        await expect(api.getProduct('404')).resolves.toBeNull();
      });
  });

  it('lists products filtered by status', async () => {
    await productsApi()
      .interaction('a request for active products')
      .given('two active products exist')
      .query(LIST_PRODUCTS)
      .operationName('ListProducts')
      // `$status` is declared as `ProductStatus`, so the plugin rejects a value that is not one of
      // the enum's members before the pact is written.
      .variables({ status: 'ACTIVE', first: 2 })
      .willRespondWith({
        data: {
          products: [
            {
              id: '09',
              type: 'CREDIT_CARD',
              name: 'Gem Visa',
              status: 'ACTIVE',
              category: { name: 'Cards' },
            },
            {
              id: '10',
              type: 'CREDIT_CARD',
              name: 'GoodLife Card',
              status: 'ACTIVE',
              category: { name: 'Cards' },
            },
          ],
        },
      })
      .executeTest(async (client) => {
        const api = new ProductsApi(client.url.replace(/\/graphql$/, ''));
        const products = await api.listProducts('ACTIVE', 2);

        expect(products).toHaveLength(2);
        expect(products.map((product) => product.id)).toEqual(['09', '10']);
        expect(products.every((product) => product.status === 'ACTIVE')).toBe(true);
      });
  });

  it('adds a variant to the cart', async () => {
    await productsApi()
      .interaction('a request to add a product variant to the cart')
      .given('variant var-1 of product 10 is in stock')
      .query(ADD_TO_CART)
      .operationName('AddToCart')
      // A single variable of an input object type. Every field is checked against
      // `AddToCartInput` — a missing `quantity`, or a string where `Int!` is declared, fails here.
      .variables({ input: { productId: '10', variantId: 'var-1', quantity: 2 } })
      .willRespondWith({
        data: {
          addToCart: {
            id: 'line-1',
            quantity: 2,
            product: { id: '10', name: 'Gem Visa' },
            variant: { id: 'var-1', sku: 'SKU-GEM-VISA-STD' },
            lineTotal: { amount: 0.0, currency: 'AUD' },
          },
        },
      })
      .executeTest(async (client) => {
        const api = new ProductsApi(client.url.replace(/\/graphql$/, ''));
        const line = await api.addToCart({ productId: '10', variantId: 'var-1', quantity: 2 });

        expect(line.id).toBe('line-1');
        expect(line.quantity).toBe(2);
        expect(line.lineTotal.currency).toBe('AUD');
      });
  });
});
