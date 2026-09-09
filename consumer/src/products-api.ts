/**
 * The consumer's real GraphQL client. This is the code under test: the pact tests point it at
 * the mock provider rather than reimplementing the request, so the contract records what this
 * client actually sends.
 */

import { ADD_TO_CART, GET_PRODUCT, LIST_PRODUCTS } from './queries';

export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'OUT_OF_STOCK' | 'ARCHIVED';
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'AUD';

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface Product {
  id: string;
  type: string;
  name: string;
  sku: string;
  description: string | null;
  status: ProductStatus;
  category: { id: string; name: string; slug: string } | null;
  tags: string[];
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    price: { list: Money; sale: Money | null };
    inventory: { quantity: number; updatedAt: string };
  }>;
}

export interface ProductSummary {
  id: string;
  type: string;
  name: string;
  status: ProductStatus;
  category: { name: string } | null;
}

export interface CartLine {
  id: string;
  quantity: number;
  product: { id: string; name: string };
  variant: { id: string; sku: string };
  lineTotal: Money;
}

export interface AddToCartInput {
  productId: string;
  variantId: string;
  quantity: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** A GraphQL error is a 200 with an `errors` array, so it has to be checked for explicitly. */
export class GraphQLError extends Error {
  constructor(public readonly errors: Array<{ message: string }>) {
    super(errors.map((error) => error.message).join('; '));
    this.name = 'GraphQLError';
  }
}

/**
 * The content type the Pact GraphQL plugin records for a GraphQL request.
 *
 * Note this is `application/graphql`, not the `application/json` most GraphQL clients default to:
 * it is how the plugin routes the body to its GraphQL matcher, and it is therefore what ends up
 * in the contract. The client under test has to send the same thing the contract records, so it
 * is set here rather than papered over in the test — and the provider accepts both.
 */
const GRAPHQL_CONTENT_TYPE = 'application/graphql';

export class ProductsApi {
  private readonly endpoint: string;

  constructor(baseUrl: string, path = '/graphql') {
    this.endpoint = `${baseUrl.replace(/\/$/, '')}${path}`;
  }

  async getProduct(id: string): Promise<Product | null> {
    const data = await this.execute<{ product: Product | null }>(GET_PRODUCT, 'GetProduct', { id });
    return data.product;
  }

  async listProducts(status?: ProductStatus, first?: number): Promise<ProductSummary[]> {
    const data = await this.execute<{ products: ProductSummary[] }>(LIST_PRODUCTS, 'ListProducts', {
      status,
      first,
    });
    return data.products;
  }

  async addToCart(input: AddToCartInput): Promise<CartLine> {
    const data = await this.execute<{ addToCart: CartLine }>(ADD_TO_CART, 'AddToCart', { input });
    return data.addToCart;
  }

  private async execute<T>(
    query: string,
    operationName: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': GRAPHQL_CONTENT_TYPE },
      body: JSON.stringify({ query, operationName, variables }),
    });

    if (!response.ok) {
      throw new Error(`Products API responded with ${response.status}`);
    }

    const body = (await response.json()) as GraphQLResponse<T>;

    if (body.errors?.length) {
      throw new GraphQLError(body.errors);
    }
    if (!body.data) {
      throw new Error('Products API returned no data');
    }

    return body.data;
  }
}
