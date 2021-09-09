import { APIGatewayProxyHandler } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { StartExecutionCommand, SFNClient } from '@aws-sdk/client-sfn';
import { captureAWSv3Client, enableAutomaticMode } from 'aws-xray-sdk';


export const handler: APIGatewayProxyHandler = async (event, context) => {
  enableAutomaticMode()

  console.log(JSON.stringify({
    ...event,
    logName: 'event'
  }))
  console.log(JSON.stringify({
    ...context,
    logName: context
  }))

  const connectionId = event.requestContext.connectionId
  if (connectionId === undefined) {
    throw new Error("cannot get connection id")
  }

  const sfnClient = captureAWSv3Client(new SFNClient({}))
  const output = await sfnClient.send(new StartExecutionCommand({
    input: JSON.stringify({
      apiId: event.requestContext.apiId,
      connectionId
    }),
    stateMachineArn: process.env.STATE_MACHINE_ARN
  }));

  const endpoint = `https://${event.requestContext.apiId}.execute-api.ap-northeast-1.amazonaws.com/dev`
  const apiGwClient = captureAWSv3Client(
    new ApiGatewayManagementApiClient({endpoint}))

  await apiGwClient.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    // @ts-ignore
    Data: `Processing started with execution ARN: ${output.executionArn}`
  }))

  return {
    statusCode: 200,
    body: ''
  }
}
