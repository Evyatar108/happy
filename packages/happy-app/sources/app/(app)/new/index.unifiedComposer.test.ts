import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

describe('/new unified composer wiring', () => {
    it('keeps the legacy route body behind the unifiedNewSessionComposer flag', () => {
        expect(source).toContain("useLocalSetting('unifiedNewSessionComposer')");
        expect(source).toContain('!unifiedNewSessionComposer &&');
        expect(source).toContain('<NewSessionContextRow controller={contextRow} />');
        expect(source).toContain('unifiedNewSessionComposer ?');
    });

    it('renders AgentInput in new mode with new-session slots and attachment hook point', () => {
        expect(source).toContain('<AgentInput');
        expect(source).toContain('mode="new"');
        expect(source).toContain('newSessionSlots={contextRow.slots}');
        expect(source).toContain("onAttachmentPress={selectedAgent === 'claude' ? handleAttachmentPress : undefined}");
        expect(source).toContain("attachmentsPreview={selectedAgent === 'claude' ? attachmentsPreview : null}");
        expect(source).toContain('isSendDisabled={!canSend}');
    });

    it('preserves spawn, config, attachment-aware send, then navigation order', () => {
        const spawnIndex = source.indexOf('machineSpawnNewSession({');
        const permissionIndex = source.indexOf('updateSessionPermissionMode(result.sessionId, currentPermission.key, true)');
        const modelIndex = source.indexOf('updateSessionModelMode(result.sessionId, currentModelKey)');
        const sendIndex = source.indexOf("sync.sendMessage(result.sessionId, trimmedPrompt, { source: 'new_session', attachments })");
        const backIndex = source.indexOf('router.back()');
        const navigateIndex = source.indexOf('navigateToSession(result.sessionId)');

        expect(spawnIndex).toBeGreaterThan(-1);
        expect(permissionIndex).toBeGreaterThan(spawnIndex);
        expect(modelIndex).toBeGreaterThan(permissionIndex);
        expect(sendIndex).toBeGreaterThan(modelIndex);
        expect(backIndex).toBeGreaterThan(sendIndex);
        expect(navigateIndex).toBeGreaterThan(backIndex);
    });

    it('remains the default export for the /new route', () => {
        expect(source).toContain('export default React.memo(NewSessionScreen);');
    });

    it('uses the non-persisted attachment staging store and clears it after route/send transitions', () => {
        expect(source).toContain("from '@/hooks/useNewSessionAttachments'");
        expect(source).toContain('useNewSessionAttachments((state) => state.attachments)');
        expect(source).toContain('clearStagedAttachments();');
        expect(source).not.toContain('useNewSessionDraft((state) => state.attachments)');
    });
});
