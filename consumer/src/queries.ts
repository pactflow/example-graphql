/**
 * The GraphQL documents the consumer sends.
 *
 * They live here, not inline in the client and again in the tests, so that the document under
 * test and the document in the contract are literally the same string. A copy in the test is a
 * copy that can drift, and a contract that describes a query nobody sends is worse than no
 * contract at all.
 */

import { gql } from '@pact-foundation/pact-graphql-plugin';

/**
 * Nested types (category, variants, price) and two enums (`status`, `currency`). The plugin
 * derives the matching rules for all of them from the schema: `match: type` for the scalars, and
 * a `match: regex` over the enum's members for `status` and `currency` — so the provider is free
 * to return a different (valid) product without breaking the contract.
 */
export const GET_PRODUCT = gql`
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      type
      name
      sku
      description
      status
      category {
        id
        name
        slug
      }
      tags
      variants {
        id
        sku
        name
        price {
          list {
            amount
            currency
          }
          sale {
            amount
            currency
          }
        }
        inventory {
          quantity
          updatedAt
        }
      }
    }
  }
`;

/** An enum-typed variable (`$status: ProductStatus`) and a list return type. */
export const LIST_PRODUCTS = gql`
  query ListProducts($status: ProductStatus, $first: Int) {
    products(status: $status, first: $first) {
      id
      type
      name
      status
      category {
        name
      }
    }
  }
`;

/** A mutation whose single variable is an input object type, validated field by field. */
export const ADD_TO_CART = gql`
  mutation AddToCart($input: AddToCartInput!) {
    addToCart(input: $input) {
      id
      quantity
      product {
        id
        name
      }
      variant {
        id
        sku
      }
      lineTotal {
        amount
        currency
      }
    }
  }
`;
