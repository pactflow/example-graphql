# example-graphql

An end-to-end example of contract testing a **GraphQL** API with [Pact], the
[GraphQL plugin][plugin] and [PactFlow] — consumer, provider, and the full CI/CD lifecycle
including `can-i-deploy` release gating.

It is the GraphQL sibling of [pactflow/example-consumer] and [pactflow/example-provider], and uses
the same canonical Products domain, enriched with nested types, enums, lists and an input object
so the plugin's schema-awareness has something to work with.

| | |
|---|---|
| **Consumer** | `product-consumer` — a TypeScript GraphQL client |
| **Provider** | `product-provider` — an Apollo Server serving the same SDL |
| **Test runner** | [Vitest] |
| **Broker** | [PactFlow] (or any Pact Broker) |

---

## Why a GraphQL plugin, rather than JSON body matching

Every GraphQL request is `POST /graphql` with a JSON body, so a plain Pact HTTP test can only
compare that body as opaque text. Two identical queries that differ in whitespace mismatch;
a query for a field that does not exist matches happily. The plugin understands GraphQL instead:

- **Validates the query against the schema** when the pact is written, not when the provider
  breaks — `field 'discontinuedAt' does not exist on type 'Product'`.
- **Validates the variables** against the operation's declared variable definitions — a missing
  `$id`, a `String` where `Int!` is declared, or a value outside an enum.
- **Validates the expected response** against the schema *and the query's selection set*, so you
  cannot write a contract expecting a field you never asked for.
- **Derives matching rules from the schema.** Scalars become `match: type`; enums become a regex
  over the enum's members. From this repo's generated pact:

  ```jsonc
  "$.data.product.name":   { "matchers": [{ "match": "type" }] },
  "$.data.product.status": { "matchers": [{ "match": "regex",
                                            "regex": "^(ACTIVE|ARCHIVED|DRAFT|OUT_OF_STOCK)$" }] }
  ```

  The provider is free to return a *different* valid product — the contract is about shape, not
  about fixture data.
- **Compares queries on the AST**, so formatting, comments and fragment ordering never cause a
  false mismatch.

`consumer/src/schema-validation.test.ts` demonstrates each of these failures deliberately.

---

## Quick start

```bash
npm install     # also installs the GraphQL plugin binary into ~/.pact/plugins
npm test        # consumer contract tests, then provider verification
```

No broker required: with `PACT_BROKER_BASE_URL` unset, the provider verifies the pacts the
consumer just wrote to `consumer/pacts/`. That is the whole local feedback loop.

> **Prerequisites**: Node 20+. The plugin binary is installed by a `postinstall` hook in
> `@pact-foundation/pact-graphql-plugin` — there is no separate plugin installation step.

### Against PactFlow

```bash
cp .env.example .env      # fill in your PactFlow URL and API token
set -a && source .env && set +a

npm run test:consumer     # writes contracts
npm run publish:pacts     # publishes them
npm run test:provider     # fetches, verifies and publishes results
npm run can-i-deploy:consumer
npm run deploy:consumer
```

---

## Layout

```
schema/product.graphql            the SDL — one source of truth for both sides
consumer/
  src/queries.ts                  the GraphQL documents, shared by client and tests
  src/products-api.ts             the client under test
  src/products-api.pact.test.ts   contract tests
  src/schema-validation.test.ts   what the plugin rejects, and why
provider/
  src/server.ts                   Apollo Server built from the same SDL
  src/repository.ts               in-memory data, resettable by state handlers
  src/state-handlers.ts           one handler per consumer `given(...)`
  src/product.verify.test.ts      provider verification
scripts/pact.mjs                  publish / can-i-deploy / record-deployment
```

Two details worth copying:

**The queries live in one place.** `consumer/src/queries.ts` is imported by both the client and
the contract tests, so the document under test and the document in the contract are the same
string. A copy in the test is a copy that can drift, and a contract describing a query nobody
sends is worse than no contract.

**The tests exercise the real client.** `products-api.pact.test.ts` points the actual
`ProductsApi` at the mock provider rather than hand-rolling a `fetch`. The contract therefore
records what the consumer genuinely sends.

---

## npm scripts

Every lifecycle stage has one. There is no Makefile.

