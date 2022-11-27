import { CloudFormationClient, DescribeStacksCommand, DetectStackDriftCommand, Stack } from '@aws-sdk/client-cloudformation';
import { strToRegExp } from '../../utils.mjs';

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
]

/** 1000 * 60 * 60 */
const HOURS_IN_MS = 3_600_000

async function getStacks(cloudformation: CloudFormationClient): Promise<Stack[]> {
    const stacks: Stack[] = []
    let nextToken: string | undefined;

    do {
        const output = await cloudformation.send(new DescribeStacksCommand({ NextToken: nextToken, StackName: 'cfn-drift-detector-test' }));
        nextToken = output.NextToken;
        output.Stacks && stacks.push(...output.Stacks);
    } while (nextToken)

    return stacks;
}


function filterStacks(stacks: Stack[], driftAgeCheckHours: number, ignoreStackRegex?: RegExp): Stack[] {
    const lastDriftTimeLimit = new Date(Date.now() - driftAgeCheckHours * HOURS_IN_MS);

    return stacks.filter(stack => 
        stack.StackStatus && ALLOWED_STACK_STATUS.includes(stack.StackStatus)
        && (!stack.DriftInformation || stack.DriftInformation.StackDriftStatus === 'NOT_CHECKED')
        && (!stack.DriftInformation?.LastCheckTimestamp || stack.DriftInformation.LastCheckTimestamp <= lastDriftTimeLimit)
        && (!ignoreStackRegex || !stack.StackId || !ignoreStackRegex.test(stack.StackId) || ( stack.RootId && !ignoreStackRegex.test(stack.RootId)))
    )
}

async function detectDrift(cloudformation: CloudFormationClient, stacks: Stack[]): Promise<void> {
    let lastError;

    for (const stack of stacks) {
        try {
            await cloudformation.send(new DetectStackDriftCommand({ StackName: stack.StackId }));
        } catch (err) {
            console.log(`${err} | ${stack.StackId}`)
            lastError = err
        }
    }

    // Throw last error for lambda retry logic
    if (lastError) throw lastError
}

export const handler = async (event: InputEvent) => {
    const regions = event.REGIONS?.split(',') || [];
    const ignoreStackRegex = strToRegExp(event.IGNORE_STACK_ID_REGEX)

    await Promise.all(regions.map(async region => {
        const cloudformation = new CloudFormationClient({ region });
        const stacks = filterStacks(await getStacks(cloudformation), +(event.DRIFT_AGE_CHECK_HOURS || 0), ignoreStackRegex);

       await detectDrift(cloudformation, stacks);
    }));
}