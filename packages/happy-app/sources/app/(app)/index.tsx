import { RoundButton } from "@/components/RoundButton";
import { useAuth } from "@/auth/AuthContext";
import { Text, View, Image, Platform, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as React from 'react';
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsLandscape } from "@/utils/responsive";
import { Typography } from "@/constants/Typography";
import { trackAccountCreated } from '@/track';
import { HomeHeaderNotAuth } from "@/components/HomeHeader";
import { MainView } from "@/components/MainView";
import { t } from '@/text';
import {
    credentialsFromPairMachine,
    acquireConnectTokenForPair,
    completePair,
    fetchGitHubUserProfile,
    loginInteractive,
    setAuthBrowserOpener,
    type AuthBrowserInfo,
    type PairMachine,
} from '@/auth/pairing';
import { deriveConnectTokenExpiry } from '@/auth/connectTokenRefresh';
import { Modal } from '@/modal';
import { TokenStorage } from '@/auth/tokenStorage';
import { DevTunnelsClientProvider, type ClientTunnelProvider, type MachineTunnel } from '@/sync/tunnelProvider';

export default function Home() {
    const auth = useAuth();
    if (!auth.isAuthenticated) {
        return <NotAuthenticated />;
    }
    return (
        <Authenticated />
    )
}

function Authenticated() {
    return <MainView variant="phone" />;
}

type PendingPairing = {
    machines: MachineTunnel[];
    githubLogin: string;
    avatarUrl: string;
};

type NotAuthenticatedProps = {
    tunnelProvider?: ClientTunnelProvider;
};

type MachinePickerProps = {
    pendingPairing: PendingPairing;
    connecting: boolean;
    onSelectMachine(machine: MachineTunnel): void;
    onCancel(): void;
};

function machineDisplayName(machine: MachineTunnel): string {
    const displayTag = machine.tags.find(tag => tag.startsWith('displayName:'));
    return displayTag?.slice('displayName:'.length) || machine.machineId;
}

function isMachineOnline(machine: MachineTunnel): boolean {
    return machine.lastSeenAt !== null && machine.lastSeenAt !== undefined;
}

