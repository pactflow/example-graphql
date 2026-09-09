/**
 * example-graphql-product-provider: an Apollo Server serving `schema/product.graphql`.
 *
 * The same server is used by `npm run start:provider` and by provider verification — verification
 * against a server built differently from the one you ship proves nothing.
 */

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express from 'express';

import { repository, type Product, type ProductStatus } from './repository';

export const typeDefs = readFileSync(
  resolve(__dirname, '..', '..', 'schema', 'product.graphql'),
  'utf8',
);

const resolvers = {
  Query: {
    product: (_: unknown, { id }: { id: string }) => repository.findProduct(id),
    products: (_: unknown, { status, first }: { status?: ProductStatus; first?: number }) =>
      repository.listProducts(status, first),
  },

  Mutation: {
    addToCart: (
      _: unknown,
      { input }: { input: { productId: string; variantId: string; quantity: number } },
    ) => {
      const product = repository.findProduct(input.productId);
      if (!product) {
        throw new Error(`no such product: ${input.productId}`);
      }

      const variant = repository.findVariant(input.variantId);
      if (!variant || variant.productId !== product.id) {
        throw new Error(`no such variant for product ${input.productId}: ${input.variantId}`);
      }

      const unitPrice = variant.price.sale ?? variant.price.list;

      return {
        id: repository.nextCartLineId(),
        product,
        variant,
        quantity: input.quantity,
        lineTotal: {
          // Rounded because floating point turns 3 × 29.99 into 89.97000000000001.
          amount: Math.round(unitPrice.amount * input.quantity * 100) / 100,
          currency: unitPrice.currency,
        },
      };
    },
  },

  Product: {
    category: (product: Product) => repository.findCategory(product.categoryId),
    variants: (product: Product) => repository.variantsFor(product.id),
  },
};

export async function startProviderServer(port = 0) {
  const apollo = new ApolloServer({ typeDefs, resolvers });
  await apollo.start();

  const app = express();

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    // `application/graphql` is the content type the Pact GraphQL plugin records for a GraphQL
    // request, so the server has to parse it as JSON alongside the conventional
    // `application/json` — otherwise every verified request arrives with an empty body.
    express.json({ type: ['application/json', 'application/graphql'] }),
    expressMiddleware(apollo),
  );

  const httpServer = app.listen(port);
  await new Promise((ready) => httpServer.once('listening', ready));

  const address = httpServer.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    async close() {
      await apollo.stop();
      await new Promise<void>((done, failed) =>
        httpServer.close((error) => (error ? failed(error) : done())),
      );
    },
  };
}
