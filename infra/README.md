# Helium infrastructure

The local stack is defined in the root `docker-compose.yml`. It runs Neo4j Enterprise with APOC and Graph Data Science, then connects the Helium API and web services through the compose network.

For a production deployment, provide the variables in `.env.example` through the platform secret store, keep Neo4j volumes persistent, and expose the web service behind TLS. Tenant databases and credentials are created by the API's tenant provisioning path.