export function NotAuthenticated({ tunnelProvider }: NotAuthenticatedProps = {}) {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const isLandscape = useIsLandscape();
    const insets = useSafeAreaInsets();
    const [pendingPairing, setPendingPairing] = React.useState<PendingPairing | null>(null);
    const [connecting, setConnecting] = React.useState(false);
    const [deviceFlowInfo, setDeviceFlowInfo] = React.useState<AuthBrowserInfo | null>(null);
    const provider = React.useMemo(() => tunnelProvider ?? new DevTunnelsClientProvider({
        credentials: TokenStorage,
        loginInteractive,
    }), [tunnelProvider]);

    const persistPairedCredentials = async (
        sourceMachine: MachineTunnel,
        machine: PairMachine,
        metadata: { login: string; avatarUrl: string; connectToken: string; connectTokenExpiry: number },
    ) => {
        const credentials = credentialsFromPairMachine(sourceMachine, machine, metadata);
        await auth.login(credentials);
        trackAccountCreated();
    };

    const pairMachine = async () => {
        try {
            if (!(await provider.isLoggedIn())) {
                const useDeviceCode = await Modal.confirm(
                    'How do you want to sign in?',
                    'Log in with GitHub in a browser on this device, or get a device code to enter on a browser elsewhere?',
                    { cancelText: 'Log in with browser', confirmText: 'Use device code' },
                );
                if (useDeviceCode) {
                    // Render the code as an inline banner so we can dismiss it
                    // programmatically when polling succeeds. Modal.alert on Android
                    // is a native dialog with no programmatic dismiss.
                    setAuthBrowserOpener(async (info: AuthBrowserInfo) => {
                        setDeviceFlowInfo(info);
                    });
                } else {
                    setAuthBrowserOpener(null);
                }
                try {
                    await provider.loginInteractive();
                } finally {
                    setAuthBrowserOpener(null);
                    setDeviceFlowInfo(null);
                }
            }
            const githubToken = await TokenStorage.getDevTunnelsToken();
            const githubProfile = githubToken ? await fetchGitHubUserProfile(githubToken) : { login: '', avatarUrl: '' };
            const discovered = await provider.listMachineTunnels();
            if (discovered.length === 0) throw new Error(t('welcome.noMachinesForIdentity'));

            if (discovered.length > 1) {
                setPendingPairing({
                    machines: discovered,
                    githubLogin: githubProfile.login,
                    avatarUrl: githubProfile.avatarUrl,
                });
                return;
            }

            await connectAndPair(discovered[0]!, githubProfile.login, githubProfile.avatarUrl);
        } catch (error) {
            console.error('Error pairing machine', error);
            Modal.alert(t('common.error'), error instanceof Error ? error.message : t('welcome.pairingFailed'));
        }
    };

    const connectAndPair = async (
        machine: MachineTunnel,
        login: string,
        avatarUrl: string,
    ) => {
        const { connectToken } = await acquireConnectTokenForPair(machine);
        const { machine: pairedMachine } = await completePair(machine, connectToken);
        const connectTokenExpiry = deriveConnectTokenExpiry();
        await persistPairedCredentials(machine, pairedMachine, {
            login,
            avatarUrl,
            connectToken,
            connectTokenExpiry,
        });
    };

    const handleSelectDiscovered = async (machine: MachineTunnel) => {
        if (!pendingPairing || connecting) return;
        setConnecting(true);
        try {
            await connectAndPair(
                machine,
                pendingPairing.githubLogin,
                pendingPairing.avatarUrl,
            );
            setPendingPairing(null);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : t('welcome.pairingFailed'));
        } finally {
            setConnecting(false);
        }
    };

    if (pendingPairing) {
        return (
            <MachinePicker
                pendingPairing={pendingPairing}
                connecting={connecting}
                onSelectMachine={handleSelectDiscovered}
                onCancel={() => setPendingPairing(null)}
            />
        );
    }

    const portraitLayout = (
        <View style={styles.portraitContainer}>
            <Image
                source={theme.dark ? require('@/assets/images/logotype-light.png') : require('@/assets/images/logotype-dark.png')}
                resizeMode="contain"
                style={styles.logo}
            />
            <Text style={styles.title}>
                {t('welcome.title')}
            </Text>
            <Text style={styles.subtitle}>
                {t('welcome.subtitle')}
            </Text>
            <View style={styles.buttonContainer}>
                <RoundButton
                    title={t('welcome.pairMachine')}
                    action={pairMachine}
                />
            </View>
        </View>
    );

    const landscapeLayout = (
        <View style={[styles.landscapeContainer, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.landscapeInner}>
                <View style={styles.landscapeLogoSection}>
                    <Image
                        source={theme.dark ? require('@/assets/images/logotype-light.png') : require('@/assets/images/logotype-dark.png')}
                        resizeMode="contain"
                        style={styles.logo}
                    />
                </View>
                <View style={styles.landscapeContentSection}>
                    <Text style={styles.landscapeTitle}>
                        {t('welcome.title')}
                    </Text>
                    <Text style={styles.landscapeSubtitle}>
                        {t('welcome.subtitle')}
                    </Text>
                    <View style={styles.landscapeButtonContainer}>
                        <RoundButton
                            title={t('welcome.pairMachine')}
                            action={pairMachine}
                        />
                    </View>
                </View>
            </View>
        </View>
    );

    return (
        <>
            <HomeHeaderNotAuth />
            {isLandscape ? landscapeLayout : portraitLayout}
            {deviceFlowInfo ? (
                <View style={styles.deviceCodeBanner}>
                    <Text style={styles.deviceCodeTitle}>Enter this code on another browser</Text>
                    <Text style={styles.deviceCodeUrl}>{deviceFlowInfo.verification_uri}</Text>
                    <Text style={styles.deviceCode}>{deviceFlowInfo.user_code}</Text>
                    <Text style={styles.deviceCodeHint}>Auto-dismisses when authorized.</Text>
                </View>
            ) : null}
        </>
    )
}

