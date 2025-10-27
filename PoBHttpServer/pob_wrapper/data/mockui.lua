-- mockui.lua
-- Headless/mock UI so Path of Building can run without a window

-- ==== locals / shims ====
local t_insert, t_remove = table.insert, table.remove
local m_min, m_max, m_floor, m_abs = math.min, math.max, math.floor, math.abs
local s_format = string.format

if not unpack     then unpack     = table.unpack end
if not table.unpack then table.unpack = unpack end
if not loadstring then loadstring = load        end
if not bit        then bit        = require('bit') end

-- ==== callback plumbing ====
callbackTable = {}
mainObject = nil

function runCallback(name, ...)
    if callbackTable[name] then
        return callbackTable[name](...)
    elseif mainObject and mainObject[name] then
        return mainObject[name](mainObject, ...)
    end
end
function SetCallback(name, func) callbackTable[name] = func end
function GetCallback(name) return callbackTable[name] end
function SetMainObject(obj) mainObject = obj end

-- ==== image handles (stubs) ====
imageHandleClass = {}
imageHandleClass.__index = imageHandleClass
function NewImageHandle() return setmetatable({}, imageHandleClass) end
function imageHandleClass:Load(_)   self.valid = true  end
function imageHandleClass:Unload()  self.valid = false end
function imageHandleClass:IsValid() return self.valid end
function imageHandleClass:SetLoadingPriority(_) end
function imageHandleClass:ImageSize() return 1, 1 end

-- ==== rendering (stubs) ====
function RenderInit() end
function GetScreenSize() return 1920, 1080 end
function SetClearColor(_,_,_,_) end
function SetDrawLayer(_,_) end
function SetViewport(_,_,_,_) end
function SetDrawColor(_,_,_,_) end
function DrawImage(_,_,_,_,_,_,_,_,_) end
function DrawImageQuad(_,_,_,_,_,_,_,_,_,_,_,_,_,_,_) end
function DrawString(_,_,_,_,_,_) end
function DrawStringWidth(_,_,_) return 1 end
function DrawStringCursorIndex(_,_,_,_,_) return 0 end
function StripEscapes(text) return text:gsub("^%d",""):gsub("^x%x%x%x%x%x%x","") end
function GetAsyncCount() return 0 end

-- ==== search (stub) ====
function NewFileSearch() end

-- ==== general functions (stubs / minimal) ====
function SetWindowTitle(_) end
function GetCursorPos() return 0, 0 end
function SetCursorPos(_, _) end
function ShowCursor(_) end
function IsKeyDown(_) end
function Copy(_) end
function Paste() end
function Deflate(_) return "" end
function Inflate(_) return "" end
function GetTime() return 0 end

function GetScriptPath()  return os.getenv('POB_SCRIPTPATH')  end
function GetRuntimePath() return os.getenv('POB_RUNTIMEPATH') end
function GetUserPath()    return os.getenv('POB_USERPATH')    end

function MakeDir(_) end
function RemoveDir(_) end
function SetWorkDir(_) end
function GetWorkDir() return "" end

function LaunchSubScript(_, _, _, ...) end

