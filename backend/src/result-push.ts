import { Context } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { captureAWSv3Client, enableAutomaticMode } from 'aws-xray-sdk';


interface Event {
  apiId: string
  connectionId: string
  GetAthenaQueryResult: {
    NextToken?: string,
    ResultSet: {
      ResultSetMetadata: {
        ColumnInfo: {
          CaseSensitive: boolean,
          CatalogName: string,
          Label: string,
          Name: string,
          Nullable: string,
          Precision: number,
          Scale: number,
          SchemaName: string,
          TableName: string,
          Type: string
        }[]
      },
      Rows: { Data: { VarCharValue?: string }[] }[]
    },
    UpdateCount: number
  },
}


export const handler = async (event: Event, context: Context) => {
  enableAutomaticMode()
  console.log(JSON.stringify({
    ...event,
    logName: 'event'
  }));
  console.log(JSON.stringify({
    ...context,
    logName: context
  }));


  const columns = event.GetAthenaQueryResult.ResultSet.Rows[0].Data.map(({VarCharValue}) => VarCharValue!);
  const data = event.GetAthenaQueryResult.ResultSet.Rows
    .filter((_, idx) => idx !== 0)
    .map(({Data}) => Data
      .map(({VarCharValue}) => VarCharValue ?? null))
    .map((v) => {
      return v.reduce((prev, cur, idx) => {
        return {
          ...prev,
          [columns[idx]]: cur
        }
      }, {})
    })

  const endpoint = `https://${event.apiId}.execute-api.ap-northeast-1.amazonaws.com/dev`;
  const client = captureAWSv3Client(new ApiGatewayManagementApiClient({endpoint}));

  await client.send(new PostToConnectionCommand({
    ConnectionId: event.connectionId,
    // @ts-ignore
    Data: JSON.stringify({
      results: data
    })
  }));


  return {
    statusCode: 200,
    body: ''
  };
};
