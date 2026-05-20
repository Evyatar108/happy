import fs from 'node:fs'
import path from 'node:path'

import { codexuDefaultConfig } from './default-config.mjs'

const CONFIG_FILE_NAME = 'overview-config.json'

export function loadConfig({ repoRoot, configPath } = {}) {
    if (!repoRoot) {
        throw new Error('loadConfig requires repoRoot')
    }

    const absoluteRepoRoot = path.resolve(repoRoot)
    const selectedConfigPath = selectConfigPath({ repoRoot: absoluteRepoRoot, configPath })
    const committedConfig = readOptionalJson(selectedConfigPath, {
        required: selectedConfigPath !== defaultConfigPath(absoluteRepoRoot),
    })
    const localConfig = readOptionalJson(localOverlayPath(selectedConfigPath), { required: false })
    const mergedConfig = mergeConfig(codexuDefaultConfig, committedConfig, localConfig)
    const resolvedConfig = resolveConfigPaths(mergedConfig, absoluteRepoRoot)

    warnForMissingRalphSubdirs(resolvedConfig)

    return deepFreeze(resolvedConfig)
}

function selectConfigPath({ repoRoot, configPath }) {
    const selected = configPath || process.env.OVERVIEW_CONFIG_PATH || defaultConfigPath(repoRoot)
    return path.resolve(repoRoot, selected)
}

function defaultConfigPath(repoRoot) {
    return path.join(repoRoot, '.ralph', CONFIG_FILE_NAME)
}

function localOverlayPath(committedConfigPath) {
    const parsed = path.parse(committedConfigPath)
    const localName = parsed.ext === '.json' ? `${parsed.name}.local${parsed.ext}` : `${parsed.base}.local.json`
    return path.join(parsed.dir, localName)
}

function readOptionalJson(filePath, { required }) {
    if (!fs.existsSync(filePath)) {
        if (required) {
            throw new Error(`Config file not found: ${filePath}`)
        }
        return {}
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function mergeConfig(...configs) {
    return configs.reduce((merged, config) => mergeObject(merged, stripSchema(config)), {})
}

function stripSchema(config) {
    const { $schema: _schema, ...rest } = config
    return rest
}

function mergeObject(base, overlay) {
    const merged = { ...base }
    for (const [key, value] of Object.entries(overlay)) {
        if (isPlainObject(value) && isPlainObject(base[key])) {
            merged[key] = mergeObject(base[key], value)
        } else if (Array.isArray(value)) {
            merged[key] = [...value]
        } else {
            merged[key] = value
        }
    }
    return merged
}

function resolveConfigPaths(config, repoRoot) {
    const ralphRoot = resolvePath(repoRoot, config.ralphRoot)
    const { dataFile: _df, ralphRoot: _rr, ralphSubdirs, outputs, recommendations, lockFile: _lf, watcher, ...unknownRoot } = config
    const { jobs: _jobs, jobGroups: _jg, brainstorms: _bs, ...unknownRalphSubdirs } = ralphSubdirs
    const {
        sidecarJs: _sjs,
        sidecarJson: _sjson,
        snapshot: _snapshot,
        activity: _activity,
        activityBackup: _activityBackup,
        dataJson: _dataJson,
        snapshotSchema: _snapshotSchema,
        tasksIndex: _tasksIndex,
        recommendationsJson: _recommendationsJson,
        dependencyGraphJson: _dependencyGraphJson,
        activityMaxLines: _activityMaxLines,
        ...unknownOutputs
    } = outputs
    const { weights: _weights, topN: _topN, ...unknownRecommendations } = recommendations ?? {}
    const {
        stageUrgency: _stageUrgency,
        dependencyState: _dependencyState,
        freshness: _freshness,
        priority: _priority,
        ...unknownWeights
    } = recommendations?.weights ?? {}
    const { ignored: _ignored, ...unknownWatcher } = watcher
    return {
        ...unknownRoot,
        dataFile: resolvePath(repoRoot, config.dataFile),
        ralphRoot,
        ralphSubdirs: {
            ...unknownRalphSubdirs,
            jobs: resolvePath(ralphRoot, config.ralphSubdirs.jobs),
            jobGroups: resolvePath(ralphRoot, config.ralphSubdirs.jobGroups),
            brainstorms: resolvePath(ralphRoot, config.ralphSubdirs.brainstorms),
        },
        outputs: {
            ...unknownOutputs,
            sidecarJs: resolvePath(repoRoot, config.outputs.sidecarJs),
            sidecarJson: resolvePath(repoRoot, config.outputs.sidecarJson),
            snapshot: resolvePath(repoRoot, config.outputs.snapshot),
            activity: resolvePath(repoRoot, config.outputs.activity),
            activityBackup: resolvePath(repoRoot, config.outputs.activityBackup),
            dataJson: resolvePath(repoRoot, config.outputs.dataJson),
            snapshotSchema: resolvePath(repoRoot, config.outputs.snapshotSchema),
            tasksIndex: resolvePath(repoRoot, config.outputs.tasksIndex),
            recommendationsJson: resolvePath(repoRoot, config.outputs.recommendationsJson),
            dependencyGraphJson: resolvePath(repoRoot, config.outputs.dependencyGraphJson),
            activityMaxLines: config.outputs.activityMaxLines,
        },
        recommendations: {
            ...unknownRecommendations,
            weights: {
                ...unknownWeights,
                stageUrgency: recommendations.weights.stageUrgency,
                dependencyState: recommendations.weights.dependencyState,
                freshness: recommendations.weights.freshness,
                priority: recommendations.weights.priority,
            },
            topN: recommendations.topN,
        },
        lockFile: resolvePath(repoRoot, config.lockFile),
        watcher: {
            ...unknownWatcher,
            ignored: [...config.watcher.ignored],
        },
    }
}

function resolvePath(base, value) {
    return path.resolve(base, value)
}

function warnForMissingRalphSubdirs(config) {
    for (const [name, dirPath] of Object.entries(config.ralphSubdirs)) {
        if (!fs.existsSync(dirPath)) {
            console.warn(`overview-config: missing ralphSubdirs.${name} directory: ${dirPath}`)
        }
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
        return value
    }

    for (const child of Object.values(value)) {
        deepFreeze(child)
    }
    return Object.freeze(value)
}

