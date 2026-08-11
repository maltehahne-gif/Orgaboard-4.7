export function connectRealtime(onEvent:(event:any)=>void) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${proto}//${location.host}/ws/updates`)
  ws.onmessage = e => { try { onEvent(JSON.parse(e.data)) } catch {} }
  ws.onopen = () => ws.send('ready')
  return () => ws.close()
}
