import { TerraformStack } from "cdktf";
import { Construct } from "constructs";
import { CloudflareProvider } from "@cdktf/provider-cloudflare/lib/provider";

export class CloudflareStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new CloudflareProvider(this, "cloudflare", {});

    // Add Cloudflare resources here (workers, pages, DNS, etc.)
  }
}
