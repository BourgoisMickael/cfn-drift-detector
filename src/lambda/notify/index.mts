import {
    CloudFormationClient,
    DescribeStackResourceDriftsCommand,
    ListStacksCommand,
    Stack,
    StackSummary
} from '@aws-sdk/client-cloudformation';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

import { strToRegExp } from '../../utils.mjs';
import { htmlNotifier } from './html-notifier.mjs';
import { jsonNotifier } from './json-notifier.mjs';
import type { StackWithDrifts } from './stack-with-drifts.mjs';

const AWSXRAY = process.env.XRAY_TRACING === 'Active' && (await import('aws-xray-sdk-core')).default;

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

async function sendHtmlEmail(
    opt: { destination: string; region: string; source: string },
    regions: string[],
    stacksWithDrifts: StackWithDrifts[][]
): Promise<void> {
    const sesClient = AWSXRAY
        ? // Workaround for xray bug: https://github.com/aws/aws-xray-sdk-node/issues/439
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (AWSXRAY.captureAWSv3Client(new SESClient({ region: opt.region }) as any) as SESClient)
        : new SESClient({ region: opt.region });

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

async function sendTextEmail(
    opt: { destination: string; region: string },
    regions: string[],
    stacksWithDrifts: StackWithDrifts[][]
) {
    const snsClient = AWSXRAY
        ? // Workaround for xray bug: https://github.com/aws/aws-xray-sdk-node/issues/439
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (AWSXRAY.captureAWSv3Client(new SNSClient({ region: opt.region }) as any) as SNSClient)
        : new SNSClient({ region: opt.region });

    await snsClient.send(
        new PublishCommand({
            TopicArn: process.env.TOPIC_ARN,
            Subject: 'CFN Drift Detector Notification',
            Message: jsonNotifier(regions, stacksWithDrifts)
        })
    );
}

export const handler = async () => {
    if (!process.env.DESTINATION) throw new Error('Missing DESTINATION');
    if (!process.env.TOPIC_ARN?.length && !process.env.SES_SOURCE) throw new Error('Missing SES_SOURCE');

    const regions = process.env.REGIONS?.split(',').map((region) => region.trim()) || [];
    const ignoreStackRegex = strToRegExp(process.env.IGNORE_STACK_ID_REGEX);

    const driftedStacksPerRegion = await Promise.all(
        regions.map(async (region) => {
            const cloudformation = AWSXRAY
                ? AWSXRAY.captureAWSv3Client(new CloudFormationClient({ region }))
                : new CloudFormationClient({ region });
            const stacks = await getStacks(cloudformation, ignoreStackRegex);
            console.log(`[${region}] Stacks found: ${stacks.length}`);
            return getStacksDriftDetails(cloudformation, stacks);
        })
    );

    if (driftedStacksPerRegion.some((stacks) => stacks.some((stack) => stack.Drifts.length > 0))) {
        if (process.env.TOPIC_ARN?.length) {
            // Use SNS
            await sendTextEmail(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                { region: process.env.AWS_REGION!, destination: process.env.DESTINATION },
                regions,
                driftedStacksPerRegion
            );
        } else {
            // Use SES
            await sendHtmlEmail(
                {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    region: process.env.AWS_REGION!,
                    destination: process.env.DESTINATION,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    source: process.env.SES_SOURCE!
                },
                regions,
                driftedStacksPerRegion
            );
        }
    } else {
        console.log('No drift found');
    }
};
