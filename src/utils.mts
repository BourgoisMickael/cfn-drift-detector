export function strToRegExp(str?: string): RegExp | undefined {
    if (str) {
        try {
            return new RegExp(str)
        } catch (err) {
            console.error('RegExp error', err);
            return undefined
        }
    }

    return undefined;
}