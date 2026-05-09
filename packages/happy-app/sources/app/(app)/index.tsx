import * as WebBrowser from 'expo-web-browser';
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
    createX25519KeyPair, credentialsFromPairMachine, connectMachine,
    startDeviceTunnelFlow, pollDeviceTunnelFlow, listHappyTunnels, fetchTunnelConnectToken,
    type DiscoveredMachine, type PairMachine,
} from '@/auth/pairing';
import { Modal } from '@/modal';
import { TokenStorage } from '@/auth/tokenStorage';

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
    primaryMachine: PairMachine;
    discoveredMachines: DiscoveredMachine[];
    localKeyPair: ReturnType<typeof createX25519KeyPair>;
    githubToken: string;
    githubLogin: string;
};

function NotAuthenticated() {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const isLandscape = useIsLandscape();
    const insets = useSafeAreaInsets();
    const [pendingPairing, setPendingPairing] = React.useState<PendingPairing | null>(null);
    const [connecting, setConnecting] = React.useState(false);

    const completePairing = async (
        machine: PairMachine,
        localKeyPair: ReturnType<typeof createX25519KeyPair>,
        tunnelAuth?: { connectToken: string; connectTokenExpiry: number; githubToken: string; tunnelId: string },
    ) => {
        const trustedMachines = await TokenStorage.getCredentialsList();
        const existingMachine = trustedMachines.find(item => item.machineId === machine.machineId);
        if (existingMachine && existingMachine.pinnedPubkey !== machine.ed25519PublicKey) {
            const acceptedRotation = await Modal.confirm(
                t('welcome.pubkeyRotationTitle'),
                t('welcome.pubkeyRotationWarning'),
                { confirmText: t('welcome.trust'), cancelText: t('common.cancel'), destructive: true }
            );
            if (!acceptedRotation) return;
        }
        const trusted = await Modal.confirm(
            t('welcome.trustMachine'),
            t('welcome.ed25519Fingerprint', { fingerprint: machine.ed25519Fingerprint ?? machine.ed25519PublicKey }),
            { confirmText: t('welcome.trust'), cancelText: t('common.cancel') }
        );
        if (!trusted) return;
        const credentials = {
            ...credentialsFromPairMachine(machine, localKeyPair),
            ...tunnelAuth,
        };
        await auth.login(credentials);
        trackAccountCreated();
    };

    const pairMachine = async () => {
        try {
            // Direct GitHub device flow using devtunnel's GitHub App (no server proxy needed)
            const flow = await startDeviceTunnelFlow();
            await WebBrowser.openBrowserAsync(flow.verification_uri_complete ?? flow.verification_uri);

            const localKeyPair = createX25519KeyPair();
            const deadline = Date.now() + flow.expires_in * 1000;
            let githubToken: string | null = null;
            while (Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, Math.max(flow.interval, 1) * 1000));
                githubToken = await pollDeviceTunnelFlow(flow.device_code);
                if (githubToken) break;
            }
            if (!githubToken) throw new Error(t('welcome.deviceAuthorizationExpired'));

            // Enumerate happy-* tunnels via Dev Tunnels API
            const discovered = await listHappyTunnels(githubToken);
            if (discovered.length === 0) throw new Error(t('welcome.noMachinesForIdentity'));

            if (discovered.length > 1) {
                setPendingPairing({
                    primaryMachine: null as never,  // no primary yet — user must pick
                    discoveredMachines: discovered,
                    localKeyPair,
                    githubToken,
                    githubLogin: '',
                });
                return;
            }

            // Single machine — auto-connect
            await connectAndPair(discovered[0]!, githubToken, localKeyPair);
        } catch (error) {
            console.error('Error pairing machine', error);
            Modal.alert(t('common.error'), error instanceof Error ? error.message : t('welcome.pairingFailed'));
        }
    };

    const connectAndPair = async (
        machine: DiscoveredMachine,
        githubToken: string,
        localKeyPair: ReturnType<typeof createX25519KeyPair>,
    ) => {
        // Get real Dev Tunnels connect JWT — this is the tunnel-level auth credential
        const { connectToken, connectTokenExpiry } = await fetchTunnelConnectToken(machine.tunnelId, githubToken);

        // Pair with the machine via /pair/connect (tunnel auth is the gate, no GitHub token needed)
        const paired = await connectMachine(machine.tunnelUrl, connectToken, localKeyPair);

        await completePairing(paired, localKeyPair, {
            connectToken,
            connectTokenExpiry,
            githubToken,
            tunnelId: machine.tunnelId,
        });
    };

    const handleSelectDiscovered = async (machine: DiscoveredMachine) => {
        if (!pendingPairing || connecting) return;
        setConnecting(true);
        try {
            await connectAndPair(machine, pendingPairing.githubToken, pendingPairing.localKeyPair);
            setPendingPairing(null);
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : t('welcome.pairingFailed'));
        } finally {
            setConnecting(false);
        }
    };

    if (pendingPairing) {
        return (
            <>
                <HomeHeaderNotAuth />
                <View style={styles.pickerContainer}>
                    <Text style={styles.pickerTitle}>{t('welcome.selectMachine')}</Text>
                    <Text style={styles.pickerSubtitle}>
                        {t('welcome.selectMachineSubtitle', { login: pendingPairing.githubLogin })}
                    </Text>
                    <View style={styles.machineListContainer}>
                        {pendingPairing.discoveredMachines.map(machine => (
                            <View key={machine.tunnelId} style={styles.machineItem}>
                                <View style={styles.machineInfo}>
                                    <Text style={styles.machineName}>{machine.displayName}</Text>
                                    <Text style={[styles.machineStatus, machine.isOnline ? styles.online : styles.offline]}>
                                        {machine.isOnline ? t('welcome.online') : t('welcome.offline')}
                                    </Text>
                                </View>
                                <View style={styles.machineButton}>
                                    <RoundButton
                                        title={connecting ? '...' : t('welcome.connectTo')}
                                        size="normal"
                                        action={() => handleSelectDiscovered(machine)}
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
                            onPress={() => setPendingPairing(null)}
                        />
                    </View>
                </View>
            </>
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
        </>
    )
}

const styles = StyleSheet.create((theme) => ({
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
