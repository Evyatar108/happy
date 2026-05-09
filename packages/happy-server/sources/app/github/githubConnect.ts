import { Context } from "@/context";
import { GitHubProfile } from "@/app/api/types";

/**
 * Connects a GitHub account to a user profile.
 * 
 * Flow:
 * 1. Check if already connected to same account - early exit if yes
 * 2. If GitHub account is connected to another user - disconnect it first
 * 3. Upload avatar to S3 (non-transactional operation)
 * 4. In transaction: persist GitHub account and link to user with GitHub username
 * 5. Send socket update after transaction completes
 * 
 * @param ctx - Request context containing user ID
 * @param githubProfile - GitHub profile data from OAuth
 * @param accessToken - GitHub access token for API access
 */
export async function githubConnect(
    ctx: Context,
    githubProfile: GitHubProfile,
    accessToken: string
): Promise<void> {
    return;
}