| Script | What it does |
|---|---|
| `npm test` | consumer tests, then provider verification |
| `npm run test:consumer` | consumer contract tests → `consumer/pacts/` |
| `npm run test:provider` | provider verification |
| `npm run publish:pacts` | publish contracts, tagged with commit + branch |
| `npm run can-i-deploy:consumer` | release gate for `product-consumer` |
| `npm run can-i-deploy:provider` | release gate for `product-provider` |
| `npm run deploy:consumer` | (simulated) deploy, then `record-deployment` |
| `npm run deploy:provider` | (simulated) deploy, then `record-deployment` |
| `npm run record-deployment:*` | record a deployment without deploying |
| `npm run typecheck` | `tsc --noEmit` across both workspaces |
| `npm run start:provider` | run the GraphQL server standalone on `:4000` |
| `npm run ci` | typecheck → consumer → publish → provider |

`scripts/pact.mjs` derives the application version (`GIT_COMMIT`, else `git rev-parse HEAD`) and
branch identically for every stage. Publishing a pact under one version and asking `can-i-deploy`
about another is the classic way to get a green build that proves nothing.

---

## The order matters

Consumer tests run **before** provider tests, locally and in CI. The provider verifies contracts
the consumer publishes, so a provider run that starts first verifies a stale contract, or nothing.

```
consumer tests ──> publish contract ──> provider verification ──> can-i-deploy ──> deploy
```

`.github/workflows/build.yml` encodes exactly that: `provider` declares `needs: [consumer]`, and
both `deploy-*` jobs declare `needs: [consumer, provider]` and only run on `main`.

The workflow also accepts a `repository_dispatch` of type
`contract-requiring-verification-published`. Wire a PactFlow webhook to it and a consumer change
triggers provider verification immediately, rather than waiting for the provider's next commit.
On that path the `consumer` job is skipped and `PACT_URL` is passed through from the payload, so
only the contract that actually changed is verified.

### Required repository secrets

| Secret | |
|---|---|
| `PACT_BROKER_BASE_URL` | e.g. `https://your-tenant.pactflow.io` |
| `PACT_BROKER_TOKEN` | a read/write API token |

Without them the workflow still runs: it falls back to verifying pacts on disk, and skips
publishing. Fork PRs therefore stay green without leaking secrets.

### The `production` environment

`can-i-deploy` and `record-deployment` both need the environment to exist in the broker:

```bash
pact-broker create-environment --name production --display-name Production --production
```

---

## What the example covers

`schema/product.graphql`, and the interactions built on it:

| | Interaction | Showcases |
|---|---|---|
| Query | `GetProduct` | required `ID!` variable, nested objects (`category`, `variants`, `price`), a list of scalars (`tags`), two enums, and a **nullable field returning `null`** (`price.sale`) |
| Query | `GetProduct` (404) | `product: null` — a valid response the consumer has to handle, the GraphQL equivalent of a 404 |
| Query | `ListProducts` | an **enum-typed variable** (`$status: ProductStatus`), a nullable `Int`, and a list return type |
| Mutation | `AddToCart` | a variable of an **input object type**, validated field by field |

Each has a matching provider state in `provider/src/state-handlers.ts`.

---

## A note on `content-type`

The plugin records GraphQL requests with `content-type: application/graphql`, not the
`application/json` most GraphQL clients default to — that is how it routes the body to its
GraphQL matcher. Because the contract records it, the client under test sends it
(`consumer/src/products-api.ts`) and the provider parses it alongside `application/json`
(`provider/src/server.ts`). Papering over that difference in the test would make the contract
describe a request the consumer never sends.

---

## Further reading

- [Pact GraphQL plugin][plugin]
- [Pact plugins][plugins]
- [PactFlow docs](https://docs.pactflow.io)
- [can-i-deploy](https://docs.pact.io/pact_broker/can_i_deploy)

[Pact]: https://pact.io
[PactFlow]: https://pactflow.io
[plugin]: https://github.com/mefellows/pact-graphql-plugin
[plugins]: https://github.com/pact-foundation/pact-plugins
[pactflow/example-consumer]: https://github.com/pactflow/example-consumer
[pactflow/example-provider]: https://github.com/pactflow/example-provider
[Vitest]: https://vitest.dev
