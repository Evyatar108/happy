import * as z from 'zod';

export const AgentTreeNodeSchema = z.object({
  threadId: z.string(),
  agentRole: z.string(),
  nickname: z.string().nullable(),
  status: z.string(),
  lastTaskMessage: z.string().optional(),
  spawnedAt: z.number(),
});
export type AgentTreeNode = z.infer<typeof AgentTreeNodeSchema>;

export const AgentTreeEdgeSchema = z.object({
  parent: z.string(),
  child: z.string(),
});
export type AgentTreeEdge = z.infer<typeof AgentTreeEdgeSchema>;

export const AgentTreeSnapshotSchema = z.object({
  nodes: z.array(AgentTreeNodeSchema),
  edges: z.array(AgentTreeEdgeSchema),
  seq: z.number(),
});
export type AgentTreeSnapshot = z.infer<typeof AgentTreeSnapshotSchema>;

export const AgentTreePendingSpawnStartedDeltaSchema = z.object({
  type: z.literal('pending-spawn-started'),
  seq: z.number(),
  callId: z.string(),
  parentThreadId: z.string(),
  agentRole: z.string(),
  nickname: z.string().nullable(),
  taskMessage: z.string().optional(),
  startedAt: z.number(),
});
export type AgentTreePendingSpawnStartedDelta = z.infer<typeof AgentTreePendingSpawnStartedDeltaSchema>;

export const AgentTreeNodeAddedDeltaSchema = z.object({
  type: z.literal('node-added'),
  seq: z.number(),
  node: AgentTreeNodeSchema,
  edge: AgentTreeEdgeSchema,
});
export type AgentTreeNodeAddedDelta = z.infer<typeof AgentTreeNodeAddedDeltaSchema>;

export const AgentTreeNodeStatusChangedDeltaSchema = z.object({
  type: z.literal('node-status-changed'),
  seq: z.number(),
  threadId: z.string(),
  status: z.string(),
  lastTaskMessage: z.string().optional(),
});
export type AgentTreeNodeStatusChangedDelta = z.infer<typeof AgentTreeNodeStatusChangedDeltaSchema>;

export const AgentTreeNodeRemovedDeltaSchema = z.object({
  type: z.literal('node-removed'),
  seq: z.number(),
  threadId: z.string(),
});
export type AgentTreeNodeRemovedDelta = z.infer<typeof AgentTreeNodeRemovedDeltaSchema>;

export const AgentTreeDeltaSchema = z.discriminatedUnion('type', [
  AgentTreePendingSpawnStartedDeltaSchema,
  AgentTreeNodeAddedDeltaSchema,
  AgentTreeNodeStatusChangedDeltaSchema,
  AgentTreeNodeRemovedDeltaSchema,
]);
export type AgentTreeDelta = z.infer<typeof AgentTreeDeltaSchema>;

// Socket.IO payload schemas
export const AgentTreeUpdateInboundPayloadSchema = z.object({
  delta: AgentTreeDeltaSchema,
});
export type AgentTreeUpdateInboundPayload = z.infer<typeof AgentTreeUpdateInboundPayloadSchema>;

export const AgentTreeUpdateOutboundPayloadSchema = z.object({
  sessionId: z.string(),
  delta: AgentTreeDeltaSchema,
});
export type AgentTreeUpdateOutboundPayload = z.infer<typeof AgentTreeUpdateOutboundPayloadSchema>;

// RPC envelope schemas
export const SessionGetAgentTreeRequestSchema = z.object({
  sessionId: z.string(),
});
export type SessionGetAgentTreeRequest = z.infer<typeof SessionGetAgentTreeRequestSchema>;

export const SessionGetAgentTreeResponseSchema = AgentTreeSnapshotSchema;
export type SessionGetAgentTreeResponse = z.infer<typeof SessionGetAgentTreeResponseSchema>;
