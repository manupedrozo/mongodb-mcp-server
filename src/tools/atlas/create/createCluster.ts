import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type ToolArgs, type OperationType } from "../../tool.js";
import { AtlasToolBase } from "../atlasTool.js";
import type { ClusterDescription20240805 } from "../../../common/atlas/openapi.js";
import { ensureCurrentIpInAccessList } from "../../../common/atlas/accessListUtils.js";
import { AtlasArgs } from "../../args.js";

const ClusterProfile = z.enum(["DEV", "PROD", "HIGH_AVAILABILITY"]);
type ClusterProfile = z.infer<typeof ClusterProfile>;

export class CreateClusterTool extends AtlasToolBase {
    static toolName = "atlas-create-cluster";
    static operationType: OperationType = "create";
    static category = "atlas" as const;

    public description =
        "Create a MongoDB Atlas cluster using an opinionated profile. " +
        "Use DEV for development, testing, or staging environments where cost matters more than durability — " +
        "smallest viable tier (M10), auto-scaling enabled, no backup, single AWS region. " +
        "Use PROD for single-region production workloads that need durability and auto-scaling " +
        "but do not require multi-region failover — M30, backup enabled, AWS us-east-1. " +
        "Use HIGH_AVAILABILITY for production workloads that must survive a full regional outage — " +
        "three AWS regions (us-east-1 primary, us-west-2, us-east-2), electable nodes in each, " +
        "automatic failover with no manual intervention, M30, backup enabled.";

    public argsShape = {
        projectId: AtlasArgs.projectId().describe("Atlas project ID to create the cluster in"),
        name: AtlasArgs.clusterName().describe("Name of the cluster"),
        profile: ClusterProfile.default("DEV").describe(
            "Cluster profile: DEV (cheap, no backup, single region), " +
                "PROD (single-region production, M30, backup), " +
                "HIGH_AVAILABILITY (3-region AWS, M30, backup, survives regional outage)"
        ),
        region: AtlasArgs.region()
            .default("US_EAST_1")
            .describe("AWS region for DEV clusters. Ignored for PROD and HIGH_AVAILABILITY profiles."),
    };

    protected async execute({
        projectId,
        name,
        profile,
        region,
    }: ToolArgs<typeof this.argsShape>): Promise<CallToolResult> {
        await ensureCurrentIpInAccessList(this.apiClient, projectId);

        const body = this.buildBody(name, profile, region);

        await this.apiClient.createCluster({
            params: { path: { groupId: projectId } },
            body,
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Cluster "${name}" (profile: ${profile}) creation requested in project ${projectId}.`,
                },
            ],
        };
    }

    private buildBody(name: string, profile: ClusterProfile, region: string): ClusterDescription20240805 {
        const base = {
            name,
            clusterType: "REPLICASET" as const,
            terminationProtectionEnabled: false,
        };

        switch (profile) {
            case "DEV":
                return {
                    ...base,
                    backupEnabled: false,
                    replicationSpecs: [
                        {
                            zoneName: "Zone 1",
                            regionConfigs: [
                                {
                                    providerName: "AWS",
                                    regionName: region,
                                    priority: 7,
                                    electableSpecs: { instanceSize: "M10", nodeCount: 3 },
                                    autoScaling: {
                                        compute: {
                                            enabled: true,
                                            scaleDownEnabled: true,
                                            minInstanceSize: "M10",
                                            maxInstanceSize: "M40",
                                        },
                                        diskGB: { enabled: true },
                                    },
                                },
                            ],
                        },
                    ],
                } as unknown as ClusterDescription20240805;

            case "PROD":
                return {
                    ...base,
                    backupEnabled: true,
                    replicationSpecs: [
                        {
                            zoneName: "Zone 1",
                            regionConfigs: [
                                {
                                    providerName: "AWS",
                                    regionName: "US_EAST_1",
                                    priority: 7,
                                    electableSpecs: { instanceSize: "M30", nodeCount: 3 },
                                    autoScaling: {
                                        compute: {
                                            enabled: true,
                                            scaleDownEnabled: true,
                                            minInstanceSize: "M30",
                                            maxInstanceSize: "M60",
                                        },
                                        diskGB: { enabled: true },
                                    },
                                },
                            ],
                        },
                    ],
                } as unknown as ClusterDescription20240805;

            case "HIGH_AVAILABILITY":
                return {
                    ...base,
                    backupEnabled: true,
                    replicationSpecs: [
                        {
                            zoneName: "Zone 1",
                            regionConfigs: [
                                {
                                    providerName: "AWS",
                                    regionName: "US_EAST_1",
                                    priority: 7,
                                    electableSpecs: { instanceSize: "M30", nodeCount: 3 },
                                    autoScaling: {
                                        compute: {
                                            enabled: true,
                                            scaleDownEnabled: true,
                                            minInstanceSize: "M30",
                                            maxInstanceSize: "M80",
                                        },
                                        diskGB: { enabled: true },
                                    },
                                },
                                {
                                    providerName: "AWS",
                                    regionName: "US_WEST_2",
                                    priority: 6,
                                    electableSpecs: { instanceSize: "M30", nodeCount: 2 },
                                    autoScaling: {
                                        compute: {
                                            enabled: true,
                                            scaleDownEnabled: true,
                                            minInstanceSize: "M30",
                                            maxInstanceSize: "M80",
                                        },
                                        diskGB: { enabled: true },
                                    },
                                },
                                {
                                    providerName: "AWS",
                                    regionName: "US_EAST_2",
                                    priority: 5,
                                    electableSpecs: { instanceSize: "M30", nodeCount: 2 },
                                    autoScaling: {
                                        compute: {
                                            enabled: true,
                                            scaleDownEnabled: true,
                                            minInstanceSize: "M30",
                                            maxInstanceSize: "M80",
                                        },
                                        diskGB: { enabled: true },
                                    },
                                },
                            ],
                        },
                    ],
                } as unknown as ClusterDescription20240805;
        }
    }
}
