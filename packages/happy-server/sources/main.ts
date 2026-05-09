import { createHappyServer } from "./index";
import { startMetricsServer } from "@/app/monitoring/metrics";
import { startDatabaseMetricsUpdater } from "@/app/monitoring/metrics2";
import { startTimeout } from "./app/presence/timeout";
import { log } from "@/utils/log";
import { awaitShutdown, onShutdown } from "@/utils/shutdown";

function installProcessHandlers() {
    process.on('uncaughtException', (error) => {
        log({
            module: 'process-error',
            level: 'error',
            stack: error.stack,
            name: error.name
        }, `Uncaught Exception: ${error.message}`);

        console.error('Uncaught Exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        const errorMsg = reason instanceof Error ? reason.message : String(reason);
        const errorStack = reason instanceof Error ? reason.stack : undefined;

        log({
            module: 'process-error',
            level: 'error',
            stack: errorStack,
            reason: String(reason)
        }, `Unhandled Rejection: ${errorMsg}`);

        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });

    process.on('warning', (warning) => {
        log({
            module: 'process-warning',
            level: 'warn',
            name: warning.name,
            stack: warning.stack
        }, `Process Warning: ${warning.message}`);
    });

    process.on('exit', (code) => {
        if (code !== 0) {
            log({
                module: 'process-exit',
                level: 'error',
                exitCode: code
            }, `Process exiting with code: ${code}`);
        } else {
            log({
                module: 'process-exit',
                level: 'info',
                exitCode: code
            }, 'Process exiting normally');
        }
    });
}

async function main() {
    installProcessHandlers();

    const dataDir = process.env.DATA_DIR || './data';
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
    const server = createHappyServer({
        dataDir,
        port,
        host: '0.0.0.0',
        machineKey: process.env.HANDY_MASTER_SECRET!,
        publicUrl: process.env.PUBLIC_URL,
        enablePrettyLogs: true,
    });

    onShutdown('happy-server', async () => {
        await server.stop();
    });

    await server.start();
    await startMetricsServer();
    startDatabaseMetricsUpdater();
    startTimeout();

    log('Ready');
    await awaitShutdown();
    log('Shutting down...');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
}).then(() => {
    process.exit(0);
});
