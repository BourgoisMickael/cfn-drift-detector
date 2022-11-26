import { CloudFormationClient, DescribeStacksCommand, DetectStackDriftCommand, Stack } from '@aws-sdk/client-cloudformation';

interface InputEvent {
    REGIONS?: string;
}

async function getStacks(cloudformation: CloudFormationClient): Promise<Stack[]> {
    const stacks: Stack[] = []
    let nextToken: string | undefined;

    do {
        const output = await cloudformation.send(new DescribeStacksCommand({ NextToken: nextToken }));
        nextToken = output.NextToken;
        output.Stacks && stacks.push(...output.Stacks);
    } while (nextToken)

    return stacks;
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

    await Promise.all(regions.map(async region => {
        const cloudformation = new CloudFormationClient({ region });
        const stacks = await getStacks(cloudformation);

        await detectDrift(cloudformation, stacks);
    }));
}