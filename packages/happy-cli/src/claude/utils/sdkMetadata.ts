import type { Metadata } from '@/api/types';
import type {
    SDKControlInitializeResponse,
    SDKControlReloadPluginsResponse,
    SDKSystemMessage,
} from '@/claude/sdk';

export type SDKInitMetadata = Pick<
    Metadata,
    'tools'
    | 'slashCommands'
    | 'skills'
    | 'agents'
    | 'plugins'
    | 'outputStyle'
    | 'mcpServers'
>;

export function mapSystemInitToMetadata(init: SDKSystemMessage): SDKInitMetadata {
    return {
        tools: init.tools,
        slashCommands: init.slash_commands,
        skills: init.skills,
        agents: init.agents,
        plugins: init.plugins,
        outputStyle: init.output_style,
        mcpServers: init.mcp_servers,
    };
}

function mapControlCommandsToSlashCommands(
    commands: SDKControlInitializeResponse['commands'] | undefined,
): SDKInitMetadata['slashCommands'] {
    return commands?.map(command => command.name);
}

function mapControlAgentsToMetadata(
    agents: SDKControlInitializeResponse['agents'] | undefined,
): SDKInitMetadata['agents'] {
    return agents?.map(agent => agent.name);
}

export function mergeControlApiResultsIntoInitMetadata(
    initFromStream: SDKInitMetadata,
    initResult: SDKControlInitializeResponse,
    reloadResult: SDKControlReloadPluginsResponse,
): SDKInitMetadata {
    return {
        tools: initFromStream.tools,
        slashCommands:
            mapControlCommandsToSlashCommands(initResult.commands) ?? initFromStream.slashCommands,
        skills: initFromStream.skills,
        agents: mapControlAgentsToMetadata(initResult.agents) ?? initFromStream.agents,
        plugins: reloadResult.plugins ?? initFromStream.plugins,
        outputStyle: initResult.output_style ?? initFromStream.outputStyle,
        mcpServers: reloadResult.mcpServers ?? initFromStream.mcpServers,
    };
}

export function mergeSDKInitMetadata(current: Metadata, update: SDKInitMetadata): Metadata {
    const nextMetadata: Metadata = { ...current };

    if (update.tools !== undefined) {
        nextMetadata.tools = update.tools;
    }
    if (update.slashCommands !== undefined) {
        nextMetadata.slashCommands = update.slashCommands;
    }
    if (update.skills !== undefined) {
        nextMetadata.skills = update.skills;
    }
    if (update.agents !== undefined) {
        nextMetadata.agents = update.agents;
    }
    if (update.plugins !== undefined) {
        nextMetadata.plugins = update.plugins;
    }
    if (update.outputStyle !== undefined) {
        nextMetadata.outputStyle = update.outputStyle;
    }
    if (update.mcpServers !== undefined) {
        nextMetadata.mcpServers = update.mcpServers;
    }

    return nextMetadata;
}
