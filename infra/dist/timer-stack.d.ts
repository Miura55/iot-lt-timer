import { Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface TimerStackProps extends StackProps {
    environmentName: 'dev' | 'prod';
}
export declare class TimerStack extends Stack {
    constructor(scope: Construct, id: string, props: TimerStackProps);
    private nodeFunction;
}
