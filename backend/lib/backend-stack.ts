import { Stack, Construct, StackProps, CfnOutput } from '@aws-cdk/core';
import { WebSocketApi, WebSocketStage } from '@aws-cdk/aws-apigatewayv2';
import { LambdaWebSocketIntegration } from '@aws-cdk/aws-apigatewayv2-integrations';
import { NodejsFunction } from '@aws-cdk/aws-lambda-nodejs';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { AthenaStartQueryExecution, AthenaGetQueryResults, LambdaInvoke } from '@aws-cdk/aws-stepfunctions-tasks';
import { IntegrationPattern, JsonPath, StateMachine } from '@aws-cdk/aws-stepfunctions';
import { Bucket } from '@aws-cdk/aws-s3';


export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'QueryResultBucket');

    /**
     * Step Functionsを作成
     */
    const queryJob = new AthenaStartQueryExecution(this, 'StartAthenaQuery', {
      queryString: 'SELECT * FROM cloudtrail_logs_partition_projection WHERE eventname = \'CreateTable\' AND  region = \'ap-northeast-1\' AND date BETWEEN \'2021/08/01\' AND \'2021/09/01\';',
      queryExecutionContext: {
        databaseName: 'default'
      },
      resultConfiguration: {
        outputLocation: {
          bucketName: bucket.bucketName,
          objectKey: 'results'
        }
      },
      integrationPattern: IntegrationPattern.RUN_JOB,
      resultPath: '$.StartAthenaQuery'
    });

    const getJob = new AthenaGetQueryResults(this, 'GetAthenaQueryResult', {
      queryExecutionId: JsonPath.stringAt('$.StartAthenaQuery.QueryExecution.QueryExecutionId'),
      resultPath: '$.GetAthenaQueryResult'
    });

    const pushResultFn = new NodejsFunction(this, 'PushResultFn', {
      entry: 'src/result-push.ts'
    });
    const pushResultJob = new LambdaInvoke(this, 'PushResult', {
      lambdaFunction: pushResultFn
    });

    const stateMachine = new StateMachine(this, 'StateMachine', {
      definition: queryJob.next(getJob).next(pushResultJob),
      tracingEnabled: true
    });

    const queryFn = new NodejsFunction(this, 'QueryFn', {
      entry: 'src/query.ts',
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn
      }
    });
    stateMachine.grantStartExecution(queryFn);

    /**
     * API Gatewayの作成
     */
    const webSocketApi = new WebSocketApi(this, 'WebSocketApi');
    webSocketApi.addRoute('query', {
      integration: new LambdaWebSocketIntegration({
        handler: queryFn
      })
    });
    new WebSocketStage(this, 'WebSocketApiDevStage', {
      webSocketApi,
      stageName: 'dev',
      autoDeploy: true
    });

    queryFn.addToRolePolicy(new PolicyStatement({
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`],
      actions: ['execute-api:ManageConnections']
    }));
    pushResultFn.addToRolePolicy(new PolicyStatement({
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`],
      actions: ['execute-api:ManageConnections']
    }));

    new CfnOutput(this, 'Url', {
      value: webSocketApi.apiEndpoint
    });
  }
}
