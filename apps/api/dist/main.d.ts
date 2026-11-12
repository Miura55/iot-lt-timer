export declare const api: import("aws-lambda").APIGatewayProxyHandlerV2;
export declare const dispatch: (event: import("./timer/dispatcher.js").DispatchEvent) => Promise<{
    outcome: string;
} | {
    outcome: string;
    accepted: boolean;
}>;
export declare const reconcile: () => Promise<{
    checked: number;
    repaired: number;
}>;
