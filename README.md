# This is based on the idea of 
# https://github.com/unremem/PoBTradeHelper 
# ported to work for PoE2

# PoB HTTP Server — Chrome Extension

This repository hosts a Chrome extension that sends searched  item on https://www.pathofexile.com/trade2 to a local **Path of Building (PoB) HTTP server** to calculate item impact.  

It also supports 

- **rune overrides** 

- **socket adjustments**

- **amulet enchant** 


### Quick start (development)

1. copy the Repo to C:\ChrometoPob2 

2. change the paths in C:\ChrometoPob2\server\app.py and save 

	make sure Path of Building Community (PoE2) is installed
	and you have a build created/imported and saved

    ## < Path of Building path
	POB_INSTALL = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)" 
	
	POB_PATH    = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)" 
    # < save file with the Build
	HARDCODED_BUILD = r"C:\Users\username\Documents\Path of Building (PoE2)\Builds\1\Shockburster Deadeye.xml" 
	# < Path of Building path to ModRunes.lua and QueryMods.lua
	MOD_RUNES_PATH = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)\Data\ModRunes.lua" 
	
	MOD_ENCHANTS_PATH = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)\Data\QueryMods.lua" 

    ### < were the repo is located on the harddrive
	USER_POB_WRAPPER = r"C:\ChrometoPob2" 
	

3. #go to C:\ChrometoPob2\server and start  > run.bat <
	the first time should take a while it must install some python pakages

	it should look something like this
	
	-------------------------------------------------------------------------------------------------------
	
	Requirement already satisfied: pip in c:\chrometopob2\server\.venv\lib\site-packages (24.3.1)
	Collecting pip
	Downloading ...
	Successfully installed ...
	
	[32mINFO←[0m:     Will watch for changes in these directories: ['C:\\ChrometoPob2\\server']
	[32mINFO←[0m:     Uvicorn running on ←[1mhttp://127.0.0.1:5000←[0m (Press CTRL+C to quit)
	[32mINFO←[0m:     Started reloader process [←[36m←[1m8292←[0m] using ←[36m←[1mStatReload←[0m
	[32mINFO←[0m:     Started server process [←[36m16612←[0m]
	[32mINFO←[0m:     Waiting for application startup.
	[32mINFO←[0m:     Application startup complete.

    -------------------------------------------------------------------------------------------------------



3. #Load the extension into Chrome (Developer Mode):

   - Open `chrome://extensions`
   - Toggle **Developer mode** (top-right)
   - Click **Load unpacked** and select the folder that contains `manifest.json` ChrometoPob2\extension
   



2. #Open https://www.pathofexile.com/trade2 and use the extension panel.  

   


## License
MIT — see [LICENSE](LICENSE).
