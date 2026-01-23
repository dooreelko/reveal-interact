import { TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { DockerProvider } from "@cdktf/provider-docker/lib/provider";

export class LocalDockerStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new DockerProvider(this, "docker", {});

    // Add Docker resources here (containers, images, networks, etc.)
  }
}
