document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/memory.js", "js/core/recompiler.js",
	function()
	{
	var status = new StatusQueue(document.getElementById("status"));
	
	function fail(message)
	{
		document.getElementById("fail-message").textContent = message;
		status.display(message, 'red');
		
		// that should be retro-compatible enough
		var screen = document.getElementById("screen");
		var sadDiv = screen.firstChild;
		while (sadDiv.nodeType != 1)
			sadDiv = sadDiv.nextSibling;
		
		screen.parentNode.replaceChild(sadDiv, screen);
		document.getElementById("rom-picker").disabled = "disabled";
	}
	
	// check for Function.bind
	if (Function.prototype.bind === undefined)
	{
		fail("Your browser does not support partial function application.");
		return;
	}
	
	// check for typed arrays
	if (window.ArrayBuffer === undefined)
	{
		fail("Your browser does not support the Typed Array API.");
		return;
	}
	
	// check for the endianness
	if (MemoryMap.endiannes == "big")
	{
		fail("Your computer uses a \"big endian\" architecture. JSX currently only works on \"little-endian\" architectures, like Intel computers.");
		return;
	}
	
	// check for WebGL
	var screen = document.getElementById("screen");
	var gl = screen.getContext("webgl");
	if (gl == null)
	{
		gl = screen.getContext("experimental-webgl");
		if (gl == null)
		{
			fail("Your browser does not support WebGL 3D graphics.");
			return;
		}
	}
	
	var psx = new R3000a();
	var memory = null;
	
	var biosPicker = document.getElementById("bios-picker");
	var diskPicker = document.getElementById("disk-picker");
	
	// this clears the file input in case it loads with a value, and is trivially
	// ignored otherwise
	// (this can happen with Mac OS X >= Lion, if webpages are restored when the
	// browser launches)
	biosPicker.value = "";
	diskPicker.value = "";
	
	biosPicker.addEventListener("change", function()
	{
		var reader = new FileReader();
		reader.onload = function()
		{
			memory = new MemoryMap(reader.result);
		}
		reader.readAsArrayBuffer(this.files[0]);
	});
	
	diskPicker.addEventListener("change", function()
	{
		var reader = new FileReader();
		reader.onload = function()
		{
			if (memory == null) // do it without a BIOS
				memory = new MemoryMap();
			
			try
			{
				var cdrom = new CDROM(reader.result);
			}
			catch (e)
			{
				status.display("The file you've selected is not a recognized disk image", "red");
				return;
			}
			
			psx.hardwareReset();
			psx.softwareReset(memory, cdrom);
			setTimeout(psx.execute.bind(psx, R3000a.bootAddress), 0);
		}
		reader.readAsArrayBuffer(this.files[0]);
	});
	
	status.display("← Waiting for a BIOS and an ISO...");
	}));