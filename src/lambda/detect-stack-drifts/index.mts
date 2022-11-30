import {
    CloudFormationClient,
    DescribeStacksCommand,
    DetectStackDriftCommand,
    Stack
} from '@aws-sdk/client-cloudformation';
import AWSXRAY from 'aws-xray-sdk-core';

import { sleep, strToRegExp } from '../../utils.mjs';

interface InputEvent {
    REGIONS?: string;
    DRIFT_AGE_CHECK_HOURS?: string;
    IGNORE_STACK_ID_REGEX?: string;
}

const ALLOWED_STACK_STATUS = [
    'CREATE_COMPLETE',
    'UPDATE_COMPLETE',
    'UPDATE_ROLLBACK_COMPLETE',
    'UPDATE_ROLLBACK_FAILED'
];

/** 1000 * 60 * 60 */
const HOURS_IN_MS = 3_600_000;

/** CloudFormation seems to throttle every ~20 consecutive requests. */
const DETECT_DRIFT_SLEEP_THRESHOLD = 20;

async function getStacks(
    cloudformation: CloudFormationClient,
    driftAgeCheckHours: number,
    ignoreStackRegex?: RegExp
): Promise<Stack[]> {
    const lastDriftTimeLimit = new Date(Date.now() - driftAgeCheckHours * HOURS_IN_MS);
    const stacks: Stack[] = [];
    let nextToken: string | undefined;

    do {
        const output = await cloudformation.send(new DescribeStacksCommand({ NextToken: nextToken }));
        nextToken = output.NextToken;
        output.Stacks && stacks.push(...filterStacks(output.Stacks, lastDriftTimeLimit, ignoreStackRegex));
    } while (nextToken);

    return stacks;
}

function filterStacks(stacks: Stack[], lastDriftTimeLimit: Date, ignoreStackRegex?: RegExp): Stack[] {
    return stacks.filter((stack) => {
        if (!stack.StackStatus || !ALLOWED_STACK_STATUS.includes(stack.StackStatus)) return false;
        if (ignoreStackRegex && stack.StackId && ignoreStackRegex.test(stack.StackId)) return false;
        if (ignoreStackRegex && stack.RootId && ignoreStackRegex.test(stack.RootId)) return false;
        if (!stack.DriftInformation || stack.DriftInformation.StackDriftStatus === 'NOT_CHECKED') return true;
        if (
            stack.DriftInformation.LastCheckTimestamp &&
            stack.DriftInformation.LastCheckTimestamp <= lastDriftTimeLimit
        )
            return true;

        return false;
    });
}

async function detectDrift(cloudformation: CloudFormationClient, stacks: Stack[], maxRetries = 4): Promise<void> {
    let lastError;
    let retry = 0;

    for (const [index, stack] of stacks.entries()) {
        retry = 0;
        // Sleep after a consecutive number of req to reduce throttling occurence
        if (index && index % DETECT_DRIFT_SLEEP_THRESHOLD === 0) await sleep(1000);
        while (retry < maxRetries) {
            try {
                await cloudformation.send(new DetectStackDriftCommand({ StackName: stack.StackId }));
                break;
            } catch (err) {
                retry++;

                if (retry >= maxRetries) {
                    console.log(`${(err as Error).toString()} | ${stack.StackId || stack.StackName || ''} | ${index}`);
                    lastError = err;
                }

                await sleep(retry * 1000);
            }
        }
    }

    // Throw last error for lambda retry logic
    if (lastError) throw lastError;
}

export const handler = async (event: InputEvent) => {
    const regions = event.REGIONS?.split(',') || [];
    const ignoreStackRegex = strToRegExp(event.IGNORE_STACK_ID_REGEX);

    await Promise.all(
        regions.map(async (region) => {
            const cloudformation = AWSXRAY.captureAWSv3Client(new CloudFormationClient({ region }));
            const stacks = await getStacks(cloudformation, +(event.DRIFT_AGE_CHECK_HOURS || 0), ignoreStackRegex);
            console.log(`[${region}] Stacks found: ${stacks.length}`);

            await detectDrift(cloudformation, stacks);
        })
    );
};
