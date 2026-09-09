/**
 * Provider verification for product-provider.
 *
 * Replays every interaction in the consumer's contract against a real, running server. There are
 * no assertions written by hand here — the contract *is* the assertion.
 *
 * Two modes, chosen by whether a broker is configured:
 *   • broker configured → fetch pacts from PactFlow and publish results back
 *   • no broker         → verify `consumer/pacts/*.json` from disk, so the local loop works offline
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { Verifier, type VerifierOptions } from '@pact-foundation/pact';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { startProviderServer } from './server';
import { stateHandlers } from './state-handlers';

const LOCAL_PACTS_DIR = resolve(__dirname, '..', '..', 'consumer', 'pacts');

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const providerVersion = process.env.GIT_COMMIT || git('rev-parse', 'HEAD');
const providerVersionBranch = process.env.GIT_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD');

describe('product-provider', () => {
  let server: Awaited<ReturnType<typeof startProviderServer>>;

  beforeAll(async () => {
    server = await startProviderServer();
  });

  afterAll(async () => {
    await server?.close();
  });

  it('honours the contracts its consumers depend on', async () => {
    const options: VerifierOptions = {
      provider: 'product-provider',
      providerBaseUrl: server.url,
      providerVersion,
      providerVersionBranch,
      stateHandlers,
      logLevel: (process.env.PACT_LOG_LEVEL as VerifierOptions['logLevel']) ?? 'info',
    };

    if (process.env.PACT_URL) {
      // Set by a PactFlow "contract requiring verification published" webhook: verify exactly the
      // contract that changed, rather than everything.
      options.pactUrls = [process.env.PACT_URL];
      options.pactBrokerToken = process.env.PACT_BROKER_TOKEN;
      options.publishVerificationResult = true;
    } else if (process.env.PACT_BROKER_BASE_URL) {
      options.pactBrokerUrl = process.env.PACT_BROKER_BASE_URL;
      options.pactBrokerToken = process.env.PACT_BROKER_TOKEN;
      options.pactBrokerUsername = process.env.PACT_BROKER_USERNAME;
      options.pactBrokerPassword = process.env.PACT_BROKER_PASSWORD;

      options.consumerVersionSelectors = [
        // What is on the consumer's main branch...
        { mainBranch: true },
        // ...what is on a branch of the same name, so a feature branch verifies against its own
        // consumer changes...
        { matchingBranch: true },
        // ...and whatever is actually deployed or released, which is what can-i-deploy reads.
        { deployedOrReleased: true },
      ];

      // A brand-new consumer contract fails as "pending" rather than breaking this build, and WIP
      // pacts are reported without failing it. Together they let consumers publish freely without
      // holding the provider's pipeline hostage.
      options.enablePending = true;
      options.includeWipPactsSince = '2024-01-01';

      // Only publish from CI. Results published from a developer's laptop pollute the broker with
      // verifications of code that was never pushed.
      options.publishVerificationResult = Boolean(process.env.CI);
    } else {
      if (!existsSync(LOCAL_PACTS_DIR) || readdirSync(LOCAL_PACTS_DIR).length === 0) {
        throw new Error(
          `No broker configured and no pacts found at ${LOCAL_PACTS_DIR}.\n` +
            'Run `npm run test:consumer` first, or set PACT_BROKER_BASE_URL to verify from PactFlow.',
        );
      }
      options.pactUrls = [LOCAL_PACTS_DIR];
      console.log(`No broker configured — verifying local pacts from ${LOCAL_PACTS_DIR}`);
    }

    await new Verifier(options).verifyProvider();
  });
});
