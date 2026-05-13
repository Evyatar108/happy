# Dev Tunnels API Discovery Result

Date: 2026-05-11

Sprint A depends on two Dev Tunnels facts: whether a user-scoped GitHub token can discover the user's tunnels with a label filter, and whether the Dev Tunnels connect JWT carries the GitHub numeric user ID needed for `/v2/me/*` authorization. The first is true through the Dev Tunnels REST API. The second is false.

## Tested Inputs

The tests used the GitHub OAuth token already held by `gh auth` for account `Evyatar108`. Token values were never printed. The local `devtunnel user show` login cache was expired, so the `devtunnel` CLI itself could not be used for authenticated listing in this run; direct REST calls with `Authorization: github <token>` were accepted by the Dev Tunnels API.

Base endpoint:

```text
GET https://global.rel.tunnels.api.visualstudio.com/tunnels?includePorts=true&global=true&api-version=2023-09-27-preview
Authorization: github <redacted>
X-Tunnel-User-Agent: happy-server/1.0
```

## Tag-Filtered Tunnel Listing

Dev Tunnels names these filters `labels`, not `tags`. A user-scoped GitHub token can list only that user's tunnels, and the `labels` query parameter filters server-side.

Fresh results from 2026-05-11:

| Request | Result |
| --- | --- |
| no label filter | HTTP 200, 3 tunnels returned |
| `labels=vscode-server-launcher` | HTTP 200, 1 tunnel returned, labels included `vscode-server-launcher` |
| `labels=cpc-evmit-v990n` | HTTP 200, 1 tunnel returned, labels included `cpc-evmit-v990n` |
| `labels=cpc-evmit-v990n,vscode-server-launcher` | HTTP 200, 1 tunnel returned |
| `labels=happy-machine` | HTTP 200, 0 tunnels returned because no current tunnel carries that label |

This is enough for US-A6/A7 to treat tag-filtered discovery as viable. Happy should use a stable label such as `happy-machine` on created tunnels and query with `labels=happy-machine` during discovery.

One caveat: `devtunnel list --access-token -` did not accept the GitHub CLI OAuth token and returned `Login required`. The code path should call the REST API directly for user-token discovery rather than shelling through the CLI for list operations.

## Connect JWT Introspection

Fetching a connect-scoped token worked with the same GitHub token:

```text
GET https://global.rel.tunnels.api.visualstudio.com/tunnels/<tunnelId>?tokenScopes=connect&api-version=2023-09-27-preview
Authorization: github <redacted>
```

The response contained `accessTokens.connect`, a JWT signed with `ES256`. Decoding the header and payload produced only Dev Tunnels tunnel metadata:

```json
{
  "header": {
    "alg": "ES256",
    "kid": "061389301F2490F3311CAD6767307CD22ADFC3A1",
    "typ": "JWT"
  },
  "payload": {
    "clusterId": "usw2",
    "tunnelId": "<tunnelId>",
    "scp": "connect",
    "exp": 1778583057,
    "iss": "https://tunnels.api.visualstudio.com/",
    "nbf": 1778495757
  }
}
```

There was no GitHub numeric ID, login, `sub`, `oid`, or other end-user identity claim. Treat the connect JWT as proof that Dev Tunnels authorized access to that tunnel, not as an account identity source.

## Fallback Identity Path

US-A6/A7 should rely on the GitHub identity already fetched inside the `/pair/status` request scope. `packages/happy-server/sources/app/api/routes/pairRoutes.ts` calls `api.github.com/user` through `fetchGitHubUser(tokenData.access_token)` before issuing the Happy tunnel claim. That response is the right place to read:

```ts
{
  id: number,
  login: string,
  name?: string | null,
  avatar_url?: string | null
}
```

Historical recommendation: at the time, add `accountId` to the Happy Ed25519 tunnel claim from this in-scope `githubUser.id` result. That recommendation is obsolete after the remove-tunnel-claim-layer work; Dev Tunnels gateway auth is now the remote gate and happy-server collapses identity to the local user id.

## Ownership, Deletion, and Crash Recovery

Observed ownership semantics are identity-scoped. The `Evyatar108` GitHub token returned the user's Dev Tunnels. The active `evmitran_microsoft` GitHub token returned HTTP 200 with zero tunnels from the same list endpoint. That means discovery is scoped to the authenticated Dev Tunnels owner identity, which is the behavior Happy needs.

Deletion should remain owner-driven. The CLI supports `devtunnel delete <tunnel-id> --access-token -`, and the REST API's list/get behavior shows the token only sees tunnels owned by that identity. Sprint A should not delete tunnels during crash recovery; it should reuse the persisted `tunnelId` when possible and reserve deletion for explicit user/logout cleanup.

Crash recovery recommendation:

1. Persist `tunnelId`, tunnel URL, and local port in `~/.happy`.
2. On daemon startup, call `devtunnel port create <tunnelId> --port-number <port> --protocol http`; the current wrapper already treats "already exists" as idempotent.
3. Call `devtunnel update <tunnelId> --expiration 30d` when the persisted tunnel is near expiry.
4. Start `devtunnel host <tunnelId> --port-number <port>`.
5. If the persisted tunnel no longer exists or cannot be updated by the owner token, create a new labeled tunnel and publish the new URL.

The list response includes disconnected tunnels with `hostConnectionCount: 0`, `lastHostConnectionTime`, and `expiration`, so a daemon crash does not erase the tunnel record immediately. That supports reuse-first recovery and avoids unnecessary tunnel churn.

## Sprint A Recommendation

Historical Sprint A recommendation (obsolete after remove-tunnel-claim-layer): US-A6/A7 should use Dev Tunnels JWT verification only as a transport-access validator. The authoritative Happy account identity should come from `api.github.com/user` inside `/pair/status`, and the resulting numeric `githubUser.id` should be copied into the Happy-signed tunnel claim as optional `accountId` for backward compatibility. After the remove-tunnel-claim-layer work, the Happy-signed tunnel claim and its `accountId` field have been removed entirely; Dev Tunnels gateway auth (`X-Tunnel-Authorization`) is now the sole remote identity gate, and happy-server collapses identity to the local user id.

