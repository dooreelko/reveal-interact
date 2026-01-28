cloudflare implementation should 
- use separate worker for each api container
- each worker must import architecture and use architectureBinding with overloads (see https://github.com/dooreelko/cdk-arch/blob/main/packages/example/cloudflare/scripts/bundle-workers.js on how to solve cloudflare building)

