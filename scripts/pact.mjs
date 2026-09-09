#!/usr/bin/env node
/**
 * Thin wrapper over the Pact CLI (`@pact-foundation/pact-cli`).
 *
 * Its only real job is deriving the *application version* and *branch* the same way in every
 * lifecycle stage. Publishing a pact under one version and then asking can-i-deploy about a
 * different one is the classic way to get a green build that proves nothing, so the derivation
 * lives here once rather than being repeated across npm scripts and CI steps.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ENVIRONMENT = process.env.PACT_ENVIRONMENT ?? 'production';
const PACTS_DIR = resolve(root, 'consumer', 'pacts');

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

/**
 * CI systems set these; locally we fall back to git. Prefer the env vars, because in a detached
 * HEAD (which is how most CI systems check out a PR) `git branch --show-current` is empty.
 */
const version = process.env.GIT_COMMIT || git('rev-parse', 'HEAD');
const branch = process.env.GIT_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD');

function requireBrokerConfig() {
  if (!process.env.PACT_BROKER_BASE_URL) {
    fail(
      'PACT_BROKER_BASE_URL is not set.\n' +
        'Copy .env.example to .env and fill in your PactFlow URL and token, then re-run with:\n' +
        '  set -a && source .env && set +a',
    );
  }
  if (!process.env.PACT_BROKER_TOKEN && !process.env.PACT_BROKER_USERNAME) {
    fail('Set PACT_BROKER_TOKEN (PactFlow) or PACT_BROKER_USERNAME/PASSWORD (OSS broker).');
  }
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Runs a Pact CLI binary from node_modules/.bin, inheriting stdio so output streams live. */
function pact(binary, args) {
  console.log(`\n→ ${binary} ${args.join(' ')}\n`);
  const result = spawnSync(binary, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: root,
    env: process.env,
  });
  if (result.error) {
    fail(`could not run ${binary}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const commands = {
  /** Publishes every pact the consumer tests wrote, tagged with the current version and branch. */
  publish() {
    requireBrokerConfig();
    if (!existsSync(PACTS_DIR)) {
      fail(`no pacts found at ${PACTS_DIR} — run \`npm run test:consumer\` first.`);
    }
    pact('pact-broker', [
      'publish',
      PACTS_DIR,
      '--consumer-app-version',
      version,
      '--branch',
      branch,
    ]);
  },

  /**
   * The release gate. Asks the broker whether this exact version of this application is compatible
   * with whatever is currently in the target environment.
   */
  'can-i-deploy'(pacticipant) {
    requireBrokerConfig();
    pact('pact-broker', [
      'can-i-deploy',
      '--pacticipant',
      pacticipant,
      '--version',
      version,
      '--to-environment',
      ENVIRONMENT,
      // Without this, a version whose verification has not been published yet returns "unknown"
      // and the gate passes on a contract nobody checked.
      '--retry-while-unknown',
      '6',
      '--retry-interval',
      '10',
    ]);
  },

  /** Tells the broker what is actually running where, which is what can-i-deploy reads back. */
  'record-deployment'(pacticipant) {
    requireBrokerConfig();
    pact('pact-broker', [
      'record-deployment',
      '--pacticipant',
      pacticipant,
      '--version',
      version,
      '--environment',
      ENVIRONMENT,
    ]);
  },

  /**
   * Stands in for a real deployment. In a real project this is your helm upgrade / terraform
   * apply / whatever — the part that matters for this example is that record-deployment runs
   * *after* it succeeds, so the broker never claims something is deployed that is not.
   */
  deploy(pacticipant) {
    console.log(`\n🚀 Deploying ${pacticipant} ${version.slice(0, 8)} to ${ENVIRONMENT}...`);
    console.log('   (simulated — replace this with your real deployment)');
    commands['record-deployment'](pacticipant);
  },
};

const [command, pacticipant] = process.argv.slice(2);

if (!command || !commands[command]) {
  fail(`usage: node scripts/pact.mjs <${Object.keys(commands).join('|')}> [pacticipant]`);
}

if (command !== 'publish' && !pacticipant) {
  fail(`\`${command}\` needs a pacticipant name, e.g. example-graphql-product-consumer`);
}

if (!version) {
  fail('could not determine an application version — set GIT_COMMIT or run inside a git repo.');
}

console.log(`pacticipant version: ${version}`);
console.log(`branch:              ${branch || '(none)'}`);
console.log(`environment:         ${ENVIRONMENT}`);

commands[command](pacticipant);
