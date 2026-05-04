export type HackableMode = {
    key: string;
    name: string;
    description?: string | null;
};

export function hackMode<T extends HackableMode>(mode: T): T {
    // Production only dedupes "build, build" / "plan/plan" duplicated labels.
    // Plain lowercase pass through unchanged — capitalisation is a UI concern.
    const normalizedName = mode.name.trim().toLowerCase();

    if (normalizedName === 'build, build') {
        return { ...mode, name: 'build' };
    }
    if (normalizedName === 'plan/plan') {
        return { ...mode, name: 'plan' };
    }
    return mode;
}

export function hackModes<T extends HackableMode>(modes: T[]): T[] {
    return modes.map(hackMode);
}
