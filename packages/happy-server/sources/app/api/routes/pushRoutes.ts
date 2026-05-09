import { z } from "zod";
import { type Fastify } from "../types";
import { type TofuHandshakeConfig } from "../api";
import { listPushTokens, registerPushToken, unregisterPushToken } from "@/app/push/pushNotifications";

export function pushRoutes(app: Fastify, tofuConfig: TofuHandshakeConfig = { localUserId: "local-user" }) {

    app.post('/push/register', {
        schema: {
            body: z.object({
                expoPushToken: z.string(),
                deviceId: z.string()
            }),
            response: {
                200: z.object({
                    success: z.literal(true)
                }),
                500: z.object({
                    error: z.literal('Failed to register push token')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { expoPushToken, deviceId } = request.body;

        try {
            await registerPushToken({
                machineId: tofuConfig.localUserId,
                deviceId,
                expoPushToken,
            });

            return reply.send({ success: true });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to register push token' });
        }
    });
    
    // Push Token Registration API
    app.post('/v1/push-tokens', {
        schema: {
            body: z.object({
                token: z.string(),
                deviceId: z.string().optional()
            }),
            response: {
                200: z.object({
                    success: z.literal(true)
                }),
                500: z.object({
                    error: z.literal('Failed to register push token')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { token, deviceId } = request.body;

        try {
            await registerPushToken({
                machineId: tofuConfig.localUserId,
                deviceId: deviceId ?? token,
                expoPushToken: token,
            });

            return reply.send({ success: true });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to register push token' });
        }
    });

    // Delete Push Token API
    app.delete('/v1/push-tokens/:token', {
        schema: {
            params: z.object({
                token: z.string()
            }),
            response: {
                200: z.object({
                    success: z.literal(true)
                }),
                500: z.object({
                    error: z.literal('Failed to delete push token')
                })
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const { token } = request.params;

        try {
            await unregisterPushToken(tofuConfig.localUserId, token);

            return reply.send({ success: true });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to delete push token' });
        }
    });

    // Get Push Tokens API
    app.get('/v1/push-tokens', {
        preHandler: app.authenticate
    }, async (request, reply) => {
        try {
            const tokens = await listPushTokens(tofuConfig.localUserId);

            return reply.send({
                tokens: tokens.map(t => ({
                    id: t.id,
                    token: t.expoPushToken,
                    createdAt: t.createdAt.getTime(),
                    updatedAt: t.updatedAt.getTime()
                }))
            });
        } catch (error) {
            return reply.code(500).send({ error: 'Failed to get push tokens' });
        }
    });
}
