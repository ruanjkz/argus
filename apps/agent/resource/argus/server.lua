local heartbeatInterval = GetConvarInt('argus_heartbeat_interval', 3000)

CreateThread(function()
    while true do
        PrintStructuredTrace(json.encode({ type = 'heartbeat', players = GetNumPlayerIndices() }))
        Wait(heartbeatInterval)
    end
end)
