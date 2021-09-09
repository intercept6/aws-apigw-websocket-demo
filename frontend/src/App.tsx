import React from 'react';

function App() {
  const socket = new WebSocket(process.env.REACT_APP_WEB_SOCKET_API_URL!)
  const [result, setResult] = React.useState<Object[]>([{}]);

  React.useEffect(() => {
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.message != null) {
        alert(data.message)
      }

      if (Array.isArray(data.results)) {
        setResult(data.results)
      }
    }

    return () => {
      socket.close()
    }
  })

  const handleOnClick:   React.MouseEventHandler<HTMLButtonElement> = () => {
    socket.send(JSON.stringify({
      action: 'query'
    }))
  }

  return (
    <>
      <p>SELECT * FROM cloudtrail_logs_partition_projection WHERE eventname = 'CreateTable' AND  region = 'ap-northeast-1' AND date BETWEEN '2021/08/01' AND '2021/09/01';</p>
      <button onClick={handleOnClick}>クエリ開始</button>

      <p>result: {JSON.stringify(result)}</p>
    </>
  );
}

export default App;
