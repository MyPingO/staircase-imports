import { defineConfig } from "@vscode/test-cli";
import path from "node:path";

const version = process.env.VSCODE_VERSION || "stable";

export default defineConfig({
	files: "test/integration/**/*.test.js",
	version,
	launchArgs: [
		`--user-data-dir=${path.resolve(".vscode-test", "profiles", version)}`,
		`--extensions-dir=${path.resolve(".vscode-test", "extensions", version)}`,
		"--disable-extensions",
		"--disable-gpu",
		"--skip-welcome",
		"--skip-release-notes",
		"--disable-workspace-trust",
	],
	mocha: { timeout: 15000 },
});