-- ==== networking: DownloadPage (uses lcurl.safe table opts) ====
function DownloadPage(self, url, callback, cookies)
    ConPrintf("Downloading: %s", tostring(url))

    local curl = require("lcurl.safe")
    local page = ""
    local easy = curl.easy()

    local opts = {
        url             = tostring(url),  -- string key (safe API)
        accept_encoding = "",
        writefunction   = function(chunk)
            page = page .. chunk
            return true
        end,
    }
    if cookies and cookies ~= ""   then
        if type(cookies) == "table" then
            local parts = {}
            for k,v in pairs(cookies) do
                parts[#parts+1] = tostring(k) .. "=" .. tostring(v)
            end
            opts.cookie = table.concat(parts, "; ")
        elseif type(cookies) ~= "string" then
            opts.cookie = tostring(cookies)
        else
            opts.cookie = cookies
        end
    end
    if _G.proxyURL and _G.proxyURL ~= "" then opts.proxy  = _G.proxyURL end

    local ok, e1 = pcall(function() easy:setopt(opts) end)
    if not ok then return callback(nil, tostring(e1)) end
    local _, err = easy:perform()
    local code = easy:getinfo(curl.INFO_RESPONSE_CODE)
    easy:close()

    local errMsg
    if err then
        errMsg = err:msg()
    elseif code ~= 200 then
        errMsg = "Response code: " .. tostring(code)
    elseif #page == 0 then
        errMsg = "No data returned"
    end

    ConPrintf("Download status: %s", errMsg or "OK")
    if errMsg then callback(nil, errMsg) else callback(page, nil) end
end

-- ==== subscript / module helpers ====
function AbortSubScript(_) end
function IsSubScriptRunning(_) end

-- Raw loader that errors on failure
function LoadModule(fileName, ...)
    if not fileName:match("%.lua$") then fileName = fileName .. ".lua" end
    local fn, err = loadfile(fileName)
    if not fn then
        error("LoadModule() error loading '"..tostring(fileName).."': "..tostring(err))
    end
    return fn(...)
end

-- Protected call that returns (nil, ...) on success, or error string on failure
function PCall(func, ...)
    local ret = { pcall(func, ...) }
    if ret[1] then
        table.remove(ret, 1)
        return nil, table.unpack(ret)
    else
        return ret[2]
    end
end

-- Protected loader that mirrors PCall return style
function PLoadModule(fileName, ...)
    if not fileName:match("%.lua$") then fileName = fileName .. ".lua" end
    local fn, err = loadfile(fileName)
    if not fn then
        error("PLoadModule() error loading '"..tostring(fileName).."': "..tostring(err))
    end
    return PCall(fn, ...)
end

function ConPrintf(fmt, ...) -- uncomment to see PoB logs in Python output:
    --print(string.format(fmt, ...))
end
function ConPrintTable(_, _) end
function ConExecute(_) end
function ConClear() end
function SpawnProcess(_, _) end
function OpenURL(_) end
function SetProfiling(_) end
function Restart() end
function Exit() end

function isValidString(s, expression)
    return s and s:match(expression or '%S') and true or false
end

-- ==== boot PoB core ====
dofile("Launch.lua")  -- PoB sets mainObject via SetMainObject(...)

-- Patch UI-dependent bits
mainObject.DownloadPage = DownloadPage
mainObject.CheckForUpdate = function() end

runCallback("OnInit")
runCallback("OnFrame") -- first frame to finish init

if mainObject.promptMsg then
    error("ERROR: "..tostring(mainObject.promptMsg))
end

-- ==== convenience for wrapper ====
build = mainObject.main.modes["BUILD"]
calcs = build.calcsTab.calcs

function newBuild()
    mainObject.main:SetMode("BUILD", false, "Headless PoB")
    runCallback("OnFrame")
end

function loadBuildFromPath(path)
    local _, fileName = string.match(path, "(.-)([^\\/]-%.?[^%.\\/]*)$")
    local buildName = (fileName or ""):gsub("%.xml$","")
    mainObject.main:SetMode("BUILD", path, buildName)
    runCallback("OnFrame")
end

function loadBuildFromXML(xmlText)
    mainObject.main:SetMode("BUILD", false, "", xmlText)
    runCallback("OnFrame")
end

function loadBuildFromJSON(getItemsJSON, getPassiveSkillsJSON)
    mainObject.main:SetMode("BUILD", false, "")
    runCallback("OnFrame")
    local charData = build.importTab:ImportItemsAndSkills(getItemsJSON)
    build.importTab:ImportPassiveTreeAndJewels(getPassiveSkillsJSON, charData)
end

function saveBuildToXml()
    local xmlText = build:SaveDB("dummy")
    if not xmlText then
        print("Failed to prepare save XML"); os.exit(1)
    end
    return xmlText
end

function saveText(filename, text)
    local f = assert(io.open(filename, "w+"))
    f:write(text); f:close()
end

function loadText(fileName)
    local f = io.open(fileName, "r")
    if not f then print("Failed to load file: "..tostring(fileName)); os.exit(1) end
    local txt = f:read("*a"); f:close(); return txt
end

function loadTextLines(fileName)
    local f = io.open(fileName, "r")
    if not f then print("Failed to load file: "..tostring(fileName)); os.exit(1) end
    local out = {}; for line in f:lines() do out[#out+1]=line end
    f:close(); return out
end

-- Minimal tooltip for pobinterface.testItemForDisplay
FakeTooltip = { lines = {}, sep = '----' }
function FakeTooltip:new() local o={}; setmetatable(o, self); self.__index=self; self.lines={}; return o end
function FakeTooltip:AddLine(_, txt) table.insert(self.lines, txt) end
function FakeTooltip:AddSeparator(_, _) table.insert(self.lines, self.sep) end