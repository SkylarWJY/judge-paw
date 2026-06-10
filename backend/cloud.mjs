export function getCloudStatus(config, cloudTargets) {
  const awsConfigured = Boolean(config.cloud.aws.apiEndpoint);
  const d1Configured = Boolean(config.cloud.cloudflare.accountId && config.cloud.cloudflare.d1DatabaseId);

  return {
    recommendation: {
      localNow: "Node REST API + local SQLite, using the same SQL shape that can migrate to Cloudflare D1.",
      mvpCloud: "Cloudflare Workers + D1 if the priority is speed, low ops, edge REST APIs, and simple relational case storage.",
      awsHeavyBackend:
        "AWS ECS/Fargate or Lambda + API Gateway if the backend later needs long-running services, VPC resources, queues, private networking, or AWS-native compliance.",
      hybridWarning:
        "AWS compute directly using Cloudflare D1 is possible through HTTP APIs, but it is cross-cloud. Keep the database adapter boundary until traffic and compliance needs are clear."
    },
    local: {
      apiHost: config.host,
      apiPort: config.port,
      databasePath: config.databasePath
    },
    adapters: {
      awsServer: {
        provider: "aws",
        target: config.cloud.aws.backendTarget,
        region: config.cloud.aws.region,
        configured: awsConfigured,
        endpoint: config.cloud.aws.apiEndpoint,
        requiredEnv: ["AWS_REGION", "AWS_BACKEND_TARGET", "AWS_API_ENDPOINT"]
      },
      cloudflareDatabase: {
        provider: "cloudflare",
        target: "d1",
        databaseName: config.cloud.cloudflare.d1DatabaseName,
        configured: d1Configured,
        workerEndpoint: config.cloud.cloudflare.workerEndpoint,
        requiredEnv: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_WORKER_ENDPOINT"]
      }
    },
    targets: cloudTargets
  };
}
