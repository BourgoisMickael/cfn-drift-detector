/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { StackWithDrifts } from './stack-with-drifts.mjs';

function defaultValue(str?: string): string {
    return str === 'null' ? '-' : str || '-';
}

export function jsonNotifier(regions: string[], stacksPerRegion: StackWithDrifts[][]): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = {} as Record<string, any>;

    for (const [index, stacks] of stacksPerRegion.entries()) {
        if (!stacks.length) continue;
        const region = regions[index] || '';
        json[region] = {};

        for (const stack of stacks) {
            const stackName = stack.StackName || stack.StackId || '';
            json[region][stackName] = {};

            for (const resourceDrift of stack.Drifts) {
                const resourceName = resourceDrift.LogicalResourceId || '';
                json[region][stackName][resourceName] = {
                    status: resourceDrift.StackResourceDriftStatus
                };

                if (resourceDrift.PropertyDifferences?.length) {
                    json[region][stackName][resourceName].properties = {};

                    for (const propertyDrift of resourceDrift.PropertyDifferences) {
                        json[region][stackName][resourceName].properties[
                            (propertyDrift.PropertyPath || '').substring(1)?.replace(/\//g, '.')
                        ] = {
                            change: propertyDrift.DifferenceType,
                            expected: defaultValue(propertyDrift.ExpectedValue),
                            actual: defaultValue(propertyDrift.ActualValue)
                        };
                    }
                }
            }
        }
    }

    return JSON.stringify(json, null, 4);
}
