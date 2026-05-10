import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ToolView } from '@/components/tools/ToolView';
import { ItemGroup } from '@/components/ItemGroup';
import { Item } from '@/components/Item';
import { Metadata } from '@/sync/storageTypes';

export default function Tools2Screen() {
    const [selectedExample, setSelectedExample] = useState<string>('all');
    const pathFixtureMetadata: Metadata = { path: '/Users/steve/project', host: 'devbox' };

    // Example tool calls data - matching ToolCall interface
    const examples = {
        read: {
            name: 'Read',
            state: 'completed' as const,
            input: {
                file_path: '/Users/steve/project/src/components/Header.tsx',
                offset: 100,
                limit: 50
            },
            createdAt: Date.now() - 2000,
            startedAt: Date.now() - 1900,
            completedAt: Date.now() - 1000,
            description: null,
            result: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const Header = ({ title }) => {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        height: 60,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
    },
});`,
            children: []
        },
        readError: {
            name: 'Read',
            state: 'error' as const,
            input: {
                file_path: '/Users/steve/project/src/components/NotFound.tsx'
            },
            createdAt: Date.now() - 3000,
            startedAt: Date.now() - 2900,
            completedAt: Date.now() - 2000,
            description: null,
            result: 'File not found: /Users/steve/project/src/components/NotFound.tsx',
            children: []
        },
        edit: {
            name: 'Edit',
            state: 'completed' as const,
            input: {
                file_path: '/Users/steve/project/package.json',
                old_string: '"version": "1.0.0"',
                new_string: '"version": "1.0.1"',
                replace_all: false
            },
            createdAt: Date.now() - 4000,
            startedAt: Date.now() - 3900,
            completedAt: Date.now() - 3000,
            description: null,
            result: 'File updated successfully',
            children: []
        },
        editFix: {
            name: 'Edit',
            state: 'completed' as const,
            input: {
                file_path: '/Users/steve/project/src/components/Header.tsx',
                old_string: 'export const Header = ({ title }) => {',
                new_string: 'export const Header = ({ title, subtitle }) => {',
                replace_all: false
            },
            createdAt: Date.now() - 4500,
            startedAt: Date.now() - 4400,
            completedAt: Date.now() - 3500,
            description: null,
            result: 'File updated successfully',
            children: []
        },
        multiEditFix: {
            name: 'MultiEdit',
            state: 'completed' as const,
            input: {
                file_path: '/Users/steve/project/src/components/Header.tsx',
                edits: [
                    {
                        old_string: 'export const Header = ({ title }) => {',
                        new_string: 'export const Header = ({ title, subtitle }) => {',
                        replace_all: false
                    },
                    {
                        old_string: '<Text style={styles.title}>{title}</Text>',
                        new_string: '<Text style={styles.title}>{title}</Text>\n            <Text style={styles.subtitle}>{subtitle}</Text>',
                        replace_all: true
                    }
                ]
            },
            createdAt: Date.now() - 4600,
            startedAt: Date.now() - 4500,
            completedAt: Date.now() - 3600,
            description: null,
            result: 'File updated successfully',
            children: []
        },
        taskOutputRunning: {
            name: 'TaskOutput',
            state: 'running' as const,
            input: {
                task_id: 'task-running-1',
                block: true,
                timeout: 15000,
            },
            createdAt: Date.now() - 5000,
            startedAt: Date.now() - 4900,
            completedAt: null,
            description: null,
            children: []
        },
        taskOutputSchemaMatch: {
            name: 'TaskOutput',
            state: 'completed' as const,
            input: {
                task_id: 'task-schema-1',
                block: false,
                timeout: 30000,
            },
            createdAt: Date.now() - 5200,
            startedAt: Date.now() - 5100,
            completedAt: Date.now() - 4200,
            description: null,
            result: {
                retrieval_status: 'success',
                task: {
                    task_id: 'task-schema-1',
                    task_type: 'general',
                    status: 'completed',
                    description: 'Summarize recent test failures',
                    output: 'Found two failing assertions in TaskOutputView.test.tsx and grouped them by fallback branch.',
                    prompt: 'Summarize recent test failures',
                    result: 'Summary complete',
                }
            },
            children: []
        },
        taskOutputString: {
            name: 'TaskOutput',
            state: 'completed' as const,
            input: {
                task_id: 'task-string-1',
            },
            createdAt: Date.now() - 5400,
            startedAt: Date.now() - 5300,
            completedAt: Date.now() - 4400,
            description: null,
            result: 'Plain string task output excerpt.',
            children: []
        },
        taskOutputObjectMismatch: {
            name: 'TaskOutput',
            state: 'completed' as const,
            input: {
                task_id: 'task-unknown-1',
            },
            createdAt: Date.now() - 5600,
            startedAt: Date.now() - 5500,
            completedAt: Date.now() - 4600,
            description: null,
            result: {
                unexpected: true,
                payload: 'This shape intentionally has no canonical TaskOutput fields.',
            },
            children: []
        },
        taskOutputNull: {
            name: 'TaskOutput',
            state: 'completed' as const,
            input: {
                task_id: 'task-null-1',
            },
            createdAt: Date.now() - 5800,
            startedAt: Date.now() - 5700,
            completedAt: Date.now() - 4800,
            description: null,
            result: null,
            children: []
        },
        taskStopRunning: {
            name: 'TaskStop',
            state: 'running' as const,
            input: {
                task_id: 'stop-running-1',
            },
            createdAt: Date.now() - 6000,
            startedAt: Date.now() - 5900,
            completedAt: null,
            description: null,
            children: []
        },
        taskStopSchemaMatch: {
            name: 'TaskStop',
            state: 'completed' as const,
            input: {
                task_id: 'stop-schema-1',
            },
            createdAt: Date.now() - 6200,
            startedAt: Date.now() - 6100,
            completedAt: Date.now() - 5200,
            description: null,
            result: {
                stopped: true,
                status: 'completed',
            },
            children: []
        },
        taskStopString: {
            name: 'TaskStop',
            state: 'error' as const,
            input: {
                task_id: 'stop-string-1',
            },
            createdAt: Date.now() - 6400,
            startedAt: Date.now() - 6300,
            completedAt: Date.now() - 5400,
            description: null,
            result: 'Error: Task stop-string-1 is not running (status: completed)',
            children: []
        },
        taskStopObjectMismatch: {
            name: 'TaskStop',
            state: 'completed' as const,
            input: {
                task_id: 'stop-unknown-1',
            },
            createdAt: Date.now() - 6600,
            startedAt: Date.now() - 6500,
            completedAt: Date.now() - 5600,
            description: null,
            result: {
                unexpected: true,
                payload: 'This shape intentionally has no canonical TaskStop fields.',
            },
            children: []
        },
        taskStopNull: {
            name: 'TaskStop',
            state: 'completed' as const,
            input: {
                task_id: 'stop-null-1',
            },
            createdAt: Date.now() - 6800,
            startedAt: Date.now() - 6700,
            completedAt: Date.now() - 5800,
            description: null,
            result: null,
            children: []
        },
        codexPatchUpdate: {
            name: 'CodexPatch',
            state: 'completed' as const,
            input: {
                changes: {
                    '/Users/steve/project/src/components/Header.tsx': {
                        type: 'update',
                        unified_diff: `--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -1,5 +1,6 @@
 export function Header() {
+  const title = 'Dashboard';
   return (
     <header>
-      <h1>Home</h1>
+      <h1>{title}</h1>
     </header>
   );`,
                        move_path: null,
                    },
                },
            },
            createdAt: Date.now() - 7000,
            startedAt: Date.now() - 6900,
            completedAt: Date.now() - 6000,
            description: 'Apply update patch',
            result: 'Patch applied',
            children: []
        },
        codexPatchUpdateMove: {
            name: 'CodexPatch',
            state: 'completed' as const,
            input: {
                changes: {
                    '/Users/steve/project/src/components/Header.tsx': {
                        type: 'update',
                        unified_diff: `--- a/src/components/Header.tsx
+++ b/src/components/AppHeader.tsx
@@ -1,4 +1,4 @@
-export function Header() {
+export function AppHeader() {
   return <header>Home</header>;
 }`,
                        move_path: '/Users/steve/project/src/components/AppHeader.tsx',
                    },
                },
            },
            createdAt: Date.now() - 7200,
            startedAt: Date.now() - 7100,
            completedAt: Date.now() - 6200,
            description: 'Apply move patch',
            result: 'Patch applied',
            children: []
        },
        codexPatchAdd: {
            name: 'CodexPatch',
            state: 'completed' as const,
            input: {
                changes: {
                    '/Users/steve/project/src/components/Footer.tsx': {
                        type: 'add',
                        content: `export function Footer() {
  return <footer>Ready</footer>;
}`,
                    },
                },
            },
            createdAt: Date.now() - 7400,
            startedAt: Date.now() - 7300,
            completedAt: Date.now() - 6400,
            description: 'Apply add patch',
            result: 'Patch applied',
            children: []
        },
        codexPatchDelete: {
            name: 'CodexPatch',
            state: 'completed' as const,
            input: {
                changes: {
                    '/Users/steve/project/src/legacy/OldHeader.tsx': {
                        type: 'delete',
                        content: `export function OldHeader() {
  return <header>Legacy</header>;
}`,
                    },
                },
            },
            createdAt: Date.now() - 7600,
            startedAt: Date.now() - 7500,
            completedAt: Date.now() - 6600,
            description: 'Apply delete patch',
            result: 'Patch applied',
            children: []
        },
        codexPatchLegacyWrapper: {
            name: 'CodexPatch',
            state: 'completed' as const,
            input: {
                changes: {
                    '/Users/steve/project/src/utils/format.ts': {
                        kind: {
                            type: 'update',
                            move_path: null,
                        },
                        modify: {
                            old_content: 'export const format = value => value;',
                            new_content: 'export const format = (value: string) => value.trim();',
                        },
                    },
                },
            },
            createdAt: Date.now() - 7800,
            startedAt: Date.now() - 7700,
            completedAt: Date.now() - 6800,
            description: 'Apply legacy wrapper patch',
            result: 'Patch applied',
            children: []
        },
        bash: {
            name: 'Bash',
            state: 'completed' as const,
            input: {
                command: 'npm install react-native-reanimated',
                description: 'Install animation library',
                timeout: 60000
            },
            createdAt: Date.now() - 5000,
            startedAt: Date.now() - 4900,
            completedAt: Date.now() - 4000,
            description: 'Install animation library',
            result: `added 15 packages, and audited 1250 packages in 12s

125 packages are looking for funding
  run \`npm fund\` for details

found 0 vulnerabilities`,
            children: []
        },
        bashRunning: {
            name: 'Bash',
            state: 'running' as const,
            input: {
                command: 'npm run build',
                description: 'Building the application'
            },
            createdAt: Date.now() - 1000,
            startedAt: Date.now() - 900,
            completedAt: null,
            description: 'Building the application',
            children: []
        },
        bashError: {
            name: 'Bash',
            state: 'error' as const,
            input: {
                command: 'npm run nonexistent-script',
                description: 'Run a script that doesn\'t exist'
            },
            createdAt: Date.now() - 6000,
            startedAt: Date.now() - 5900,
            completedAt: Date.now() - 5000,
            description: 'Run a script that doesn\'t exist',
            result: `npm ERR! Missing script: "nonexistent-script"
npm ERR! 
npm ERR! Did you mean one of these?
npm ERR!     npm run test
npm ERR!     npm run build
npm ERR!     npm run start`,
            children: []
        },
        bashLongCommand: {
            name: 'Bash',
            state: 'completed' as const,
            input: {
                command: 'git log --pretty=format:"%h - %an, %ar : %s" --graph --since=2.weeks --author="John Doe" --grep="fix" --all',
                description: 'Search git history for fixes'
            },
            createdAt: Date.now() - 7000,
            startedAt: Date.now() - 6900,
            completedAt: Date.now() - 6000,
            description: 'Search git history for fixes',
            result: `* 3a4f5b6 - John Doe, 2 days ago : fix: resolve memory leak in worker threads
* 1c2d3e4 - John Doe, 5 days ago : fix: correct typo in documentation
* 9f8e7d6 - John Doe, 1 week ago : fix: handle edge case in data parser
* 5b4c3d2 - John Doe, 10 days ago : fix: update dependencies to patch vulnerabilities`,
            children: []
        },
        bashMultiline: {
            name: 'Bash',
            state: 'completed' as const,
            input: {
                command: 'echo "Starting deployment..." && npm run build && npm run test && echo "Deployment complete!"',
                description: 'Multi-step deployment process'
            },
            createdAt: Date.now() - 8000,
            startedAt: Date.now() - 7900,
            completedAt: Date.now() - 7000,
            description: 'Multi-step deployment process',
            result: `Starting deployment...

> myapp@1.0.0 build
> webpack --mode production

asset main.js 245 KiB [emitted] [minimized] (name: main)
asset index.html 1.2 KiB [emitted]
webpack compiled successfully in 3241 ms

> myapp@1.0.0 test
> jest

PASS  src/App.test.js
PASS  src/utils.test.js
PASS  src/components/Header.test.js

Test Suites: 3 passed, 3 total
Tests:       15 passed, 15 total
Time:        4.123s

Deployment complete!`,
            children: []
        },
        bashLargeOutput: {
            name: 'Bash',
            state: 'completed' as const,
            input: {
                command: 'ls -la node_modules/.bin',
                description: 'List all executable scripts'
            },
            createdAt: Date.now() - 9000,
            startedAt: Date.now() - 8900,
            completedAt: Date.now() - 8000,
            description: 'List all executable scripts',
            result: `total 1864
drwxr-xr-x  234 user  staff   7488 Dec 15 14:32 .
drwxr-xr-x  782 user  staff  25024 Dec 15 14:32 ..
lrwxr-xr-x    1 user  staff     18 Dec 15 14:30 acorn -> ../acorn/bin/acorn
lrwxr-xr-x    1 user  staff     29 Dec 15 14:30 autoprefixer -> ../autoprefixer/bin/autoprefixer
lrwxr-xr-x    1 user  staff     25 Dec 15 14:30 browserslist -> ../browserslist/cli.js
lrwxr-xr-x    1 user  staff     26 Dec 15 14:30 css-blank-pseudo -> ../css-blank-pseudo/cli.js
lrwxr-xr-x    1 user  staff     26 Dec 15 14:30 css-has-pseudo -> ../css-has-pseudo/cli.js
lrwxr-xr-x    1 user  staff     29 Dec 15 14:30 css-prefers-color-scheme -> ../css-prefers-color-scheme/cli.js
lrwxr-xr-x    1 user  staff     17 Dec 15 14:30 cssesc -> ../cssesc/bin/cssesc
lrwxr-xr-x    1 user  staff     20 Dec 15 14:30 detective -> ../detective/bin/detective.js
lrwxr-xr-x    1 user  staff     16 Dec 15 14:30 esparse -> ../esprima/bin/esparse.js
lrwxr-xr-x    1 user  staff     18 Dec 15 14:30 esvalidate -> ../esprima/bin/esvalidate.js
lrwxr-xr-x    1 user  staff     20 Dec 15 14:30 he -> ../he/bin/he
lrwxr-xr-x    1 user  staff     23 Dec 15 14:30 html-minifier-terser -> ../html-minifier-terser/cli.js
lrwxr-xr-x    1 user  staff     19 Dec 15 14:30 import-local-fixture -> ../import-local/fixtures/cli.js
lrwxr-xr-x    1 user  staff     13 Dec 15 14:30 jest -> ../jest/bin/jest.js`,
            children: []
        },
        bashNoOutput: {
            name: 'Bash',
            state: 'completed' as const,
            input: {
                command: 'mkdir -p temp/test/dir',
                description: 'Create nested directories'
            },
            createdAt: Date.now() - 10000,
            startedAt: Date.now() - 9900,
            completedAt: Date.now() - 9000,
            description: 'Create nested directories',
            result: '',
            children: []
        },
        bashWithWarnings: {
            name: 'Bash',
            state: 'completed' as const,
            input: {
                command: 'npm audit',
                description: 'Check for security vulnerabilities',
                timeout: 30000
            },
            createdAt: Date.now() - 11000,
            startedAt: Date.now() - 10900,
            completedAt: Date.now() - 10000,
            description: 'Check for security vulnerabilities',
            result: `found 3 vulnerabilities (1 low, 2 moderate)

To address all issues, run:
  npm audit fix

To address issues that do not require attention, run:
  npm audit fix --force`,
            children: []
        },
        search: {
            name: 'Search',
            state: 'completed' as const,
            input: {
                query: 'useState',
                path: './src',
                include: '*.tsx'
            },
            createdAt: Date.now() - 12000,
            startedAt: Date.now() - 11900,
            completedAt: Date.now() - 11000,
            description: null,
            result: JSON.stringify({
                results: [
                    { file: 'App.tsx', line: 5, match: 'const [count, setCount] = useState(0);' },
                    { file: 'components/Counter.tsx', line: 3, match: 'const [value, setValue] = useState(props.initial);' }
                ],
                totalMatches: 2
            }, null, 2),
            children: []
        },
        write: {
            name: 'Write',
            state: 'completed' as const,
            input: {
                file_path: '/Users/steve/project/src/utils/helpers.ts',
                content: `export function formatDate(date: Date): string {
    return date.toLocaleDateString();
}

export function formatTime(date: Date): string {
    return date.toLocaleTimeString();
}`
            },
            createdAt: Date.now() - 13000,
            startedAt: Date.now() - 12900,
            completedAt: Date.now() - 12000,
            description: null,
            result: 'File created successfully',
            children: []
        },
        // Permission states examples
        toolPending: {
            name: 'Bash',
            state: 'running' as const,
            input: {
                command: 'rm -rf /important/directory',
                description: 'Delete important directory'
            },
            createdAt: Date.now(),
            startedAt: Date.now(),
            completedAt: null,
            description: 'Delete important directory',
            permission: {
                id: 'perm-1',
                status: 'pending' as const,
                reason: 'This action requires permission'
            }
        },
        toolApproved: {
            name: 'Bash',
            state: 'completed' as const,
            input: {
                command: 'npm install',
                description: 'Install dependencies'
            },
            createdAt: Date.now() - 5000,
            startedAt: Date.now() - 4000,
            completedAt: Date.now() - 1000,
            description: 'Install dependencies',
            result: 'Successfully installed 250 packages',
            permission: {
                id: 'perm-2',
                status: 'approved' as const
            }
        },
        toolDenied: {
            name: 'Write',
            state: 'error' as const,
            input: {
                file_path: '/etc/passwd',
                content: 'malicious content'
            },
            createdAt: Date.now() - 10000,
            startedAt: Date.now() - 9000,
            completedAt: Date.now() - 8000,
            description: 'Write to system file',
            result: 'Permission denied by user',
            permission: {
                id: 'perm-3',
                status: 'denied' as const,
                reason: 'User denied access to system files'
            }
        },
        toolCanceled: {
            name: 'Bash',
            state: 'error' as const,
            input: {
                command: 'curl https://suspicious-site.com/download',
                description: 'Download from suspicious site'
            },
            createdAt: Date.now() - 15000,
            startedAt: null,
            completedAt: Date.now() - 14000,
            description: 'Download from suspicious site',
            result: 'Operation canceled',
            permission: {
                id: 'perm-4',
                status: 'canceled' as const,
                reason: 'Operation was canceled by the system'
            }
        }
    };

    const renderExample = (key: string, example: any, metadata: Metadata | null = null, group?: string) => {
        if (selectedExample !== 'all' && selectedExample !== key && selectedExample !== group) {
            return null;
        }

        return (
            <View key={key} style={styles.exampleContainer}>
                <Text style={styles.exampleTitle}>{key}</Text>
                <ToolView 
                    tool={example} 
                    metadata={metadata}
                    onPress={() => console.log(`Pressed tool: ${key}`)}
                />
            </View>
        );
    };

    return (
        <>
            <Stack.Screen
                options={{
                    headerTitle: 'Tool Views Demo',
                }}
            />
            
            <ScrollView style={styles.container}>
                <View style={styles.content}>
                    <Text style={styles.pageTitle}>Tool View Components</Text>
                    <Text style={styles.description}>
                        Examples of different tool calls and their visual representations
                    </Text>

                    <ItemGroup title="Filter Examples">
                        <Item
                            title="All Examples"
                            selected={selectedExample === 'all'}
                            onPress={() => setSelectedExample('all')}
                        />
                        <Item
                            title="Read Tool"
                            selected={selectedExample === 'read'}
                            onPress={() => setSelectedExample('read')}
                        />
                        <Item
                            title="Edit Tool"
                            selected={selectedExample === 'edit'}
                            onPress={() => setSelectedExample('edit')}
                        />
                        <Item
                            title="Bash Tool"
                            selected={selectedExample === 'bash'}
                            onPress={() => setSelectedExample('bash')}
                        />
                        <Item
                            title="Other Tools"
                            selected={selectedExample === 'other'}
                            onPress={() => setSelectedExample('other')}
                        />
                        <Item
                            title="Permission States"
                            selected={selectedExample === 'permissions'}
                            onPress={() => setSelectedExample('permissions')}
                        />
                        <Item
                            title="Status Icons"
                            selected={selectedExample === 'status'}
                            onPress={() => setSelectedExample('status')}
                        />
                        <Item
                            title="P1 Bug Fixes"
                            selected={selectedExample === 'p1BugFixes'}
                            onPress={() => setSelectedExample('p1BugFixes')}
                        />
                    </ItemGroup>

                    <View style={styles.examplesSection}>
                        <Text style={styles.sectionTitle}>Examples</Text>
                        
                        {selectedExample === 'all' || selectedExample === 'read' ? (
                            <>
                                {renderExample('read', examples.read)}
                                {renderExample('readError', examples.readError)}
                            </>
                        ) : null}

                        {selectedExample === 'all' || selectedExample === 'edit' ? (
                            renderExample('edit', examples.edit)
                        ) : null}

                        {selectedExample === 'all' || selectedExample === 'p1BugFixes' ? (
                            <ItemGroup title="P1 Bug Fixes" containerStyle={styles.fixtureGroupContainer}>
                                <>
                                    {renderExample('taskOutputRunning', examples.taskOutputRunning, null, 'p1BugFixes')}
                                    {renderExample('taskOutputSchemaMatch', examples.taskOutputSchemaMatch, null, 'p1BugFixes')}
                                    {renderExample('taskOutputString', examples.taskOutputString, null, 'p1BugFixes')}
                                    {renderExample('taskOutputObjectMismatch', examples.taskOutputObjectMismatch, null, 'p1BugFixes')}
                                    {renderExample('taskOutputNull', examples.taskOutputNull, null, 'p1BugFixes')}
                                    {renderExample('taskStopRunning', examples.taskStopRunning, null, 'p1BugFixes')}
                                    {renderExample('taskStopSchemaMatch', examples.taskStopSchemaMatch, null, 'p1BugFixes')}
                                    {renderExample('taskStopString', examples.taskStopString, null, 'p1BugFixes')}
                                    {renderExample('taskStopObjectMismatch', examples.taskStopObjectMismatch, null, 'p1BugFixes')}
                                    {renderExample('taskStopNull', examples.taskStopNull, null, 'p1BugFixes')}
                                    {renderExample('editFix', examples.editFix, pathFixtureMetadata, 'p1BugFixes')}
                                    {renderExample('multiEditFix', examples.multiEditFix, pathFixtureMetadata, 'p1BugFixes')}
                                    {renderExample('codexPatchUpdate', examples.codexPatchUpdate, pathFixtureMetadata, 'p1BugFixes')}
                                    {renderExample('codexPatchUpdateMove', examples.codexPatchUpdateMove, pathFixtureMetadata, 'p1BugFixes')}
                                    {renderExample('codexPatchAdd', examples.codexPatchAdd, pathFixtureMetadata, 'p1BugFixes')}
                                    {renderExample('codexPatchDelete', examples.codexPatchDelete, pathFixtureMetadata, 'p1BugFixes')}
                                    {renderExample('codexPatchLegacyWrapper', examples.codexPatchLegacyWrapper, pathFixtureMetadata, 'p1BugFixes')}
                                </>
                            </ItemGroup>
                        ) : null}

                        {selectedExample === 'all' || selectedExample === 'bash' ? (
                            <>
                                {renderExample('bash', examples.bash)}
                                {renderExample('bashRunning', examples.bashRunning)}
                                {renderExample('bashError', examples.bashError)}
                                {renderExample('bashLongCommand', examples.bashLongCommand)}
                                {renderExample('bashMultiline', examples.bashMultiline)}
                                {renderExample('bashLargeOutput', examples.bashLargeOutput)}
                                {renderExample('bashNoOutput', examples.bashNoOutput)}
                                {renderExample('bashWithWarnings', examples.bashWithWarnings)}
                            </>
                        ) : null}

                        {selectedExample === 'all' || selectedExample === 'other' ? (
                            <>
                                {renderExample('search', examples.search)}
                                {renderExample('write', examples.write)}
                            </>
                        ) : null}

                        {selectedExample === 'all' || selectedExample === 'permissions' ? (
                            <>
                                <Text style={styles.subsectionTitle}>Permission States</Text>
                                {renderExample('toolPending', examples.toolPending)}
                                {renderExample('toolApproved', examples.toolApproved)}
                                {renderExample('toolDenied', examples.toolDenied)}
                                {renderExample('toolCanceled', examples.toolCanceled)}
                            </>
                        ) : null}

                        {selectedExample === 'status' ? (
                            <>
                                <Text style={styles.subsectionTitle}>Status Icons Overview</Text>
                                <View style={styles.statusSection}>
                                    <Text style={styles.statusDescription}>
                                        The following status icons are used in tool views:
                                    </Text>
                                    {renderExample('bashRunning', { ...examples.bashRunning, name: 'Running State' })}
                                    {renderExample('bash', { ...examples.bash, name: 'Completed State' })}
                                    {renderExample('bashError', { ...examples.bashError, name: 'Error State (Warning Icon)' })}
                                    {renderExample('toolDenied', { ...examples.toolDenied, name: 'Denied State (Neutral Icon)' })}
                                    {renderExample('toolCanceled', { ...examples.toolCanceled, name: 'Canceled State (Neutral Icon)' })}
                                </View>
                            </>
                        ) : null}
                    </View>
                </View>
            </ScrollView>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F2F2F7',
    },
    content: {
        flex: 1,
    },
    pageTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 8,
        paddingHorizontal: 16,
    },
    description: {
        fontSize: 16,
        color: '#666',
        marginBottom: 20,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600',
        marginTop: 24,
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    examplesSection: {
        paddingBottom: 40,
    },
    exampleContainer: {
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    fixtureGroupContainer: {
        backgroundColor: 'transparent',
        marginHorizontal: 0,
        borderRadius: 0,
        shadowOpacity: 0,
        elevation: 0,
        overflow: 'visible',
    },
    exampleTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    subsectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 20,
        marginBottom: 12,
        paddingHorizontal: 16,
        color: '#333',
    },
    statusSection: {
        paddingHorizontal: 16,
    },
    statusDescription: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
        lineHeight: 20,
    },
});
