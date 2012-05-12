document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/compiled.js", "js/core/hwregs.js",
	"js/core/parallel.js", "js/core/memory.js", "js/core/recompiler.js", "js/core/asm.js",
	"js/core/mdec.js", "js/core/gpu.js", "js/debugger/comparator.js", "js/core/psx.js", "js/core/spu.js", function()
	{
		var bios = document.querySelector("#bios");
		var biosReader = new FileReader();
	
		function run()
		{
			psx = [
				new PSX(console, null, biosReader.result, [], []),
				new PSX(console, null, biosReader.result, [], [])];
			
			psx[0].reset();
			psx[1].reset();
			
			psx[1].memory.compiled.recompiler.tryToOptimize = false;
			
			var pc = [R3000a.bootAddress, R3000a.bootAddress];
			try
			{
				while (true)
				{
					var newPC0 = psx[0].cpu.executeBlock(pc[0]);
					var newPC1 = psx[1].cpu.executeBlock(pc[1]);
					if (newPC0 != newPC1)
						throw new Error("PCs differ after block " + pc[0].toString(16));
					
					for (var i = 0; i < 34; i++)
					{
						var gprA = psx[0].cpu.gpr[i];
						var gprB = psx[1].cpu.gpr[i];
						if (gprA != gprB)
							throw new Error("Register " + i + " differs after block " + pc[0].toString(16) + ": " + gprA + " vs " + gprB);
					}
					pc = [newPC0, newPC1];
				}
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
	})
);