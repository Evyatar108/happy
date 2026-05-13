import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    login: vi.fn(),
    startPairFlow: vi.fn(),
    waitForPairStatus: vi.fn(),
    acquireConnectTokenForPair: vi.fn(),
    credentialsFromPairMachine: vi.fn(),
    fetchGitHubUserProfile: vi.fn(),
    openGitHubDeviceFlow: vi.fn(),
}));

vi.mock('react-native', () => {
    const React = require('react');
    return {
        Text: (props: any) => React.createElement('Text', props, props.children),
        View: (props: any) => React.createElement('View', props, props.children),
        Image: (props: any) => React.createElement('Image', props),
        Platform: { OS: 'ios' },
        FlatList: (props: any) => React.createElement('FlatList', props),
    };
});

vi.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ bottom: 0 }),
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: { create: (factory: any) => factory({ colors: { text: '#000', textSecondary: '#555', surface: '#fff', status: { connected: '#0a0' } }, dark: false }) },
    useUnistyles: () => ({ theme: { dark: false, colors: { text: '#000', textSecondary: '#555', surface: '#fff', status: { connected: '#0a0' } } } }),
}));

vi.mock('@/utils/responsive', () => ({ useIsLandscape: () => false }));
vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}), mono: () => ({}) } }));
vi.mock('@/components/HomeHeader', () => ({ HomeHeaderNotAuth: () => React.createElement('Header') }));
vi.mock('@/components/MainView', () => ({ MainView: () => React.createElement('MainView') }));
vi.mock('@/components/RoundButton', () => ({ RoundButton: (props: any) => React.createElement('RoundButton', props) }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, login: mocks.login }) }));
vi.mock('@/track', () => ({ trackAccountCreated: vi.fn() }));
vi.mock('@/modal', () => ({ Modal: { alert: vi.fn(), confirm: vi.fn() } }));
vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: {
        getDevTunnelsToken: vi.fn().mockResolvedValue('ghu-token'),
        setDevTunnelsToken: vi.fn(),
    },
}));
vi.mock('@/auth/pairing', () => ({
    loginInteractive: vi.fn(),
    acquireConnectTokenForPair: mocks.acquireConnectTokenForPair,
    startPairFlow: mocks.startPairFlow,
    waitForPairStatus: mocks.waitForPairStatus,
    openGitHubDeviceFlow: mocks.openGitHubDeviceFlow,
    fetchGitHubUserProfile: mocks.fetchGitHubUserProfile,
    credentialsFromPairMachine: mocks.credentialsFromPairMachine,
}));
vi.mock('@/text', () => ({ t: (key: string, params?: Record<string, string>) => params?.login ? `${key}:${params.login}` : key }));

import { MachinePicker } from './index';
import type { MachineTunnel } from '@/sync/tunnelProvider';

const machineA: MachineTunnel = {
    machineId: 'machine-a',
    tunnelId: 'tunnel-a',
    url: 'https://a.example.test',
    tags: ['happy-machine', 'displayName:Alpha'],
    lastSeenAt: '2026-05-11T12:00:00.000Z',
    owner: 'evy',
};

const machineB: MachineTunnel = {
    machineId: 'machine-b',
    tunnelId: 'tunnel-b',
    url: 'https://b.example.test',
    tags: ['happy-machine'],
    lastSeenAt: '2026-05-11T13:00:00.000Z',
    owner: 'evy',
};

describe('NotAuthenticated machine picker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetchGitHubUserProfile.mockResolvedValue({ login: 'octocat', avatarUrl: 'https://avatars.example.test/octocat.png' });
        mocks.startPairFlow.mockResolvedValue({
            device_code: 'abc',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://github.com/login/device',
            interval: 12,
            expires_in: 900,
        });
        mocks.waitForPairStatus.mockResolvedValue({
            status: 'authorized',
            machines: [{ machineId: 'machine-b', tunnelUrl: 'https://b.example.test' }],
        });
        mocks.credentialsFromPairMachine.mockReturnValue({ machineId: 'machine-b', tunnelUrl: 'https://b.example.test', firstSeenAt: 1 });
    });

    it('renders MachineTunnel lastSeenAt and sends the selected machine directly', async () => {
        const onSelectMachine = vi.fn();
        let renderer!: ReturnType<typeof TestRenderer.create>;
        await act(async () => {
            renderer = TestRenderer.create(
                <MachinePicker
                    pendingPairing={{ machines: [machineA, machineB], githubLogin: 'octocat', avatarUrl: 'https://avatars.example.test/octocat.png' }}
                    connecting={false}
                    onSelectMachine={onSelectMachine}
                    onCancel={vi.fn()}
                />
            );
        });

        const text = JSON.stringify(renderer.toJSON());
        expect(text).toContain('Alpha');
        expect(text).toContain('2026-05-11T12:00:00.000Z');
        expect(text).toContain('2026-05-11T13:00:00.000Z');

        const connectButtons = renderer.root.findAllByProps({ title: 'welcome.connectTo' });
        await act(async () => {
            await connectButtons[1]!.props.action();
        });

        expect(onSelectMachine).toHaveBeenCalledWith(machineA);
    });
});
