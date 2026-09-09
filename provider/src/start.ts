/** Runs example-graphql-product-provider standalone: `npm run start:provider`. */

import { startProviderServer } from './server';

const port = Number(process.env.PORT ?? 4000);

startProviderServer(port)
  .then((server) => {
    console.log(`example-graphql-product-provider listening on ${server.url}/graphql`);
  })
  .catch((error) => {
    console.error('failed to start example-graphql-product-provider:', error);
    process.exit(1);
  });
