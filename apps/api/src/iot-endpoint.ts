import { DescribeEndpointCommand, IoTClient } from '@aws-sdk/client-iot';
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane';

export function createIotDataPlaneClientProvider(
  controlPlaneClient = new IoTClient({}),
): () => Promise<IoTDataPlaneClient> {
  let clientPromise: Promise<IoTDataPlaneClient> | undefined;
  return () => {
    clientPromise ??= controlPlaneClient
      .send(new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }))
      .then(({ endpointAddress }) => {
        if (!endpointAddress) throw new Error('AWS IoT DescribeEndpoint returned no endpoint');
        console.info(
          JSON.stringify({ event: 'timer-iot-endpoint-discovered', endpointHost: endpointAddress }),
        );
        return new IoTDataPlaneClient({ endpoint: `https://${endpointAddress}` });
      })
      .catch((error: unknown) => {
        clientPromise = undefined;
        const metadata = error as {
          name?: string;
          $metadata?: { httpStatusCode?: number; requestId?: string };
        };
        console.error(
          JSON.stringify({
            event: 'timer-iot-endpoint-discovery-error',
            errorName: metadata.name ?? 'UnknownError',
            httpStatusCode: metadata.$metadata?.httpStatusCode,
            requestId: metadata.$metadata?.requestId,
          }),
        );
        throw error;
      });
    return clientPromise;
  };
}
