import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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
        "Pause or unpause a MongoDB Atlas cluster. " +
        "When pausing, waits for the cluster to reach IDLE state first, " +
        "which may take several minutes after cluster creation or a recent operation. " +
        "When unpausing, issues the request immediately.";

    public argsShape = {
        projectId: AtlasArgs.projectId().describe("Atlas project ID that contains the cluster"),
        clusterName: AtlasArgs.clusterName().describe("Name of the cluster to pause or unpause"),
        paused: z.boolean().default(true).describe("true to pause the cluster, false to unpause it"),
    };

    protected async execute({
        projectId,
        clusterName,
        paused,
    }: ToolArgs<typeof this.argsShape>): Promise<CallToolResult> {
        if (paused) {
            await this.waitForIdle(projectId, clusterName);
        }

        await this.apiClient.updateCluster(projectId, clusterName, { paused });

        return {
            content: [{ type: "text", text: `Cluster "${clusterName}" has been ${paused ? "paused" : "unpaused"}.` }],
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
