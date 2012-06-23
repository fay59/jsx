document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/compiled.js", "js/core/hwregs.js",
	"js/core/parallel.js", "js/core/memory.js", "js/core/recompiler.js",
	"js/core/recompiler-old.js", "js/core/asm.js", "js/core/mdec.js", "js/core/gpu.js",
	"js/core/spu.js", "js/core/counters.js", "js/core/psx.js",
	"js/debugger/branch-comparator.js",
	function()
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
			var comparator = new BranchComparator(dumpReader.result);
			psx.reset();
			comparator.reset(psx.memory);
			
			try
			{
				var pc = R3000a.bootAddress;
				while (true)
					pc = psx.cpu.run(pc, comparator);
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