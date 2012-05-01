document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/compiled.js", "js/core/hwregs.js",
	"js/core/parallel.js", "js/core/memory.js", "js/core/recompiler.js", "js/core/asm.js",
	"js/core/mdec.js", "js/debugger/comparator.js", function()
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
			
			var bios = new GeneralPurposeBuffer(biosReader.result);
			var mdec = new MotionDecoder();
			var hardwareRegisters = new HardwareRegisters(mdec);
			var parallelPort = new ParallelPortMemoryRange();
			var memory = new MemoryMap(hardwareRegisters, parallelPort, bios);
			var comparator = new StateComparator(dumpReader.result);
			
			var psx = new R3000a();
			psx.reset(memory);
			mdec.reset(memory);
			comparator.reset(memory);
			
			try
			{
				psx.run(R3000a.bootAddress, comparator);
			}
			catch (e)
			{
				document.querySelector("#crash").textContent = e.toString();
			}
		}
		
		function loadFiles()
		{
			if (bios.files.length == 0 || dump.files.length == 0)
				return;
			
			biosReader.onload = run;
			biosReader.readAsArrayBuffer(bios.files[0]);
			
			dumpReader.onload = run;
			dumpReader.readAsArrayBuffer(dump.files[0]);
		}
		
		bios.addEventListener("change", loadFiles);
		dump.addEventListener("change", loadFiles);
	})
);