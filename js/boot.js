document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/compiled.js", "js/core/hwregs.js",
	"js/core/parallel.js", "js/core/memory.js", "js/core/recompiler.js", "js/core/asm.js",
	"js/core/mdec.js", "js/core/gpu.js", "js/core/psx.js", function()
	{
	document.querySelector("#bios").addEventListener("change", function()
	{
		var reader = new FileReader();
		reader.onload = function()
		{
			var psx = new PSX(PSX.noDiags, null, reader.result, [], []);
			psx.reset();
			
			try
			{
				var now = new Date();
				psx.runFrame();
				document.querySelector("#crash").textContent = (new Date() - now) / 1000 + " seconds";
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