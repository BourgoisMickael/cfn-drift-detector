import type { StackResourceDrift } from '@aws-sdk/client-cloudformation';

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

function countRowsForResource(resourceDrift: StackResourceDrift): number {
    return resourceDrift.PropertyDifferences?.length || 1;
}

function countRowsForStack(stackWithDrifts: StackWithDrifts): number {
    return stackWithDrifts.Drifts.reduce((acc, cur) => acc + countRowsForResource(cur), 0) || 1;
}

export function htmlNotifier(regions: string[], stacksPerRegion: StackWithDrifts[][]): string {
    const res = stacksPerRegion.map((stacks, index) => {
        if (!stacks.length) return '';

        const region = regions[index];

        let html = `<h1>${region || ''}</h1>
        <table border=1 width="100%" style="word-break:break-all;">
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
        </thead>
        <tbody>`;
        for (const stack of stacks) {
            for (const [resourceIndex, resourceDrift] of stack.Drifts.entries()) {
                if (resourceDrift.PropertyDifferences?.length) {
                    for (const [propertyIndex, propertyDrift] of (resourceDrift.PropertyDifferences || []).entries()) {
                        html += '<tr>';

                        if (resourceIndex === 0 && propertyIndex === 0) {
                            html += `<td rowspan=${countRowsForStack(stack)}>${stack.StackName || ''}</td>`;
                        }
                        if (propertyIndex === 0) {
                            html += `<td rowspan=${countRowsForResource(resourceDrift)}>${
                                resourceDrift.LogicalResourceId || '-'
                            }</td>`;
                            html += `<td rowspan=${countRowsForResource(
                                resourceDrift
                            )} style="word-break:normal;color:${
                                COLORS[resourceDrift.StackResourceDriftStatus || ''] || ''
                            };">${resourceDrift.StackResourceDriftStatus || '-'}</td>`;
                        }

                        html += `<td>${propertyDrift.PropertyPath?.substring(1)?.replace(/\//g, '.') || '-'}</td>`;
                        html += `<td style="word-break:normal;color:${
                            COLORS[propertyDrift.DifferenceType || ''] || ''
                        }">${propertyDrift.DifferenceType || '-'}</td>`;
                        html += `<td><div style="max-height:50px;overflow:auto;">${
                            propertyDrift.ExpectedValue || '-'
                        }</div></td>`;
                        html += `<td><div style="max-height:50px;overflow:auto;">${
                            propertyDrift.ActualValue || '-'
                        }</div></td>`;
                        html += '</tr>';
                    }
                } else {
                    html += '<tr>';

                    if (resourceIndex === 0) {
                        html += `<td rowspan=${countRowsForStack(stack)}>${stack.StackName || '-'}</td>`;
                    }

                    html += `<td>${resourceDrift.LogicalResourceId || '-'}</td>`;
                    html += `<td style="word-break:normal;color:${
                        COLORS[resourceDrift.StackResourceDriftStatus || ''] || ''
                    }">${resourceDrift.StackResourceDriftStatus || '-'}</td>`;
                    html += '</tr>';
                }
            }
        }

        html += '</tbody></table>';
        return html;
    });

    return `<html><body>${res.join('')}</body></html>`;
}
