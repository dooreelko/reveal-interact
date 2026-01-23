import { App } from "cdktf";
import { CloudflareStack } from "./stack";

const app = new App();
new CloudflareStack(app, "cloudflare");
app.synth();
