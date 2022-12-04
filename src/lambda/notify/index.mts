import {
    CloudFormationClient,
    DescribeStackResourceDriftsCommand,
    ListStacksCommand,
    Stack,
    StackSummary
} from '@aws-sdk/client-cloudformation';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import AWSXRAY from 'aws-xray-sdk-core';

import { strToRegExp } from '../../utils.mjs';
import { htmlNotifier } from './html-notifier.mjs';
import type { StackWithDrifts } from './stack-with-drifts.mjs';

interface InputEvent {
    REGIONS?: string;
    IGNORE_STACK_ID_REGEX?: string;
    SES_REGION?: string;
    SES_SOURCE?: string;
    SES_DESTINATION?: string;
}

const ALLOWED_STACK_STATUS = [
    'CREATE_COMPLETE',
    'ROLLBACK_COMPLETE',
    'UPDATE_COMPLETE',
    'UPDATE_FAILED',
    'UPDATE_ROLLBACK_COMPLETE',
    'UPDATE_ROLLBACK_FAILED',
    'IMPORT_COMPLETE',
    'IMPORT_ROLLBACK_FAILED',
    'IMPORT_ROLLBACK_COMPLETE'
];

async function getStacks(cloudformation: CloudFormationClient, ignoreStackRegex?: RegExp): Promise<Stack[]> {
    const stacks: Stack[] = [];
    let nextToken: string | undefined;

    do {
        const output = await cloudformation.send(
            new ListStacksCommand({ StackStatusFilter: ALLOWED_STACK_STATUS, NextToken: nextToken })
        );
        nextToken = output.NextToken;
        output.StackSummaries && stacks.push(...filterStacks(output.StackSummaries, ignoreStackRegex));
    } while (nextToken);

    return stacks;
}

function filterStacks(stacks: StackSummary[], ignoreStackRegex?: RegExp): StackSummary[] {
    return stacks.filter((stack) => {
        if (ignoreStackRegex && stack.StackId && ignoreStackRegex.test(stack.StackId)) return false;
        if (ignoreStackRegex && stack.RootId && ignoreStackRegex.test(stack.RootId)) return false;

        return stack.DriftInformation && stack.DriftInformation.StackDriftStatus === 'DRIFTED';
    });
}

async function getStacksDriftDetails(
    cloudformation: CloudFormationClient,
    stacks: Stack[]
): Promise<StackWithDrifts[]> {
    const driftedStacks: StackWithDrifts[] = [];

    for (const stack of stacks) {
        const drifts = await cloudformation.send(new DescribeStackResourceDriftsCommand({ StackName: stack.StackId }));

        driftedStacks.push({
            StackId: stack.StackId,
            StackName: stack.StackName,
            Drifts: (drifts.StackResourceDrifts || []).filter((drift) => drift.StackResourceDriftStatus !== 'IN_SYNC'),
            HasMore: !!drifts.NextToken
        });
    }

    return driftedStacks;
}

async function sendEmail(
    opt: { destination: string; region: string; source: string },
    regions: string[],
    stacksWithDrifts: StackWithDrifts[][]
): Promise<void> {
    // Workaround for xray bug: https://github.com/aws/aws-xray-sdk-node/issues/439
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sesClient = AWSXRAY.captureAWSv3Client(new SESClient({ region: opt.region }) as any) as SESClient;

    await sesClient.send(
        new SendEmailCommand({
            Destination: { ToAddresses: [opt.destination] },
            Source: opt.source,
            Message: {
                Subject: {
                    Data: 'CFN Drift Detector Notification',
                    Charset: 'utf8'
                },
                Body: {
                    Html: {
                        Data: htmlNotifier(regions, stacksWithDrifts),
                        Charset: 'utf8'
                    }
                }
            }
        })
    );
}

export const handler = async (event: InputEvent) => {
    const regions = event.REGIONS?.split(',') || [];
    const ignoreStackRegex = strToRegExp(event.IGNORE_STACK_ID_REGEX);

    if (!event.SES_REGION || !event.SES_SOURCE || !event.SES_DESTINATION) throw new Error('Missing SES configuration');

    const driftedStacksPerRegion = await Promise.all(
        regions.map(async (region) => {
            const cloudformation = AWSXRAY.captureAWSv3Client(new CloudFormationClient({ region }));
            const stacks = await getStacks(cloudformation, ignoreStackRegex);
            console.log(`[${region}] Stacks found: ${stacks.length}`);
            return getStacksDriftDetails(cloudformation, stacks);
        })
    );

    await sendEmail(
        { region: event.SES_REGION, source: event.SES_SOURCE, destination: event.SES_DESTINATION },
        regions,
        driftedStacksPerRegion
    );
};
