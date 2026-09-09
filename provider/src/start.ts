/** Runs product-provider standalone: `npm run start:provider`. */

import { startProviderServer } from './server';

const port = Number(process.env.PORT ?? 4000);

startProviderServer(port)
  .then((server) => {
    console.log(`product-provider listening on ${server.url}/graphql`);
  })
  .catch((error) => {
    console.error('failed to start product-provider:', error);
    process.exit(1);
  });
