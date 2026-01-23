import { App } from "cdktf";
import { LocalDockerStack } from "./stack";

const app = new App();
new LocalDockerStack(app, "local-docker");
app.synth();
