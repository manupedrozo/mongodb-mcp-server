import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type ToolArgs, type OperationType } from "../../tool.js";
import { AtlasToolBase } from "../atlasTool.js";
import { AtlasArgs } from "../../args.js";

const POLL_INTERVAL_MS = 10_000;
const MAX_ATTEMPTS = 30; // ~5 minutes

export class PauseClusterTool extends AtlasToolBase {
    static toolName = "atlas-pause-cluster";
    static operationType: OperationType = "update";
    static category = "atlas" as const;

    public description =
        "Pause a running MongoDB Atlas cluster. " +
        "Waits for the cluster to reach IDLE state before issuing the pause, " +
        "which may take several minutes after cluster creation.";

    public argsShape = {
        projectId: AtlasArgs.projectId().describe("Atlas project ID that contains the cluster"),
        clusterName: AtlasArgs.clusterName().describe("Name of the cluster to pause"),
    };

    protected async execute({ projectId, clusterName }: ToolArgs<typeof this.argsShape>): Promise<CallToolResult> {
        await this.waitForIdle(projectId, clusterName);

        await this.apiClient.updateCluster(projectId, clusterName, { paused: true });

        return {
            content: [{ type: "text", text: `Cluster "${clusterName}" has been paused.` }],
        };
    }

    private async waitForIdle(projectId: string, clusterName: string): Promise<void> {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const cluster = await this.apiClient.getCluster({
                params: { path: { groupId: projectId, clusterName } },
            });

            if (cluster.stateName === "IDLE") {
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        throw new Error(
            `Cluster "${clusterName}" did not reach IDLE state within ${(MAX_ATTEMPTS * POLL_INTERVAL_MS) / 60_000} minutes.`
        );
    }
}
