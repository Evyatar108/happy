import { afterEach, describe, expect, it } from "vitest";
import { configureApi, createApi } from "../api";

describe("CORS allowed methods and headers", () => {
    const originalOrigins = process.env.HAPPY_CORS_ORIGINS;
    const apps: ReturnType<typeof createApi>[] = [];

    afterEach(async () => {
        process.env.HAPPY_CORS_ORIGINS = originalOrigins;
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it("allows PUT preflight for /v2/me/settings and lists X-Loopback-Capability", async () => {
        process.env.HAPPY_CORS_ORIGINS = "https://app.example.test";
        const app = createApi();
        apps.push(app);
        configureApi(app);

        const response = await app.inject({
            method: "OPTIONS",
            url: "/v2/me/settings",
            headers: {
                Origin: "https://app.example.test",
                "Access-Control-Request-Method": "PUT",
                "Access-Control-Request-Headers": "X-Loopback-Capability",
            },
        });

        expect(response.statusCode).toBe(204);
        expect(response.headers["access-control-allow-methods"]).toContain("PUT");
        expect(response.headers["access-control-allow-headers"]).toContain("X-Loopback-Capability");
    });
});

