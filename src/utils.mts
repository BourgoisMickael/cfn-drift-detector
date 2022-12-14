export function strToRegExp(str?: string): RegExp | undefined {
    if (str) {
        try {
            return new RegExp(str);
        } catch (err) {
            console.error('RegExp error', err);
            return undefined;
        }
    }

    return undefined;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
