local heartbeatInterval = GetConvarInt('argus_heartbeat_interval', 3000)
local snapshotInterval = GetConvarInt('argus_snapshot_interval', 5000)
local resourceName = GetCurrentResourceName()

local bans = {}
local banMessage = 'You are banned from this server.'

local function trace(payload)
    PrintStructuredTrace(json.encode(payload))
end

local function tokensOf(source)
    local tokens = {}
    for index = 0, GetNumPlayerTokens(source) - 1 do
        tokens[#tokens + 1] = GetPlayerToken(source, index)
    end
    return tokens
end

local function playerList()
    local list = {}
    for _, id in ipairs(GetPlayers()) do
        list[#list + 1] = {
            id = tonumber(id),
            name = GetPlayerName(id),
            ping = GetPlayerPing(id),
            identifiers = GetPlayerIdentifiers(id),
            tokens = tokensOf(id)
        }
    end
    return list
end

local function resourceList()
    local list = {}
    for index = 0, GetNumResources() - 1 do
        local name = GetResourceByFindIndex(index)
        if name then
            list[#list + 1] = { name = name, state = GetResourceState(name) }
        end
    end
    return list
end

local function sendPlayers()
    trace({ type = 'players', list = playerList() })
end

local function sendResources()
    trace({ type = 'resources', list = resourceList() })
end

local function loadBans()
    local raw = LoadResourceFile(resourceName, 'bans.json')
    local decoded = raw and json.decode(raw) or nil
    local lookup = {}
    if decoded and decoded.bans then
        for _, ban in ipairs(decoded.bans) do
            for _, identifier in ipairs(ban.identifiers or {}) do
                lookup[identifier] = ban
            end
        end
    end
    bans = lookup
    if decoded and decoded.message then
        banMessage = decoded.message
    end
end

local function findBan(identifiers)
    local now = os.time()
    for _, identifier in ipairs(identifiers) do
        local ban = bans[identifier]
        if ban and (not ban.expires or ban.expires == 0 or ban.expires > now) then
            return ban
        end
    end
    return nil
end

local function describeBan(ban)
    local expires = 'never'
    if ban.expires and ban.expires > 0 then
        expires = os.date('!%Y-%m-%d %H:%M UTC', ban.expires)
    end
    return banMessage:gsub('{reason}', ban.reason or ''):gsub('{expires}', expires):gsub('{id}', ban.id or '')
end

AddEventHandler('playerConnecting', function(_, _, deferrals)
    local source = source
    deferrals.defer()
    Wait(0)
    local identifiers = GetPlayerIdentifiers(source)
    for _, token in ipairs(tokensOf(source)) do
        identifiers[#identifiers + 1] = token
    end
    local ban = findBan(identifiers)
    if ban then
        trace({ type = 'ban_hit', id = ban.id, name = GetPlayerName(source), identifiers = identifiers })
        deferrals.done(describeBan(ban))
        return
    end
    deferrals.done()
end)

AddEventHandler('playerJoining', function()
    SetTimeout(500, sendPlayers)
end)

AddEventHandler('playerDropped', function()
    SetTimeout(500, sendPlayers)
end)

AddEventHandler('onResourceStart', function()
    SetTimeout(200, sendResources)
end)

AddEventHandler('onResourceStop', function()
    SetTimeout(200, sendResources)
end)

RegisterCommand('argus_reload_bans', function(source)
    if source ~= 0 then return end
    loadBans()
end, true)

RegisterCommand('argus_warn', function(source, args)
    if source ~= 0 then return end
    local target = tonumber(args[1])
    if not target or not GetPlayerName(target) then return end
    local message = table.concat(args, ' ', 2)
    TriggerClientEvent('chat:addMessage', target, { color = { 255, 180, 0 }, args = { 'Staff', message } })
end, true)

RegisterCommand('argus_kick', function(source, args)
    if source ~= 0 then return end
    local target = tonumber(args[1])
    if not target or not GetPlayerName(target) then return end
    DropPlayer(target, table.concat(args, ' ', 2))
end, true)

loadBans()

CreateThread(function()
    while true do
        trace({ type = 'heartbeat', players = GetNumPlayerIndices() })
        Wait(heartbeatInterval)
    end
end)

CreateThread(function()
    Wait(1000)
    sendResources()
    while true do
        sendPlayers()
        Wait(snapshotInterval)
    end
end)

CreateThread(function()
    while true do
        Wait(30000)
        sendResources()
    end
end)
