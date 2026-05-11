import * as React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactActEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const shared = vi.hoisted(() => ({
    focusMock: vi.fn(),
    platform: { OS: 'web' },
}));

const theme = {
    colors: {
        input: { background: '#f4f4f4' },
        divider: '#dddddd',
        text: '#111111',
        textSecondary: '#666666',
        button: { primary: { background: '#111111' } },
    },
};

vi.mock('react-native', () => ({
    Platform: shared.platform,
    Pressable: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('ScrollView', props, children),
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('Text', props, children),
    TextInput: React.forwardRef((_props: Record<string, unknown>, ref) => {
        React.useImperativeHandle(ref, () => ({ focus: shared.focusMock }));
        return React.createElement('TextInput', _props);
    }),
    View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('View', props, children),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: (props: Record<string, unknown>) => React.createElement('Ionicon', props),
    Octicons: (props: Record<string, unknown>) => React.createElement('Octicon', props),
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({ theme }),
}));

vi.mock('@/text', () => ({
    t: (key: string) => `translated:${key}`,
}));

vi.mock('./pickerStyles', () => ({
    pickerStyles: {
        container: {},
        divider: {},
        emptyText: {},
        option: {},
        optionList: {},
        optionPressed: {},
        optionText: {},
        searchInput: {},
        searchRow: {},
        title: {},
    },
}));

const { PickerContent } = await import('./PickerContent');

describe('PickerContent', () => {
    beforeEach(() => {
        reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
        shared.focusMock.mockClear();
        shared.platform.OS = 'web';
    });

    it('focuses the search input on web when autoFocusSearch is true', () => {
        act(() => {
            TestRenderer.create(
                <PickerContent
                    title="Machine"
                    items={[{ key: 'one', label: 'One' }]}
                    selectedKey={null}
                    onSelect={() => {}}
                    autoFocusSearch={true}
                />,
            );
        });

        expect(shared.focusMock).toHaveBeenCalledTimes(1);
    });

    it('does not focus native search inputs', () => {
        shared.platform.OS = 'ios';

        act(() => {
            TestRenderer.create(
                <PickerContent
                    title="Machine"
                    items={[{ key: 'one', label: 'One' }]}
                    selectedKey={null}
                    onSelect={() => {}}
                    autoFocusSearch={true}
                />,
            );
        });

        expect(shared.focusMock).not.toHaveBeenCalled();
    });
});
