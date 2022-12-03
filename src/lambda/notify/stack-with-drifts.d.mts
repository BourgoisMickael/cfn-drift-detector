import type { StackResourceDrift } from '@aws-sdk/client-cloudformation';

export interface StackWithDrifts {
    StackId?: string;
    StackName?: string;
    Drifts: StackResourceDrift[];
    HasMore: boolean;
}
