document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/compiled.js", "js/core/hwregs.js",
	"js/core/parallel.js", "js/core/memory.js", "js/core/recompiler.js", "js/core/asm.js",
	"js/core/mdec.js", "js/core/gpu.js", "js/core/spu.js", "js/core/counters.js", "js/core/psx.js", function()
	{
	document.querySelector("#bios").addEventListener("change", function()
	{
		var reader = new FileReader();
		reader.onload = function()
		{
			var tv = document.querySelector("#tv");
			var gl = tv.getContext("experimental-webgl");
			window.psx = new PSX(PSX.noDiags, gl, reader.result, [], []);
			window.psx.reset();
			with (window.psx.cpu.memory.compiled.recompiler.optimizations)
			{
				bypassReadMethods = false;
				bypassWriteMethods = false;
			}
			
			try
			{
				const interruptCount = 5000;
				var timerName = interruptCount + " interrupts";
				console.time(timerName);
				console.profile(timerName);
				for (var i = 0; i < interruptCount; i++)
				{
					console.log("Running frame...");
					console.log("pc=" + window.psx.pc.toString(16));
					window.psx.runFrame();
				}
				console.profileEnd(timerName);
				console.timeEnd(timerName);
				document.querySelector("#crash").textContent = "Done.";
			}
			catch (e)
			{
				console.error(e);
				document.querySelector("#crash").textContent = e.toString();
				
				var totalJitted = 0;
				var totalUnimplemented = 0;
				var unimplemented = {};
				
				var compiled = psx.memory.compiled.compiled;
				var recompiler = psx.memory.compiled.recompiler;
				for (var fn in psx.memory.compiled.compiled)
				{
					var func = compiled[fn];
					totalJitted += func.totalCount;
					for (var key in func.unimplemented)
					{
						if (!(key in unimplemented))
							unimplemented[key] = 0;
						
						var count = func.unimplemented[key];
						unimplemented[key] += count;
						totalUnimplemented += count;
					}
				}
				
				totalJitted += recompiler.jittedInstructions;
				for (var key in recompiler.unimplementedInstructionCounts)
				{
					if (!(key in unimplemented))
						unimplemented[key] = 0;
					
					var count = recompiler.unimplementedInstructionCounts[key];
					unimplemented[key] += count;
					totalUnimplemented += count;
				}
				
				var list = document.querySelector("#missing");
				for (var key in unimplemented)
				{
					var count = unimplemented[key];
					var li = document.createElement('li');
					li.textContent = key + " (" + count + ")";
					list.appendChild(li);
				}
				document.querySelector("#missing-count").textContent = totalUnimplemented + "/" + totalJitted;
			}
		}
		
		reader.readAsArrayBuffer(this.files[0]);
	});
}));