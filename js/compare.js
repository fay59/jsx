document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/compiled.js", "js/core/hwregs.js",
	"js/core/parallel.js", "js/core/memory.js", "js/core/recompiler.js", "js/core/asm.js",
	"js/core/mdec.js", "js/core/gpu.js", "js/debugger/comparator.js", "js/core/psx.js", function()
	{
		var bios = document.querySelector("#bios");
		var dump = document.querySelector("#dump");
		var biosReader = new FileReader();
		var dumpReader = new FileReader();
	
		var waitCount = 2;
		function run()
		{
			waitCount--;
			if (waitCount != 0)
				return;
			
			var psx = new PSX(console, null, biosReader.result, [], []);
			var comparator = new StateComparator(dumpReader.result);
			psx.reset();
			comparator.reset(psx.memory);
			
			try
			{
				psx.cpu.run(R3000a.bootAddress, comparator);
			}
			catch (e)
			{
				document.querySelector("#crash").textContent = e.toString();
			}
		}
		
		function loadFiles(reader)
		{
			reader.addEventListener("load", run);
			reader.readAsArrayBuffer(this.files[0]);
		}
		
		bios.addEventListener("change", loadFiles.bind(bios, biosReader));
		dump.addEventListener("change", loadFiles.bind(dump, dumpReader));
	})
);