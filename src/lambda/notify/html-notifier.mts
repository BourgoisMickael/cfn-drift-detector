import type { PropertyDifference, StackResourceDrift } from '@aws-sdk/client-cloudformation';

import type { StackWithDrifts } from './stack-with-drifts.mjs';

const COLORS: Record<string, string> = {
    // Red
    DELETED: '#d13212',
    MODIFIED: '#d13212',
    REMOVE: '#d13212',
    // Blue
    NOT_EQUAL: '#0073bb',
    // Green
    ADD: '#1d8102'
};

const TABLE_HEADER = `
<thead>
<tr>
<th width="15%">Stack</th>
<th width="15%">Logical ID</th>
<th style="word-break:normal;">Drift status</th>
<th width="20%">Property</th>
<th style="word-break:normal;">Change</th>
<th width="20%">Expected value</th>
<th width="20%">Current value</th>
</tr>
</thead>`.replace(/\n/g, '');

function linkDriftPage(region: string, stackId: string): string {
    return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/drifts?stackId=${encodeURIComponent(
        stackId
    )}`;
}

function linkDriftResourcePage(region: string, stackId: string, logicalId: string): string {
    return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/drifts/info?stackId=${encodeURIComponent(
        stackId
    )}&logicalResourceId=${logicalId}`;
}

function countRowsForResource(resourceDrift: StackResourceDrift): number {
    return resourceDrift.PropertyDifferences?.length || 1;
}

function countRowsForStack(stackWithDrifts: StackWithDrifts): number {
    return (
        (stackWithDrifts.Drifts.reduce((acc, cur) => acc + countRowsForResource(cur), 0) || 1) +
        (stackWithDrifts.HasMore ? 1 : 0)
    );
}

function defaultValue(str?: string): string {
    return str === 'null' ? '-' : str || '-';
}

function htmlStack(region: string, stack: StackWithDrifts): string {
    return `<td rowspan=${countRowsForStack(stack)}><a href="${linkDriftPage(
        region,
        stack.StackId || ''
    )}">${defaultValue(stack.StackName)}</a></td>`;
}

function htmlLogicalId(region: string, resourceDrift: StackResourceDrift): string {
    return `<td rowspan=${countRowsForResource(resourceDrift)}><a href="${linkDriftResourcePage(
        region,
        resourceDrift.StackId || '',
        resourceDrift.LogicalResourceId || ''
    )}">${defaultValue(resourceDrift.LogicalResourceId)}</a></td>`;
}

function htmlDriftStatus(resourceDrift: StackResourceDrift): string {
    const value = defaultValue(resourceDrift.StackResourceDriftStatus);
    return `<td rowspan=${countRowsForResource(resourceDrift)} style="word-break:normal;color:${
        COLORS[value] || ''
    };">${value}</td>`;
}

function htmlProperty(property: PropertyDifference): string {
    return `<td>${defaultValue(property.PropertyPath?.substring(1)?.replace(/\//g, '.'))}</td>`;
}

function htmlChange(property: PropertyDifference): string {
    const value = defaultValue(property.DifferenceType);
    return `<td style="word-break:normal;color:${COLORS[value] || ''}">${value}</td>`;
}

function htmlExpectedOrCurrentValue(value?: string): string {
    return `<td><div style="max-height:50px;overflow:auto;">${defaultValue(value)}</div></td>`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function htmlHasMore(region: string, stack: StackWithDrifts): string {
    return `<tr><td colspan=6 align=center><a href="${linkDriftPage(
        region,
        stack.StackId || ''
    )}">More...</a></td></tr>`;
}

export function htmlNotifier(regions: string[], stacksPerRegion: StackWithDrifts[][]): string {
    const res = stacksPerRegion.map((stacks, index) => {
        if (!stacks.length) return '';

        const region = regions[index] || '';

        let html = `<h1>${region} (${stacks.length} stacks - ${stacks.reduce(
            (acc, cur) => acc + cur.Drifts.length,
            0
        )}+ resources)</h1><table border=1 width="100%" cellpadding=5 style="word-break:break-all;">${TABLE_HEADER}<tbody>`;
        for (const stack of stacks) {
            for (const [resourceIndex, resourceDrift] of stack.Drifts.entries()) {
                if (resourceDrift.PropertyDifferences?.length) {
                    for (const [propertyIndex, propertyDrift] of (resourceDrift.PropertyDifferences || []).entries()) {
                        html += '<tr>';
                        if (resourceIndex === 0 && propertyIndex === 0) html += htmlStack(region, stack);
                        if (propertyIndex === 0)
                            html += `${htmlLogicalId(region, resourceDrift)}${htmlDriftStatus(resourceDrift)}`;
                        html += htmlProperty(propertyDrift);
                        html += htmlChange(propertyDrift);
                        html += htmlExpectedOrCurrentValue(propertyDrift.ExpectedValue);
                        html += htmlExpectedOrCurrentValue(propertyDrift.ActualValue);

                        html += '</tr>';
                    }
                } else {
                    html += '<tr>';
                    if (resourceIndex === 0) html += htmlStack(region, stack);
                    html += htmlLogicalId(region, resourceDrift);
                    html += htmlDriftStatus(resourceDrift);
                    html += '</tr>';
                }
            }
            if (stack.HasMore) html += htmlHasMore(region, stack);
        }

        html += '</tbody></table>';
        return html;
    });

    return `<html><body>${res.join('')}</body></html>`;
}