export function MachinePicker({ pendingPairing, connecting, onSelectMachine, onCancel }: MachinePickerProps) {
    return (
        <>
            <HomeHeaderNotAuth />
            <View style={styles.pickerContainer}>
                <Text style={styles.pickerTitle}>{t('welcome.selectMachine')}</Text>
                <Text style={styles.pickerSubtitle}>
                    {t('welcome.selectMachineSubtitle', { login: pendingPairing.githubLogin })}
                </Text>
                <View style={styles.machineListContainer}>
                    {pendingPairing.machines.map(machine => (
                        <View key={machine.tunnelId} style={styles.machineItem}>
                            <View style={styles.machineInfo}>
                                <Text style={styles.machineName}>{machineDisplayName(machine)}</Text>
                                <Text style={styles.machineTag}>{String(machine.lastSeenAt)}</Text>
                                <Text style={[styles.machineStatus, isMachineOnline(machine) ? styles.online : styles.offline]}>
                                    {isMachineOnline(machine) ? t('welcome.online') : t('welcome.offline')}
                                </Text>
                            </View>
                            <View style={styles.machineButton}>
                                <RoundButton
                                    title={connecting ? '...' : t('welcome.connectTo')}
                                    size="normal"
                                    action={async () => onSelectMachine(machine)}
                                    disabled={connecting}
                                />
                            </View>
                        </View>
                    ))}
                </View>
                <View style={styles.cancelButton}>
                    <RoundButton
                        title={t('common.cancel')}
                        size="normal"
                        display="inverted"
                        onPress={async () => onCancel()}
                    />
                </View>
            </View>
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    // Device-flow code banner (shown when "Use device code" is chosen)
    deviceCodeBanner: {
        position: 'absolute',
        bottom: 24,
        left: 16,
        right: 16,
        padding: 20,
        borderRadius: 12,
        backgroundColor: theme.colors.userMessageBackground,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        alignItems: 'center',
        gap: 8,
    },
    deviceCodeTitle: {
        ...Typography.default('semiBold'),
        fontSize: 16,
        color: theme.colors.text,
    },
    deviceCodeUrl: {
        ...Typography.mono(),
        fontSize: 14,
        color: theme.colors.text,
    },
    deviceCode: {
        ...Typography.mono('semiBold'),
        fontSize: 28,
        letterSpacing: 2,
        color: theme.colors.text,
    },
    deviceCodeHint: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    // Machine picker styles
    pickerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    pickerTitle: {
        ...Typography.default('semiBold'),
        fontSize: 22,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: 8,
    },
    pickerSubtitle: {
        ...Typography.default(),
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
    },
    machineListContainer: {
        width: '100%',
        maxWidth: 360,
        gap: 12,
        marginBottom: 24,
    },
    machineItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    machineInfo: {
        flex: 1,
        gap: 2,
    },
    machineName: {
        ...Typography.mono(),
        fontSize: 13,
        color: theme.colors.text,
    },
    machineTag: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    machineStatus: {
        ...Typography.default(),
        fontSize: 12,
    },
    online: {
        color: theme.colors.status.connected,
    },
    offline: {
        color: theme.colors.textSecondary,
    },
    machineButton: {
        minWidth: 90,
    },
    cancelButton: {
        width: '100%',
        maxWidth: 360,
    },

    // NotAuthenticated styles
    portraitContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 300,
        height: 90,
    },
    title: {
        marginTop: 16,
        textAlign: 'center',
        fontSize: 24,
        ...Typography.default('semiBold'),
        color: theme.colors.text,
    },
    subtitle: {
        ...Typography.default(),
        fontSize: 18,
        color: theme.colors.textSecondary,
        marginTop: 16,
        textAlign: 'center',
        marginHorizontal: 24,
        marginBottom: 64,
    },
    buttonContainer: {
        maxWidth: 280,
        width: '100%',
        marginBottom: 16,
    },
    // Landscape styles
    landscapeContainer: {
        flexBasis: 0,
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 48,
    },
    landscapeInner: {
        flexGrow: 1,
        flexBasis: 0,
        maxWidth: 800,
        flexDirection: 'row',
    },
    landscapeLogoSection: {
        flexBasis: 0,
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingRight: 24,
    },
    landscapeContentSection: {
        flexBasis: 0,
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 24,
    },
    landscapeTitle: {
        textAlign: 'center',
        fontSize: 24,
        ...Typography.default('semiBold'),
        color: theme.colors.text,
    },
    landscapeSubtitle: {
        ...Typography.default(),
        fontSize: 18,
        color: theme.colors.textSecondary,
        marginTop: 16,
        textAlign: 'center',
        marginBottom: 32,
        paddingHorizontal: 16,
    },
    landscapeButtonContainer: {
        width: 280,
        marginBottom: 16,
    },
}));
